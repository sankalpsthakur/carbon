#!/usr/bin/env node
'use strict';

/**
 * CarbonKit REST API Gateway
 *
 * Unified HTTP entry point that proxies to individual MCP servers (8401-8406).
 * Provides:
 * - RESTful routes mapped to MCP tool calls
 * - Multipart file upload handling (CSV, PDF)
 * - JWT bearer token validation
 * - CORS for browser clients
 *
 * Port: 8400
 *
 * Usage:
 *   CARBONKIT_MCP_TRANSPORT=http node rest-gateway.js
 *
 * Routes:
 *   POST /api/ingestion-jobs/upload → calc.ingest
 *   GET  /api/ingestion-jobs/:jobId → calc.list_ingestion_jobs + filter
 *   POST /api/emission-factors      → calc.add_emission_factor
 *   GET  /api/emission-factors      → calc.list_emission_factors
 *   POST /api/tools/call            → Proxy to any MCP tool
 */

const http = require('http');
const { parse: parseUrl } = require('url');
const { authMiddleware } = require('./auth');
const { createLogger } = require('./logger');

const log = createLogger('rest-gateway');

// MCP server ports
const MCP_PORTS = {
  calc: 8401,
  exec: 8402,
  strategy: 8403,
  scope12: 8404,
  swarm: 8405,
  connectors: 8406,
};

/**
 * Proxy a JSON-RPC request to an MCP server.
 * @param {string} server - Server name ('calc', 'exec', etc.)
 * @param {string} method - JSON-RPC method
 * @param {object} params - Method parameters
 * @returns {Promise<object>} JSON-RPC result
 */
function mcpCall(server, method, params) {
  return new Promise((resolve, reject) => {
    const port = MCP_PORTS[server];
    if (!port) {
      return reject(new Error(`Unknown MCP server: ${server}`));
    }

    const reqBody = JSON.stringify({
      jsonrpc: '2.0',
      id: Math.random().toString(36).slice(2),
      method,
      params: params || {},
    });

    const options = {
      hostname: 'localhost',
      port,
      path: '/tools/call',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(reqBody),
      },
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          const response = JSON.parse(body);
          if (response.error) {
            reject(new Error(response.error.message || 'MCP call failed'));
          } else {
            resolve(response.result);
          }
        } catch (err) {
          reject(new Error(`Failed to parse MCP response: ${err.message}`));
        }
      });
    });

    req.on('error', (err) => {
      reject(new Error(`MCP server ${server} unreachable: ${err.message}`));
    });

    req.write(reqBody);
    req.end();
  });
}

/**
 * Parse multipart/form-data manually (no dependencies).
 * Extracts fields and files.
 */
const MAX_UPLOAD_BYTES = parseInt(process.env.CARBONKIT_MAX_UPLOAD_BYTES, 10) || 10 * 1024 * 1024; // 10MB
const MAX_JSON_BYTES = 1 * 1024 * 1024; // 1MB for JSON body routes

function readJsonBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error(`Request body too large (>${maxBytes} bytes)`));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (e) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function parseMultipart(req, boundary) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_UPLOAD_BYTES) {
        reject(new Error(`Upload too large (>${MAX_UPLOAD_BYTES} bytes)`));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const buffer = Buffer.concat(chunks);
      const parts = [];
      const boundaryBuf = Buffer.from(`--${boundary}`);
      const endBoundaryBuf = Buffer.from(`--${boundary}--`);

      let idx = 0;
      while (idx < buffer.length) {
        const nextBoundary = buffer.indexOf(boundaryBuf, idx);
        if (nextBoundary === -1) break;

        idx = nextBoundary + boundaryBuf.length;

        // Check for end boundary
        if (buffer.slice(idx, idx + 2).toString() === '--') break;

        // Skip CRLF after boundary
        if (buffer[idx] === 0x0d && buffer[idx + 1] === 0x0a) idx += 2;

        // Parse headers
        const headerEnd = buffer.indexOf('\r\n\r\n', idx);
        if (headerEnd === -1) break;

        const headersText = buffer.slice(idx, headerEnd).toString('utf8');
        idx = headerEnd + 4;

        // Find next boundary
        const nextPart = buffer.indexOf(boundaryBuf, idx);
        if (nextPart === -1) break;

        const content = buffer.slice(idx, nextPart - 2); // -2 for CRLF before boundary
        idx = nextPart;

        // Parse Content-Disposition
        const dispositionMatch = /Content-Disposition:\s*form-data;\s*name="([^"]+)"(?:;\s*filename="([^"]+)")?/i.exec(headersText);
        if (!dispositionMatch) continue;

        const name = dispositionMatch[1];
        const filename = dispositionMatch[2];

        if (filename) {
          // File part
          const contentTypeMatch = /Content-Type:\s*([^\r\n]+)/i.exec(headersText);
          parts.push({
            type: 'file',
            name,
            filename,
            contentType: contentTypeMatch ? contentTypeMatch[1].trim() : 'application/octet-stream',
            data: content,
          });
        } else {
          // Field part
          parts.push({
            type: 'field',
            name,
            value: content.toString('utf8'),
          });
        }
      }

      const fields = {};
      const files = {};
      for (const part of parts) {
        if (part.type === 'field') {
          fields[part.name] = part.value;
        } else {
          files[part.name] = {
            filename: part.filename,
            contentType: part.contentType,
            data: part.data,
          };
        }
      }

      resolve({ fields, files });
    });
    req.on('error', reject);
  });
}

