'use strict';

/**
 * Prometheus-compatible metrics for CarbonKit MCP servers.
 *
 * Tracks:
 *   - tool_calls_total          (counter, labels: server, tool, status)
 *   - tool_duration_seconds     (histogram, labels: server, tool)
 *   - store_operations_total    (counter, labels: server, collection, operation)
 *   - active_swarm_runs         (gauge)
 *   - http_requests_total       (counter, labels: method, path, status)
 *
 * Export via /metrics endpoint or inline scrape.
 *
 * Usage:
 *   const { MetricsRegistry, createMetricsServer } = require('./metrics');
 *   const metrics = new MetricsRegistry('calc-mcp');
 *   metrics.toolCall('calc.compute', 'success', 0.123);
 *   metrics.storeOp('jobs', 'set');
 *
 *   // Optional: HTTP /metrics endpoint
 *   createMetricsServer(metrics, { port: 9100 });
 */

const http = require('http');

// ---------------------------------------------------------------------------
// Histogram bucket boundaries (seconds)
// ---------------------------------------------------------------------------

const DEFAULT_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

// ---------------------------------------------------------------------------
// Metrics Registry
// ---------------------------------------------------------------------------

class MetricsRegistry {
  /**
   * @param {string} serverName - identifying label for this MCP server
   */
  constructor(serverName) {
    this._server = serverName || 'unknown';

    // Counters: key -> { labels, value }
    this._counters = {
      tool_calls_total: new Map(),
      store_operations_total: new Map(),
      http_requests_total: new Map(),
    };

    // Histograms: key -> { labels, count, sum, buckets: Map<bound, count> }
    this._histograms = {
      tool_duration_seconds: new Map(),
    };

    // Gauges: key -> value
    this._gauges = {
      active_swarm_runs: 0,
    };
  }

  // ---- Counter helpers ----

  _incCounter(name, labels) {
    const map = this._counters[name];
    if (!map) return;
    const key = JSON.stringify(labels);
    const prev = map.get(key) || { labels, value: 0 };
    prev.value++;
    map.set(key, prev);
  }

  // ---- Histogram helpers ----

  _observeHistogram(name, labels, value) {
    const map = this._histograms[name];
    if (!map) return;
    const key = JSON.stringify(labels);
    let entry = map.get(key);
    if (!entry) {
      const buckets = new Map();
      for (const b of DEFAULT_BUCKETS) buckets.set(b, 0);
      entry = { labels, count: 0, sum: 0, buckets };
      map.set(key, entry);
    }
    entry.count++;
    entry.sum += value;
    for (const b of DEFAULT_BUCKETS) {
      if (value <= b) entry.buckets.set(b, entry.buckets.get(b) + 1);
    }
  }

  // ---- Public API ----

  /**
   * Record a tool call.
   * @param {string} tool - tool name
   * @param {string} status - 'success' or 'error'
   * @param {number} durationSec - call duration in seconds
   */
  toolCall(tool, status, durationSec) {
    this._incCounter('tool_calls_total', { server: this._server, tool, status });
    if (typeof durationSec === 'number') {
      this._observeHistogram('tool_duration_seconds', { server: this._server, tool }, durationSec);
    }
  }

  /**
   * Record a store operation.
   * @param {string} collection
   * @param {string} operation - 'get', 'set', 'delete', 'list', 'bulkSet'
   */
  storeOp(collection, operation) {
    this._incCounter('store_operations_total', { server: this._server, collection, operation });
  }

  /**
   * Record an HTTP request.
   * @param {string} method
   * @param {string} path_
   * @param {number} status
   */
  httpRequest(method, path_, status) {
    this._incCounter('http_requests_total', { method, path: path_, status: String(status) });
  }

  /**
   * Set the active swarm runs gauge.
   * @param {number} value
   */
  setActiveSwarmRuns(value) {
    this._gauges.active_swarm_runs = value;
  }

  /**
   * Increment active swarm runs.
   */
  incActiveSwarmRuns() {
    this._gauges.active_swarm_runs++;
  }

  /**
   * Decrement active swarm runs.
   */
  decActiveSwarmRuns() {
    this._gauges.active_swarm_runs = Math.max(0, this._gauges.active_swarm_runs - 1);
  }

