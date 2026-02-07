#!/usr/bin/env node
'use strict';

// Lightweight generic REST API adapter for CarbonKit connectors.
// Makes authenticated HTTP calls to any REST/OData API given a config.
// Supports OAuth2 bearer token and API key auth patterns.
// No external deps. Uses Node built-in https/http modules.

const https = require('https');
const http = require('http');
const url = require('url');

// ─── Auth providers ────────────────────────────────────────────────────────────

function buildAuthHeaders(authConfig) {
  if (!authConfig || !authConfig.type) return {};

  switch (authConfig.type) {
    case 'oauth2':
    case 'bearer': {
      const token = authConfig.access_token || authConfig.token;
      if (!token) throw new Error('OAuth2/bearer auth requires access_token or token');
      return { Authorization: `Bearer ${token}` };
    }

    case 'api_key': {
      const key = authConfig.api_key || authConfig.key;
      if (!key) throw new Error('API key auth requires api_key or key');
      const header = authConfig.header_name || 'X-API-Key';
      return { [header]: key };
    }

    case 'basic': {
      const user = authConfig.username || '';
      const pass = authConfig.password || '';
      const encoded = Buffer.from(`${user}:${pass}`).toString('base64');
      return { Authorization: `Basic ${encoded}` };
    }

    default:
      return {};
  }
}

// ─── HTTP request helper ───────────────────────────────────────────────────────

function makeRequest(options) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(options.url);
    const isHttps = parsed.protocol === 'https:';
    const transport = isHttps ? https : http;

    const reqOptions = {
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: options.method || 'GET',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
      timeout: options.timeout || 30000,
    };

    const req = transport.request(reqOptions, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        let parsed = body;
        try {
          parsed = JSON.parse(body);
        } catch (_e) {
          // keep as string
        }
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: parsed,
          raw: body,
        });
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Request timed out after ${reqOptions.timeout}ms`));
    });

    if (options.body) {
      const payload = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
      req.write(payload);
    }

    req.end();
  });
}

// ─── REST adapter class ────────────────────────────────────────────────────────

class RestAdapter {
  /**
   * @param {Object} config
   * @param {string} config.base_url - Base URL for the API
   * @param {Object} config.auth - Auth config { type, access_token|api_key|username+password, header_name }
   * @param {Object} config.default_headers - Additional headers to send with every request
   * @param {number} config.timeout - Request timeout in ms (default 30000)
   * @param {Object} config.pagination - Pagination config { type: 'offset'|'cursor'|'link', param, limit_param, limit }
   */
  constructor(config) {
    this.baseUrl = (config.base_url || '').replace(/\/+$/, '');
    this.auth = config.auth || {};
    this.defaultHeaders = config.default_headers || {};
    this.timeout = config.timeout || 30000;
    this.pagination = config.pagination || null;
  }

  async request(method, endpoint, options = {}) {
    const fullUrl = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint}`;
    const authHeaders = buildAuthHeaders(this.auth);

    const queryParams = options.params || {};
    const urlObj = new URL(fullUrl);
    for (const [k, v] of Object.entries(queryParams)) {
      urlObj.searchParams.set(k, String(v));
    }

    const response = await makeRequest({
      url: urlObj.toString(),
      method,
      headers: { ...this.defaultHeaders, ...authHeaders, ...(options.headers || {}) },
      body: options.body,
      timeout: this.timeout,
    });

    return response;
  }

  async get(endpoint, params) {
    return this.request('GET', endpoint, { params });
  }

  async post(endpoint, body, params) {
    return this.request('POST', endpoint, { body, params });
  }

  async put(endpoint, body, params) {
    return this.request('PUT', endpoint, { body, params });
  }

  async patch(endpoint, body, params) {
    return this.request('PATCH', endpoint, { body, params });
  }

  /**
   * Fetch all pages of a paginated API endpoint.
   * @param {string} endpoint
   * @param {Object} params - Query parameters
   * @param {Function} extractRows - fn(responseBody) => array of rows
   * @returns {Array} All rows across all pages
   */
  async fetchAll(endpoint, params = {}, extractRows = null) {
    const extractor = extractRows || ((body) => {
      if (Array.isArray(body)) return body;
      if (body && body.results) return body.results;
      if (body && body.value) return body.value;
      if (body && body.data) return body.data;
      return [];
    });

    const allRows = [];
    const pag = this.pagination || { type: 'offset', param: 'offset', limit_param: 'limit', limit: 100 };
    let page = 0;
    const maxPages = 100;

    if (pag.type === 'offset') {
      let offset = 0;
      const limit = pag.limit || 100;

      while (page < maxPages) {
        const pageParams = { ...params, [pag.limit_param || 'limit']: limit, [pag.param || 'offset']: offset };
        const response = await this.get(endpoint, pageParams);
        if (response.status < 200 || response.status >= 300) break;

        const rows = extractor(response.body);
        if (rows.length === 0) break;
        allRows.push(...rows);
        if (rows.length < limit) break;

        offset += limit;
        page++;
      }
    } else if (pag.type === 'cursor') {
      let cursor = null;

      while (page < maxPages) {
        const pageParams = { ...params };
        if (cursor) pageParams[pag.param || 'cursor'] = cursor;
        if (pag.limit) pageParams[pag.limit_param || 'limit'] = pag.limit;

        const response = await this.get(endpoint, pageParams);
        if (response.status < 200 || response.status >= 300) break;

        const rows = extractor(response.body);
        allRows.push(...rows);

        const body = response.body;
        cursor = body && (body.next_cursor || body.nextCursor || body.cursor);
        if (!cursor || rows.length === 0) break;
        page++;
      }
    } else if (pag.type === 'link') {
      let nextUrl = null;

      const firstResponse = await this.get(endpoint, params);
      if (firstResponse.status >= 200 && firstResponse.status < 300) {
        allRows.push(...extractor(firstResponse.body));
        const linkHeader = firstResponse.headers && firstResponse.headers.link;
        if (linkHeader) {
          const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
          if (nextMatch) nextUrl = nextMatch[1];
        }
      }

      while (nextUrl && page < maxPages) {
        const response = await this.request('GET', nextUrl);
        if (response.status < 200 || response.status >= 300) break;

        const rows = extractor(response.body);
        if (rows.length === 0) break;
        allRows.push(...rows);

        const linkHeader = response.headers && response.headers.link;
        nextUrl = null;
        if (linkHeader) {
          const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
          if (nextMatch) nextUrl = nextMatch[1];
        }
        page++;
      }
    }

    return allRows;
  }
}

// ─── OData-specific helpers ────────────────────────────────────────────────────

class ODataAdapter extends RestAdapter {
  constructor(config) {
    super(config);
    this.pagination = config.pagination || {
      type: 'offset',
      param: '$skip',
      limit_param: '$top',
      limit: 100,
    };
  }

  async query(entity, options = {}) {
    const params = {};
    if (options.select) params['$select'] = Array.isArray(options.select) ? options.select.join(',') : options.select;
    if (options.filter) params['$filter'] = options.filter;
    if (options.orderby) params['$orderby'] = options.orderby;
    if (options.top) params['$top'] = options.top;
    if (options.skip) params['$skip'] = options.skip;
    if (options.expand) params['$expand'] = options.expand;

    return this.fetchAll(`/${entity}`, params, (body) => {
      if (body && body.value) return body.value;
      if (body && body.d && body.d.results) return body.d.results;
      return [];
    });
  }
}

// ─── Exports ───────────────────────────────────────────────────────────────────

module.exports = { RestAdapter, ODataAdapter, buildAuthHeaders, makeRequest };
