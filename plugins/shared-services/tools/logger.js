'use strict';

/**
 * Structured JSON logger for CarbonKit MCP servers.
 *
 * Pino-like interface with zero external dependencies.
 * Reads CARBONKIT_LOG_LEVEL from env (default: "info").
 * Levels: debug < info < warn < error
 *
 * All output goes to stderr to avoid interfering with MCP stdout framing.
 *
 * Usage:
 *   const { createLogger } = require('./logger');
 *   const log = createLogger('calc-mcp');
 *   log.info('Server started', { port: 8401 });
 *   log.info({ tool: 'calc.compute', duration_ms: 42 }, 'Tool call completed');
 *
 *   // Child logger with bound fields
 *   const child = log.child({ request_id: 'abc-123' });
 *   child.info('Processing request');
 *
 *   // Timer helper
 *   const end = log.startTimer();
 *   // ... do work ...
 *   end.info({ tool: 'calc.compute' }, 'Done');
 */

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const LEVEL_NAMES = { 10: 'debug', 20: 'info', 30: 'warn', 40: 'error' };

function resolveLevel(levelStr) {
  const raw = (levelStr || 'info').toLowerCase();
  return LEVELS[raw] !== undefined ? LEVELS[raw] : LEVELS.info;
}

/**
 * Create a structured JSON logger.
 * @param {string} server - server/component name
 * @param {object} [opts]
 * @param {string} [opts.level] - override log level (default: env or 'info')
 * @param {object} [opts.bindings] - extra fields to include in every entry
 * @param {NodeJS.WritableStream} [opts.stream] - output stream (default: stderr)
 * @returns {Logger}
 */
function createLogger(server, opts) {
  const o = opts || {};
  const threshold = resolveLevel(o.level || process.env.CARBONKIT_LOG_LEVEL);
  const bindings = { server, ...(o.bindings || {}) };
  const stream = o.stream || process.stderr;

  function emit(level, msgOrExtra, msg) {
    const numLevel = LEVELS[level];
    if (numLevel < threshold) return;

    const entry = {
      timestamp: new Date().toISOString(),
      level,
      ...bindings,
    };

    // Support both (msg, extra) and (extra, msg) calling conventions
    if (typeof msgOrExtra === 'string') {
      entry.message = msgOrExtra;
      if (msg && typeof msg === 'object') {
        Object.assign(entry, msg);
      }
    } else if (typeof msgOrExtra === 'object' && msgOrExtra !== null) {
      Object.assign(entry, msgOrExtra);
      if (typeof msg === 'string') {
        entry.message = msg;
      }
    }

    stream.write(JSON.stringify(entry) + '\n');
  }

  const logger = {
    /** @type {string} */
    level: LEVEL_NAMES[threshold] || 'info',

    /**
     * Log at debug level.
     * @param {string|object} msgOrExtra
     * @param {string|object} [msg]
     */
    debug: (msgOrExtra, msg) => emit('debug', msgOrExtra, msg),

    /**
     * Log at info level.
     * @param {string|object} msgOrExtra
     * @param {string|object} [msg]
     */
    info: (msgOrExtra, msg) => emit('info', msgOrExtra, msg),

    /**
     * Log at warn level.
     * @param {string|object} msgOrExtra
     * @param {string|object} [msg]
     */
    warn: (msgOrExtra, msg) => emit('warn', msgOrExtra, msg),

    /**
     * Log at error level.
     * @param {string|object} msgOrExtra
     * @param {string|object} [msg]
     */
    error: (msgOrExtra, msg) => emit('error', msgOrExtra, msg),

    /**
     * Create a child logger with additional bound fields.
     * @param {object} childBindings
     * @returns {Logger}
     */
    child(childBindings) {
      return createLogger(server, {
        level: LEVEL_NAMES[threshold],
        bindings: { ...bindings, ...childBindings },
        stream,
      });
    },

    /**
     * Start a timer. Returns a logger-like object where calling
     * any level method automatically adds duration_ms.
     * @returns {{ debug, info, warn, error }}
     */
    startTimer() {
      const start = process.hrtime.bigint();

      function timedEmit(level, msgOrExtra, msg) {
        const elapsed = Number(process.hrtime.bigint() - start) / 1e6;
        const extra = { duration_ms: Math.round(elapsed * 100) / 100 };

        if (typeof msgOrExtra === 'string') {
          emit(level, { ...extra }, undefined);
          // Re-emit with message
          const numLevel = LEVELS[level];
          if (numLevel < threshold) return;
          const entry = {
            timestamp: new Date().toISOString(),
            level,
            ...bindings,
            ...extra,
            message: msgOrExtra,
          };
          if (msg && typeof msg === 'object') Object.assign(entry, msg);
          stream.write(JSON.stringify(entry) + '\n');
          return;
        }

        if (typeof msgOrExtra === 'object' && msgOrExtra !== null) {
          emit(level, { ...msgOrExtra, ...extra }, msg);
        } else {
          emit(level, extra, msg);
        }
      }

      return {
        debug: (msgOrExtra, msg) => timedEmit('debug', msgOrExtra, msg),
        info: (msgOrExtra, msg) => timedEmit('info', msgOrExtra, msg),
        warn: (msgOrExtra, msg) => timedEmit('warn', msgOrExtra, msg),
        error: (msgOrExtra, msg) => timedEmit('error', msgOrExtra, msg),
      };
    },

    /**
     * Check if a level would be logged.
     * @param {string} level
     * @returns {boolean}
     */
    isLevelEnabled(level) {
      return (LEVELS[level] || 0) >= threshold;
    },
  };

  return logger;
}

module.exports = { createLogger, LEVELS, LEVEL_NAMES };
