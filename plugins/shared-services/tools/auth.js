'use strict';

/**
 * Simple JWT HS256 bearer-token auth for CarbonKit HTTP transport.
 *
 * No external dependencies -- uses Node's built-in crypto module.
 * Reads CARBONKIT_AUTH_SECRET from env.
 *
 * Usage:
 *   const { createToken, verifyToken, authMiddleware } = require('./auth');
 */

const crypto = require('crypto');

function base64url(buf) {
  return (Buffer.isBuffer(buf) ? buf : Buffer.from(buf))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64urlDecode(str) {
  const padded = str + '='.repeat((4 - (str.length % 4)) % 4);
  return Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

/**
 * Create a JWT token (HS256).
 * @param {object} payload - Claims (will have iat added automatically).
 * @param {string} secret  - HMAC secret.
 * @param {number} [ttlSec=3600] - Token lifetime in seconds.
 * @returns {string} Signed JWT.
 */
function createToken(payload, secret, ttlSec) {
  if (!secret || typeof secret !== 'string') throw new Error('auth: secret is required');
  const ttl = typeof ttlSec === 'number' && ttlSec > 0 ? ttlSec : 3600;
  const nowSec = Math.floor(Date.now() / 1000);

  const header = { alg: 'HS256', typ: 'JWT' };
  const claims = { ...payload, iat: nowSec, exp: nowSec + ttl };

  const segments = [
    base64url(JSON.stringify(header)),
    base64url(JSON.stringify(claims)),
  ];

  const sigInput = segments.join('.');
  const sig = crypto.createHmac('sha256', secret).update(sigInput).digest();
  segments.push(base64url(sig));

  return segments.join('.');
}

/**
 * Verify a JWT token (HS256).
 * @param {string} token  - The JWT string.
 * @param {string} secret - HMAC secret.
 * @returns {object} Decoded payload on success.
 * @throws {Error} On invalid/expired token.
 */
function verifyToken(token, secret) {
  if (!secret || typeof secret !== 'string') throw new Error('auth: secret is required');
  if (typeof token !== 'string') throw new Error('auth: token must be a string');

  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('auth: malformed token');

  const sigInput = parts[0] + '.' + parts[1];
  const expected = crypto.createHmac('sha256', secret).update(sigInput).digest();
  const actual = base64urlDecode(parts[2]);

  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
    throw new Error('auth: invalid signature');
  }

  const payload = JSON.parse(base64urlDecode(parts[1]).toString('utf8'));

  if (typeof payload.exp === 'number' && Math.floor(Date.now() / 1000) > payload.exp) {
    throw new Error('auth: token expired');
  }

  return payload;
}

/**
 * HTTP middleware that verifies Bearer tokens.
 * If CARBONKIT_AUTH_SECRET is not set, auth is skipped (open mode).
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 * @returns {boolean} true if authorized (or auth disabled), false if rejected.
 */
function authMiddleware(req, res) {
  const secret = process.env.CARBONKIT_AUTH_SECRET;
  if (!secret) return true; // auth disabled

  const authHeader = req.headers['authorization'] || '';
  const match = /^Bearer\s+(\S+)$/i.exec(authHeader);
  if (!match) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Missing or malformed Authorization header' }));
    return false;
  }

  try {
    verifyToken(match[1], secret);
    return true;
  } catch (err) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Forbidden' }));
    return false;
  }
}

module.exports = { createToken, verifyToken, authMiddleware };
