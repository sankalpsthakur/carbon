'use strict';

/**
 * Shared validation utilities for CarbonKit MCP servers.
 */

const ISO_4217 = new Set([
  'AED','AFN','ALL','AMD','ANG','AOA','ARS','AUD','AWG','AZN','BAM','BBD',
  'BDT','BGN','BHD','BIF','BMD','BND','BOB','BRL','BSD','BTN','BWP','BYN',
  'BZD','CAD','CDF','CHF','CLP','CNY','COP','CRC','CUP','CVE','CZK','DJF',
  'DKK','DOP','DZD','EGP','ERN','ETB','EUR','FJD','FKP','GBP','GEL','GHS',
  'GIP','GMD','GNF','GTQ','GYD','HKD','HNL','HRK','HTG','HUF','IDR','ILS',
  'INR','IQD','IRR','ISK','JMD','JOD','JPY','KES','KGS','KHR','KMF','KPW',
  'KRW','KWD','KYD','KZT','LAK','LBP','LKR','LRD','LSL','LYD','MAD','MDL',
  'MGA','MKD','MMK','MNT','MOP','MRU','MUR','MVR','MWK','MXN','MYR','MZN',
  'NAD','NGN','NIO','NOK','NPR','NZD','OMR','PAB','PEN','PGK','PHP','PKR',
  'PLN','PYG','QAR','RON','RSD','RUB','RWF','SAR','SBD','SCR','SDG','SEK',
  'SGD','SHP','SLE','SOS','SRD','SSP','STN','SVC','SYP','SZL','THB','TJS',
  'TMT','TND','TOP','TRY','TTD','TWD','TZS','UAH','UGX','USD','UYU','UZS',
  'VES','VND','VUV','WST','XAF','XCD','XOF','XPF','YER','ZAR','ZMW','ZWL',
]);

/**
 * Require a non-empty string argument. Throws with code -32602 on failure.
 */
function requireString(args, key) {
  const v = args?.[key];
  if (typeof v === 'string' && v.length > 0) return v;
  const err = new Error(`Missing required string: ${key}`);
  err.code = -32602;
  throw err;
}

/**
 * Require a numeric argument. Throws with code -32602 on failure.
 */
function requireNumber(args, key) {
  const v = args?.[key];
  if (typeof v === 'number' && !Number.isNaN(v)) return v;
  const err = new Error(`Missing required number: ${key}`);
  err.code = -32602;
  throw err;
}

/**
 * Require a value from an allowed set. Throws with code -32602 on failure.
 */
function requireEnum(args, key, allowed) {
  const v = args?.[key];
  if (allowed.includes(v)) return v;
  const err = new Error(`${key} must be one of: ${allowed.join(', ')}`);
  err.code = -32602;
  throw err;
}

/**
 * Require a non-empty array argument. Throws with code -32602 on failure.
 */
function requireArray(args, key) {
  const v = args?.[key];
  if (Array.isArray(v) && v.length > 0) return v;
  const err = new Error(`Missing required non-empty array: ${key}`);
  err.code = -32602;
  throw err;
}

/**
 * Require a plain object argument. Throws with code -32602 on failure.
 */
function requireObject(args, key) {
  const v = args?.[key];
  if (v && typeof v === 'object' && !Array.isArray(v)) return v;
  const err = new Error(`Missing required object: ${key}`);
  err.code = -32602;
  throw err;
}

/**
 * Validate a 3-letter ISO 4217 currency code.
 * Returns the uppercased code on success, throws on failure.
 */
function validateCurrencyCode(code) {
  if (typeof code !== 'string') {
    const err = new Error('Currency code must be a string');
    err.code = -32602;
    throw err;
  }
  const upper = code.toUpperCase().trim();
  if (!ISO_4217.has(upper)) {
    const err = new Error(`Unknown currency code: ${upper}`);
    err.code = -32602;
    throw err;
  }
  return upper;
}

/**
 * Sanitize a collection name to prevent path traversal.
 * Replaces non-alphanumeric/dash/underscore characters with '_'.
 */
function sanitizeCollectionName(name) {
  return String(name).replace(/[^a-zA-Z0-9_-]/g, '_');
}

module.exports = {
  requireString,
  requireNumber,
  requireEnum,
  requireArray,
  requireObject,
  validateCurrencyCode,
  sanitizeCollectionName,
  ISO_4217,
};
