# Architecture

## Principles
- Evidence must be tamper-evident: capture immutable identifiers and hashes so downstream linkage is auditable.
- Gates must not drift: a skill must restate the exact hard gates of its corresponding command(s).
- Minimal surface area: MCP server is stdio-only and dependency-free to reduce operational risk.

## Constraints
- Do not change files outside this plugin directory.
- Keep YAML frontmatter valid in all command documents and retain `allowed-tools`.
- MCP server must implement `initialize`, `tools/list`, and `tools/call`.
- External risk scanning must require an immutable evidence snapshot object per signal:
  - `evidence_snapshot_id` (immutable)
  - `retrieved_at` (ISO 8601 UTC)
  - `canonical_url_sha256` (SHA-256 hex of canonical URL)
  - `excerpt.quote` + `quote_sha256` (verbatim excerpt + hash)
