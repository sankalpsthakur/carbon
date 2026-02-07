'use strict';

/**
 * LLM Router for CarbonKit.
 *
 * OpenAI-compatible proxy that routes requests to a configured backend:
 *   - anthropic: Claude API (default)
 *   - ollama:    Ollama local server
 *   - vllm:      vLLM OpenAI-compatible endpoint
 *   - llamacpp:  llama.cpp server
 *
 * Environment:
 *   CARBONKIT_LLM_BACKEND  - one of: anthropic, ollama, vllm, llamacpp (default: anthropic)
 *   CARBONKIT_LLM_URL      - base URL for the backend
 *   CARBONKIT_LLM_MODEL    - model identifier
 *   CARBONKIT_LLM_API_KEY  - API key (required for anthropic, optional for others)
 *   CARBONKIT_LLM_MAX_TOKENS - max tokens for generation (default: 4096)
 *
 * Usage:
 *   const { createRouter } = require('./llm-router');
 *   const router = createRouter();
 *   const result = await router.chat({ messages: [...] });
 */

const https = require('https');
const http = require('http');

// ---------------------------------------------------------------------------
// Backend defaults
// ---------------------------------------------------------------------------

const BACKEND_DEFAULTS = {
  anthropic: {
    url: 'https://api.anthropic.com',
    model: 'claude-sonnet-4-5-20250929',
    path: '/v1/messages',
    apiVersion: '2023-06-01',
  },
  ollama: {
    url: 'http://localhost:11434',
    model: 'llama3.1',
    path: '/v1/chat/completions',
  },
  vllm: {
    url: 'http://localhost:8000',
    model: 'default',
    path: '/v1/chat/completions',
  },
  llamacpp: {
    url: 'http://localhost:8080',
    model: 'default',
    path: '/v1/chat/completions',
  },
};

// ---------------------------------------------------------------------------
// HTTP request helper (no deps)
// ---------------------------------------------------------------------------

function httpRequest(urlStr, options, body) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(urlStr);
    const transport = parsed.protocol === 'https:' ? https : http;

    const reqOpts = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: options.method || 'POST',
      headers: options.headers || {},
    };

    const req = transport.request(reqOpts, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve({ status: res.statusCode, headers: res.headers, body: raw });
      });
    });

    req.on('error', reject);
    req.setTimeout(120000, () => {
      req.destroy(new Error('LLM request timeout (120s)'));
    });

    if (body) req.write(body);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Backend adapters
// ---------------------------------------------------------------------------

function buildAnthropicRequest(config, params) {
  const messages = (params.messages || []).map((m) => ({
    role: m.role === 'system' ? 'user' : m.role,
    content: m.content,
  }));

  // Extract system message if present
  const systemMsg = (params.messages || []).find((m) => m.role === 'system');

  const body = {
    model: params.model || config.model,
    max_tokens: params.max_tokens || config.maxTokens,
    messages,
  };
  if (systemMsg) body.system = systemMsg.content;

  return {
    url: `${config.url}${config.path}`,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': config.apiVersion,
    },
    body: JSON.stringify(body),
  };
}

function parseAnthropicResponse(raw) {
  const data = JSON.parse(raw);
  if (data.error) {
    return { error: true, message: data.error.message || 'Anthropic API error', raw: data };
  }
  const text = (data.content || [])
    .filter((c) => c.type === 'text')
    .map((c) => c.text)
    .join('');
  return {
    error: false,
    content: text,
    model: data.model,
    usage: data.usage || {},
    stop_reason: data.stop_reason,
  };
}

function buildOpenAIRequest(config, params) {
  const body = {
    model: params.model || config.model,
    messages: params.messages || [],
    max_tokens: params.max_tokens || config.maxTokens,
  };
  if (params.temperature != null) body.temperature = params.temperature;
  if (params.top_p != null) body.top_p = params.top_p;

  const headers = { 'Content-Type': 'application/json' };
  if (config.apiKey) headers['Authorization'] = `Bearer ${config.apiKey}`;

  return {
    url: `${config.url}${config.path}`,
    headers,
    body: JSON.stringify(body),
  };
}

