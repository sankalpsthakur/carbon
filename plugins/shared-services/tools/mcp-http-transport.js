'use strict';

/**
 * HTTP transport for CarbonKit MCP servers.
 *
 * Contract:
 * - The MCP server provides an async/sync `handleMessage(msg)` function that returns
 *   a JSON-RPC 2.0 response object, or null/undefined for notifications (no `id`).
 * - This transport is request-scoped and concurrency-safe (no stdout monkeypatch).
 * - Endpoints:
 *   - POST /* : JSON-RPC 2.0 request -> JSON-RPC 2.0 response
 *   - GET /health : basic liveness
 */

const http = require('http');
const { authMiddleware } = require('./auth');
const { createLogger } = require('./logger');

function readBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;

    req.on('data', (chunk) => {
      size += chunk.length;
      if (typeof maxBytes === 'number' && maxBytes > 0 && size > maxBytes) {
        reject(new Error(`Request body too large (>${maxBytes} bytes)`));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(label || `Timeout after ${ms}ms`)), ms);
    promise.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); }
    );
  });
}

/**
 * Backward compatible signature:
 *   startHttpTransport(handleMessage, _unusedWrite, port, opts?)
 *
 * @param {(msg: any) => (Promise<object|null>|object|null)} handleMessage
 * @param {*} _unusedWrite - legacy param (ignored)
 * @param {number|string} port
 * @param {{ serverInfo?: object, corsOrigin?: string, maxBodyBytes?: number, timeoutMs?: number }} [opts]
 */
function startHttpTransport(handleMessage, _unusedWrite, port, opts) {
  const log = createLogger('mcp-http');
  const o = opts || {};
  const corsOrigin = o.corsOrigin || process.env.CARBONKIT_CORS_ORIGIN || '*';
  const maxBodyBytes = o.maxBodyBytes || 5 * 1024 * 1024; // 5MB default
  const timeoutMs = o.timeoutMs || 30000;

  const serverInfo = o.serverInfo || null;

  const server = http.createServer(async (req, res) => {
    // CORS for local dev / browser clients
    res.setHeader('Access-Control-Allow-Origin', corsOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS, GET');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method === 'GET' && (req.url || '').split('?')[0] === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ok: true,
        transport: 'http',
        server: serverInfo,
        pid: process.pid,
        uptime_s: Math.round(process.uptime()),
        timestamp: new Date().toISOString(),
      }));
      return;
    }

    if (req.method !== 'POST') {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Method not allowed. Use POST.' }));
      return;
    }

    // Auth check
    if (!authMiddleware(req, res)) return;

    let msg;
    try {
      const raw = await readBody(req, maxBodyBytes);
      msg = JSON.parse(raw);
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: e.message || 'Parse error' } }));
      return;
    }

    try {
      log.debug('Incoming request', { method: msg && msg.method, id: msg && msg.id });
      const response = await withTimeout(Promise.resolve(handleMessage(msg)), timeoutMs, 'Timeout: server did not respond within 30s');
      if (!response) {
        res.writeHead(204);
        res.end();
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(response));
    } catch (e) {
      const id = msg && Object.prototype.hasOwnProperty.call(msg, 'id') ? msg.id : null;
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ jsonrpc: '2.0', id, error: { code: -32603, message: e.message || 'Internal error' } }));
    }
  });

  const p = typeof port === 'string' ? parseInt(port, 10) : port;
  server.listen(p, () => {
    log.info('MCP HTTP transport listening', { port: p });
    process.stderr.write(`MCP HTTP on port ${p}\n`);
  });

  return server;
}

module.exports = { startHttpTransport };