/**
 * Route handlers
 */
const routes = {
  // POST /api/ingestion-jobs/upload
  'POST /api/ingestion-jobs/upload': async (req, res, parsedUrl) => {
    const contentType = req.headers['content-type'] || '';
    const boundaryMatch = /boundary=([^;]+)/.exec(contentType);

    if (!boundaryMatch) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing multipart boundary' }));
      return;
    }

    try {
      const { fields, files } = await parseMultipart(req, boundaryMatch[1]);

      if (!files.file) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'No file uploaded' }));
        return;
      }

      // Convert CSV buffer to base64 for transmission
      const csvData = files.file.data.toString('utf8');

      const result = await mcpCall('calc', 'tools/call', {
        name: 'calc.ingest',
        arguments: {
          csv_data: csvData,
          basis: fields.basis || 'spend',
          currency: fields.currency || 'USD',
        },
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (err) {
      log.error('Upload failed', { error: err.message });
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  },

  // GET /api/ingestion-jobs/:jobId
  'GET /api/ingestion-jobs/:jobId': async (req, res, parsedUrl) => {
    const match = /\/api\/ingestion-jobs\/([^\/]+)/.exec(parsedUrl.pathname);
    if (!match) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid job ID' }));
      return;
    }

    const jobId = match[1];

    try {
      const result = await mcpCall('calc', 'tools/call', {
        name: 'calc.list_ingestion_jobs',
        arguments: {},
      });

      // Filter to specific job
      const job = result.jobs?.find(j => j.id === jobId);
      if (!job) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Job not found' }));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(job));
    } catch (err) {
      log.error('Job fetch failed', { error: err.message, jobId });
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  },

  // POST /api/emission-factors
  'POST /api/emission-factors': async (req, res, parsedUrl) => {
    try {
      const data = await readJsonBody(req, MAX_JSON_BYTES);
      const result = await mcpCall('calc', 'tools/call', {
        name: 'calc.add_emission_factor',
        arguments: data,
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (err) {
      log.error('Add emission factor failed', { error: err.message });
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  },

  // GET /api/emission-factors
  'GET /api/emission-factors': async (req, res, parsedUrl) => {
    try {
      const result = await mcpCall('calc', 'tools/call', {
        name: 'calc.list_emission_factors',
        arguments: {},
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (err) {
      log.error('List emission factors failed', { error: err.message });
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  },

  // POST /api/tools/call - Generic MCP tool proxy
  'POST /api/tools/call': async (req, res, parsedUrl) => {
    try {
      const { server, method, arguments: args } = await readJsonBody(req, MAX_JSON_BYTES);

      if (!server || !method) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing server or method' }));
        return;
      }

      const result = await mcpCall(server, 'tools/call', {
        name: method,
        arguments: args || {},
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (err) {
      log.error('Tool call failed', { error: err.message });
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  },

  // GET /health
  'GET /health': async (req, res, parsedUrl) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', gateway: 'rest-gateway', version: '0.1.0' }));
  },
};

/**
 * Main HTTP server
 */
const CORS_ORIGIN = process.env.CARBONKIT_CORS_ORIGIN || '*';

const server = http.createServer((req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Auth check (except /health)
  const parsedUrl = parseUrl(req.url, true);
  if (parsedUrl.pathname !== '/health' && !authMiddleware(req, res)) {
    return;
  }

  // Route matching
  const routeKey = `${req.method} ${parsedUrl.pathname}`;
  let handler = routes[routeKey];

  // Pattern matching for dynamic routes
  if (!handler) {
    for (const [pattern, fn] of Object.entries(routes)) {
      const regex = new RegExp('^' + pattern.replace(/:[^\/]+/g, '([^/]+)') + '$');
      if (regex.test(routeKey)) {
        handler = fn;
        break;
      }
    }
  }

  if (handler) {
    log.debug('Request', { method: req.method, path: parsedUrl.pathname });
    handler(req, res, parsedUrl).catch((err) => {
      log.error('Handler error', { error: err.message, path: parsedUrl.pathname });
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    });
  } else {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }
});

const PORT = process.env.CARBONKIT_GATEWAY_PORT || 8400;

if (CORS_ORIGIN === '*' && process.env.CARBONKIT_AUTH_SECRET) {
  log.warn('Wildcard CORS with auth enabled — set CARBONKIT_CORS_ORIGIN to restrict origins');
}

server.listen(PORT, () => {
  log.info('REST Gateway listening', { port: PORT });
  process.stderr.write(`CarbonKit REST Gateway on port ${PORT}\n`);
  process.stderr.write(`MCP servers: calc=${MCP_PORTS.calc}, exec=${MCP_PORTS.exec}, strategy=${MCP_PORTS.strategy}, scope12=${MCP_PORTS.scope12}, swarm=${MCP_PORTS.swarm}, connectors=${MCP_PORTS.connectors}\n`);
});

module.exports = { server };