function parseOpenAIResponse(raw) {
  const data = JSON.parse(raw);
  if (data.error) {
    return { error: true, message: data.error.message || 'OpenAI-compatible API error', raw: data };
  }
  const choice = (data.choices || [])[0];
  return {
    error: false,
    content: choice?.message?.content || '',
    model: data.model,
    usage: data.usage || {},
    stop_reason: choice?.finish_reason,
  };
}

// ---------------------------------------------------------------------------
// Router factory
// ---------------------------------------------------------------------------

/**
 * Create an LLM router instance.
 * @param {object} [opts] - Override env-based config
 * @param {string} [opts.backend]
 * @param {string} [opts.url]
 * @param {string} [opts.model]
 * @param {string} [opts.apiKey]
 * @param {number} [opts.maxTokens]
 * @returns {{ chat: function, config: object }}
 */
function createRouter(opts) {
  const o = opts || {};
  const backend = o.backend || process.env.CARBONKIT_LLM_BACKEND || 'anthropic';
  const defaults = BACKEND_DEFAULTS[backend];
  if (!defaults) {
    throw new Error(`Unsupported LLM backend: ${backend}. Valid: ${Object.keys(BACKEND_DEFAULTS).join(', ')}`);
  }

  const config = {
    backend,
    url: o.url || process.env.CARBONKIT_LLM_URL || defaults.url,
    model: o.model || process.env.CARBONKIT_LLM_MODEL || defaults.model,
    path: defaults.path,
    apiKey: o.apiKey || process.env.CARBONKIT_LLM_API_KEY || '',
    apiVersion: defaults.apiVersion || '',
    maxTokens: o.maxTokens || parseInt(process.env.CARBONKIT_LLM_MAX_TOKENS || '4096', 10),
  };

  /**
   * Send a chat completion request.
   * @param {object} params
   * @param {Array<{role: string, content: string}>} params.messages
   * @param {string} [params.model]
   * @param {number} [params.max_tokens]
   * @param {number} [params.temperature]
   * @returns {Promise<{error: boolean, content?: string, model?: string, usage?: object}>}
   */
  async function chat(params) {
    if (!params || !Array.isArray(params.messages)) {
      return { error: true, message: 'params.messages must be an array' };
    }

    let req;
    let parseResponse;

    if (backend === 'anthropic') {
      req = buildAnthropicRequest(config, params);
      parseResponse = parseAnthropicResponse;
    } else {
      req = buildOpenAIRequest(config, params);
      parseResponse = parseOpenAIResponse;
    }

    try {
      const res = await httpRequest(req.url, { method: 'POST', headers: req.headers }, req.body);

      if (res.status >= 400) {
        return {
          error: true,
          message: `HTTP ${res.status} from ${backend}`,
          status: res.status,
          body: res.body.substring(0, 500),
        };
      }

      return parseResponse(res.body);
    } catch (err) {
      return { error: true, message: err.message || String(err) };
    }
  }

  /**
   * Check if the backend is reachable.
   * @returns {Promise<{ok: boolean, backend: string, model: string, error?: string}>}
   */
  async function health() {
    try {
      // For Anthropic, we can't easily health-check without a real request
      // For OpenAI-compatible, try /v1/models
      if (backend !== 'anthropic') {
        const res = await httpRequest(`${config.url}/v1/models`, { method: 'GET', headers: {} });
        return {
          ok: res.status < 400,
          backend,
          model: config.model,
          url: config.url,
          status: res.status,
        };
      }
      return { ok: !!config.apiKey, backend, model: config.model, url: config.url };
    } catch (err) {
      return { ok: false, backend, model: config.model, url: config.url, error: err.message };
    }
  }

  return { chat, health, config };
}

module.exports = { createRouter, BACKEND_DEFAULTS };
