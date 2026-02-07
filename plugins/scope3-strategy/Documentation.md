# Documentation

## Status
- MCP entrypoint: Implemented (`tools/strategy-mcp.js`).
- DMA stakeholder gate parity: Updated `skills/dma-audit-materiality-matrix/SKILL.md` to match the command gates.
- External risk evidence snapshots: Hardened command + skill with mandatory evidence object and strict gates.
- Cleanup: Removed empty legacy skill dirs; cleaned plugin manifest placeholder URLs; bumped version to `0.5.1`.

## Decisions
- Evidence snapshots are treated as immutable per signal ingestion; re-retrieval produces a new `evidence_snapshot_id` rather than overwriting prior snapshots.
- Canonical URL hashing (`canonical_url_sha256`) is the primary dedupe anchor across scans.
- Excerpts must be verbatim and hashed (`quote_sha256`) to make captured evidence tamper-evident.
