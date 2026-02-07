'use strict';

/**
 * Standardized MCP response helpers for CarbonKit MCP servers.
 *
 * Error codes:
 *   NOT_FOUND  - requested resource does not exist
 *   VALIDATION - input validation failure
 *   CONFLICT   - state conflict (e.g. duplicate, already finalized)
 *   BLOCKED    - operation blocked by a precondition (e.g. missing evidence)
 *   INTERNAL   - unexpected server error
 */

const ERROR_CODES = {
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION: 'VALIDATION',
  CONFLICT: 'CONFLICT',
  BLOCKED: 'BLOCKED',
  INTERNAL: 'INTERNAL',
};

/**
 * Build a successful MCP tool result.
 * @param {*} data - response payload (string or object)
 * @returns {{ content: Array, isError: false }}
 */
function toolSuccess(data) {
  const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  return { content: [{ type: 'text', text }], isError: false };
}

/**
 * Build a failed MCP tool result.
 * @param {string} code   - one of ERROR_CODES
 * @param {string} message - human-readable error message
 * @param {*} [details]   - optional structured details
 * @returns {{ content: Array, isError: true }}
 */
function toolFailure(code, message, details) {
  const payload = { error: true, code, message };
  if (details !== undefined) payload.details = details;
  const text = JSON.stringify(payload, null, 2);
  return { content: [{ type: 'text', text }], isError: true };
}

module.exports = {
  ERROR_CODES,
  toolSuccess,
  toolFailure,
};
