-- CarbonKit Postgres schema initialization
-- Applied automatically by docker-compose.postgres.yml via initdb.d mount.

-- Generic document store table used by all MCP servers.
-- Each server uses a different "server" + "collection" namespace.
CREATE TABLE IF NOT EXISTS documents (
  id            TEXT PRIMARY KEY,
  server        TEXT NOT NULL,       -- calc, exec, strategy, scope12, swarm, connectors
  collection    TEXT NOT NULL,
  data          JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_documents_server_collection
  ON documents (server, collection);

CREATE INDEX IF NOT EXISTS idx_documents_updated
  ON documents (updated_at DESC);

-- GIN index for JSONB queries (e.g. filtering by field values)
CREATE INDEX IF NOT EXISTS idx_documents_data
  ON documents USING GIN (data);

-- Blob metadata table (actual blobs stored in /app/blobs or S3)
CREATE TABLE IF NOT EXISTS blobs (
  id            TEXT PRIMARY KEY,
  server        TEXT NOT NULL,
  filename      TEXT NOT NULL,
  content_type  TEXT DEFAULT 'application/octet-stream',
  size_bytes    BIGINT DEFAULT 0,
  storage_path  TEXT NOT NULL,
  metadata      JSONB DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_blobs_server
  ON blobs (server);

-- Metrics / audit log table for tool invocations
CREATE TABLE IF NOT EXISTS tool_invocations (
  id            BIGSERIAL PRIMARY KEY,
  server        TEXT NOT NULL,
  tool          TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'ok',  -- ok, error
  duration_ms   INTEGER,
  input_summary TEXT,
  error_message TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tool_invocations_server_tool
  ON tool_invocations (server, tool);

CREATE INDEX IF NOT EXISTS idx_tool_invocations_created
  ON tool_invocations (created_at DESC);

-- Swarm run tracking
CREATE TABLE IF NOT EXISTS swarm_runs (
  id            TEXT PRIMARY KEY,
  workflow_id   TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending',  -- pending, running, completed, failed
  config        JSONB DEFAULT '{}',
  result        JSONB DEFAULT '{}',
  started_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_swarm_runs_status
  ON swarm_runs (status);

-- Grant permissions
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO carbonkit;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO carbonkit;