  // ---- Exposition ----

  /**
   * Format all metrics in Prometheus text exposition format.
   * @returns {string}
   */
  serialize() {
    const lines = [];

    // Counters
    for (const [name, map] of Object.entries(this._counters)) {
      lines.push(`# HELP ${name} Counter for ${name.replace(/_/g, ' ')}`);
      lines.push(`# TYPE ${name} counter`);
      for (const [, entry] of map) {
        const labelStr = this._formatLabels(entry.labels);
        lines.push(`${name}${labelStr} ${entry.value}`);
      }
    }

    // Histograms
    for (const [name, map] of Object.entries(this._histograms)) {
      lines.push(`# HELP ${name} Histogram for ${name.replace(/_/g, ' ')}`);
      lines.push(`# TYPE ${name} histogram`);
      for (const [, entry] of map) {
        const labelStr = this._formatLabels(entry.labels);
        for (const [bound, count] of entry.buckets) {
          lines.push(`${name}_bucket${this._formatLabels({ ...entry.labels, le: String(bound) })} ${count}`);
        }
        lines.push(`${name}_bucket${this._formatLabels({ ...entry.labels, le: '+Inf' })} ${entry.count}`);
        lines.push(`${name}_sum${labelStr} ${entry.sum}`);
        lines.push(`${name}_count${labelStr} ${entry.count}`);
      }
    }

    // Gauges
    for (const [name, value] of Object.entries(this._gauges)) {
      lines.push(`# HELP ${name} Gauge for ${name.replace(/_/g, ' ')}`);
      lines.push(`# TYPE ${name} gauge`);
      lines.push(`${name}{server="${this._server}"} ${value}`);
    }

    return lines.join('\n') + '\n';
  }

  _formatLabels(labels) {
    const parts = [];
    for (const [k, v] of Object.entries(labels)) {
      parts.push(`${k}="${String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`);
    }
    return parts.length > 0 ? `{${parts.join(',')}}` : '';
  }

  /**
   * Reset all metrics (useful for tests).
   */
  reset() {
    for (const map of Object.values(this._counters)) map.clear();
    for (const map of Object.values(this._histograms)) map.clear();
    for (const key of Object.keys(this._gauges)) this._gauges[key] = 0;
  }
}

// ---------------------------------------------------------------------------
// Metrics HTTP server
// ---------------------------------------------------------------------------

/**
 * Create a simple HTTP server that exposes /metrics.
 * @param {MetricsRegistry} registry
 * @param {{ port?: number, host?: string }} [opts]
 * @returns {http.Server}
 */
function createMetricsServer(registry, opts) {
  const o = opts || {};
  const port = o.port || parseInt(process.env.CARBONKIT_METRICS_PORT || '9100', 10);
  const host = o.host || '127.0.0.1';

  const server = http.createServer((req, res) => {
    if (req.url === '/metrics' && req.method === 'GET') {
      const body = registry.serialize();
      res.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4; charset=utf-8' });
      res.end(body);
    } else if (req.url === '/health' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } else {
      res.writeHead(404);
      res.end('Not Found');
    }
  });

  server.listen(port, host, () => {
    process.stderr.write(`[metrics] Listening on ${host}:${port}/metrics\n`);
  });

  return server;
}

/**
 * Create metrics-instrumented wrappers for store operations.
 * @param {object} store - store instance
 * @param {MetricsRegistry} registry
 * @returns {object} instrumented store with same API
 */
function instrumentStore(store, registry) {
  const wrap = (operation) => {
    return function (collection, ...args) {
      registry.storeOp(collection, operation);
      return store[operation](collection, ...args);
    };
  };

  return {
    get: wrap('get'),
    set: wrap('set'),
    list: wrap('list'),
    delete: wrap('delete'),
    bulkSet: store.bulkSet ? wrap('bulkSet') : undefined,
    count: store.count ? wrap('count') : undefined,
    close: () => store.close(),
    _generateId: () => store._generateId(),
  };
}

module.exports = { MetricsRegistry, createMetricsServer, instrumentStore };
