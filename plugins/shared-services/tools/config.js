'use strict';

/**
 * CarbonKit Configuration Module
 *
 * Reads/writes ~/.carbonkit/config.json with a defined schema.
 * Environment variables take precedence over config file values.
 *
 * Usage:
 *   const { getConfig, setConfig, initConfig, getConfigValue } = require('./config');
 */

const fs = require('fs');
const path = require('path');

const CONFIG_DIR = path.join(
  process.env.HOME || process.env.USERPROFILE || '/tmp',
  '.carbonkit'
);
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');

/**
 * Default configuration values.
 * These are used when no config file exists and no env var is set.
 */
const CONFIG_DEFAULTS = {
  db: {
    backend: 'sqlite',
    sqlitePath: path.join(CONFIG_DIR, 'data', 'carbonkit.db'),
    pgUrl: '',
  },
  llm: {
    backend: 'anthropic',
    url: '',
    model: '',
    apiKey: '',
  },
  telemetry: 'off',
  offline: false,
  auth: {
    secret: '',
  },
  mcp: {
    transport: 'stdio',
    ports: {
      calc: 8401,
      exec: 8402,
      strategy: 8403,
      scope12: 8404,
      swarm: 8405,
      connectors: 8406,
    },
  },
  logging: {
    level: 'info',
  },
};

/**
 * Map of environment variable names to config paths.
 * Env vars take precedence over file config.
 */
const ENV_MAP = {
  CARBONKIT_DB_BACKEND: 'db.backend',
  CARBONKIT_SQLITE_PATH: 'db.sqlitePath',
  CARBONKIT_PG_URL: 'db.pgUrl',
  CARBONKIT_LLM_BACKEND: 'llm.backend',
  CARBONKIT_LLM_URL: 'llm.url',
  CARBONKIT_LLM_MODEL: 'llm.model',
  CARBONKIT_LLM_API_KEY: 'llm.apiKey',
  CARBONKIT_TELEMETRY: 'telemetry',
  CARBONKIT_OFFLINE: 'offline',
  CARBONKIT_AUTH_SECRET: 'auth.secret',
  CARBONKIT_MCP_TRANSPORT: 'mcp.transport',
  LOG_LEVEL: 'logging.level',
};

// -- Helpers ------------------------------------------------------------------

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function getNestedValue(obj, dotPath) {
  const keys = dotPath.split('.');
  let current = obj;
  for (const key of keys) {
    if (current == null || typeof current !== 'object') return undefined;
    current = current[key];
  }
  return current;
}

function setNestedValue(obj, dotPath, value) {
  const keys = dotPath.split('.');
  let current = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (current[key] == null || typeof current[key] !== 'object') {
      current[key] = {};
    }
    current = current[key];
  }
  current[keys[keys.length - 1]] = value;
}

function coerceValue(value, defaultValue) {
  if (typeof defaultValue === 'boolean') {
    return value === 'true' || value === '1' || value === true;
  }
  if (typeof defaultValue === 'number') {
    const num = Number(value);
    return isNaN(num) ? defaultValue : num;
  }
  return value;
}

// -- Core functions -----------------------------------------------------------

/**
 * Read the raw config file from disk.
 * @returns {object} Parsed config or empty object if file doesn't exist.
 */
function readConfigFile() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) {
    return {};
  }
}

/**
 * Write config object to disk.
 * @param {object} config - Full config object to write.
 */
function writeConfigFile(config) {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), { encoding: 'utf8', mode: 0o600 });
}

/**
 * Get the full resolved configuration.
 * Merges: defaults <- config file <- environment variables.
 *
 * @returns {object} Complete configuration object.
 */
function getConfig() {
  const config = deepClone(CONFIG_DEFAULTS);
  const fileConfig = readConfigFile();

  // Merge file config over defaults (shallow 2-level merge)
  for (const [topKey, topVal] of Object.entries(fileConfig)) {
    if (topVal && typeof topVal === 'object' && !Array.isArray(topVal) && config[topKey] && typeof config[topKey] === 'object') {
      Object.assign(config[topKey], topVal);
    } else {
      config[topKey] = topVal;
    }
  }

  // Apply environment variable overrides
  for (const [envKey, configPath] of Object.entries(ENV_MAP)) {
    const envVal = process.env[envKey];
    if (envVal !== undefined && envVal !== '') {
      const defaultVal = getNestedValue(CONFIG_DEFAULTS, configPath);
      setNestedValue(config, configPath, coerceValue(envVal, defaultVal));
    }
  }

  return config;
}

/**
 * Get a single config value by dot-path (e.g., "db.backend").
 * Env vars are checked first, then file, then defaults.
 *
 * @param {string} key - Dot-separated config path.
 * @returns {*} Config value.
 */
function getConfigValue(key) {
  const config = getConfig();
  return getNestedValue(config, key);
}

/**
 * Set a config value by dot-path and write to disk.
 * Only modifies the config file -- does not change env vars.
 *
 * @param {string} key - Dot-separated config path (e.g., "db.backend").
 * @param {*} value - Value to set.
 */
function setConfig(key, value) {
  const fileConfig = readConfigFile();
  setNestedValue(fileConfig, key, value);
  writeConfigFile(fileConfig);
}

/**
 * Initialize the config file with defaults if it doesn't exist.
 * Creates ~/.carbonkit/ directory and config.json.
 * Safe to call multiple times -- won't overwrite existing config.
 *
 * @param {object} [overrides] - Optional values to merge over defaults.
 * @returns {object} The initialized config.
 */
function initConfig(overrides) {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }

  // Create data directory
  const dataDir = path.join(CONFIG_DIR, 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // Create blobs directory
  const blobsDir = path.join(CONFIG_DIR, 'blobs');
  if (!fs.existsSync(blobsDir)) {
    fs.mkdirSync(blobsDir, { recursive: true });
  }

  // Create backups directory
  const backupsDir = path.join(CONFIG_DIR, 'backups');
  if (!fs.existsSync(backupsDir)) {
    fs.mkdirSync(backupsDir, { recursive: true });
  }

  if (fs.existsSync(CONFIG_PATH)) {
    // Config already exists -- merge overrides if provided
    if (overrides) {
      const existing = readConfigFile();
      for (const [key, val] of Object.entries(overrides)) {
        setNestedValue(existing, key, val);
      }
      writeConfigFile(existing);
    }
    return getConfig();
  }

  // First run -- write defaults with optional overrides
  const config = deepClone(CONFIG_DEFAULTS);
  if (overrides) {
    for (const [key, val] of Object.entries(overrides)) {
      setNestedValue(config, key, val);
    }
  }
  writeConfigFile(config);
  return config;
}

/**
 * Reset config to defaults. Overwrites existing file.
 * @returns {object} Default config.
 */
function resetConfig() {
  const config = deepClone(CONFIG_DEFAULTS);
  writeConfigFile(config);
  return config;
}

module.exports = {
  getConfig,
  getConfigValue,
  setConfig,
  initConfig,
  resetConfig,
  CONFIG_PATH,
  CONFIG_DIR,
  CONFIG_DEFAULTS,
  ENV_MAP,
};
