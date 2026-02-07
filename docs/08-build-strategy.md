# 08: Build Strategy

## Overview

CarbonKit is built by a 4-agent swarm team working in parallel after a shared foundation (Gate 0) is established. This document covers team composition, execution order, dependencies, and the Gate 0 concept.

---

## Team Composition

```
Team Lead (coordinator)
  |
  +-- DB & MCP Lead      -- Workstreams 1, 2, 3
  |     Core infrastructure: store adapter, stub completion, scope12 engine
  |
  +-- Swarm Lead          -- Workstream 4
  |     Orchestration: DAG engine, workflows, agents, commands
  |
  +-- Connectors Lead     -- Workstreams 7, 5, 8
  |     Integration: schema mapping, Docker, seed data, self-hosting
  |
  +-- Quality Lead        -- Workstream 6
        Testing: test suite, CI pipeline, docs, auth
```

### Responsibilities

| Agent | Primary Work | Deliverables |
|-------|-------------|-------------|
| **DB & MCP Lead** | Store adapter (file/sqlite/postgres), wire 3 existing MCP servers, complete exec stubs (render_page, ocr), complete strategy stubs (risk_scan, snapshot.verify), build scope12-mcp.js | `store-adapter.js`, backends, `scope12-mcp.js`, enhanced calc/exec/strategy servers |
| **Swarm Lead** | DAG orchestration engine, YAML schema, 8 workflow templates, 4 agents, 4 commands, 4 skills | `swarm-mcp.js`, plugin structure, workflows, schema |
| **Connectors Lead** | Schema mapping engine, 10 mapping configs, 6 lookup tables, Docker infrastructure, LLM router, seed data | `connectors-mcp.js`, mappings, Docker files, reference data |
| **Quality Lead** | Test suite (7 test files), CI pipeline, fixture data, auth module, config module, documentation (8 docs) | Test files, `ci.yml`, fixtures, `auth.js`, `config.js`, `/docs/` |

---

## Gate 0: Database Foundation

Gate 0 is the critical path item that must complete before parallel work can begin. It establishes the unified store adapter that all MCP servers depend on.

### Gate 0 Tasks

| Step | Task | Owner | Blocks |
|------|------|-------|--------|
| 0.1 | Create `store-adapter.js` with file/sqlite backends | DB Lead | Everything |
| 0.2 | Create `validate.js` and `mcp-helpers.js` shared utilities | DB Lead | All MCP servers |
| 0.3 | Wire all 3 existing MCP servers to new adapter | DB Lead | Server tests |
| 0.4 | Fix `carbonkit-cli.js` MCP framing bug | DB Lead | CLI usage |
| 0.5 | Run `test-mcp-servers.js` to verify no regression | Quality Lead | Parallel work |

### Gate 0 Acceptance Criteria

- All 3 existing MCP servers pass health check and return expected tool counts
- Store adapter supports `get`, `set`, `delete`, `list`, `bulkSet`, `count`, `close`
- SQLite backend creates WAL-mode database at configured path
- File backend is backward-compatible with existing JSON file data
- `validate.js` exports `requireString`, `requireNumber`, `optString`, `optNumber`
- `mcp-helpers.js` exports `toolJSON`, `toolError`, `textResult`

### Why Gate 0 First

Without a unified store adapter:
- scope12-mcp.js would need its own inline FileStore (4th divergent implementation)
- swarm-mcp.js would need its own inline FileStore (5th divergent implementation)
- connectors-mcp.js would need its own inline FileStore (6th divergent implementation)
- No cross-plugin data views possible
- No migration path to SQLite/Postgres

Gate 0 eliminates this debt before it compounds.

---

## Parallel Workstreams (After Gate 0)

### Dependency Graph

```
Gate 0 (DB Foundation)
  |
  +----+----+----+
  |    |    |    |
  v    v    v    v
 WS2  WS4  WS7  WS6
 WS3       WS5  (continuous)
           WS8

Legend:
  WS2 = MCP Stub Completion (DB Lead)
  WS3 = Scope 1/2 Server (DB Lead)
  WS4 = Swarm Orchestration (Swarm Lead)
  WS5 = Self-Hosting Infra (Connectors Lead)
  WS6 = Testing & CI (Quality Lead)
  WS7 = Connectors (Connectors Lead)
  WS8 = Seed Data (Connectors Lead)
```

### Cross-Workstream Dependencies

| Dependency | Source | Target | Nature |
|-----------|--------|--------|--------|
| Store adapter API | WS1 (Gate 0) | WS2, WS3, WS4, WS7 | All new MCP servers import store-adapter |
| scope12-mcp.js | WS3 | WS4 (scope12 workflows) | Swarm workflows reference scope12 tools |
| connectors-mcp.js | WS7 | WS4 (data-collection workflow) | Data collection workflow uses connectors |
| Seed data | WS8 | WS6 (test fixtures) | Tests need reference data |
| Docker setup | WS5 | WS6 (docker-build CI job) | CI builds Docker images |

### How Dependencies Are Managed

1. **Swarm Lead** builds workflows with tool references that will exist after WS2/WS3 complete. YAML validation checks tool existence at runtime, not build time.
2. **Quality Lead** writes tests against the API contract, not the implementation. Tests can be written before stubs are completed.
3. **Connectors Lead** builds mapping configs independently (YAML files with no code dependencies).
4. **All leads** import `store-adapter.js` from a stable path, so Gate 0 must be solid.

---

## Execution Order (DB & MCP Lead)

| Step | Task | Duration |
|------|------|----------|
| 1-6 | Complete exec stubs (render_page, ocr, upload_pdf, pipeline, export PDF) | ~2 hours |
| 7-13 | Complete strategy stubs + cross-cutting fixes (risk_scan, snapshot.verify, factor matching, CSV, rate limiting, dedup, checkpoint) | ~1.5 hours |
| 14 | Create scope12-mcp.js protocol boilerplate | ~30 min |
| 15-16 | Implement Scope 1 engine (4 source types + GWP) | ~1.5 hours |
| 17-18 | Implement Scope 2 dual-ledger + KPI normalization | ~1.5 hours |
| 19 | Bundle reference data (GWP, grid factors, combustion factors) | ~30 min |

## Execution Order (Swarm Lead)

| Step | Task | Duration |
|------|------|----------|
| 21 | Plugin structure + plugin.json + .mcp.json | ~15 min |
| 22 | swarm-v1.schema.json | ~30 min |
| 23 | swarm-mcp.js core engine | ~3 hours |
| 24 | 4 agent markdown files | ~45 min |
| 25 | 8 workflow YAML templates | ~1.5 hours |
| 26-27 | Commands (4) + skills (4) | ~1 hour |
| 28 | teams.json update | ~5 min |

## Execution Order (Connectors Lead)

| Step | Task | Duration |
|------|------|----------|
| 29 | Plugin structure | ~15 min |
| 30 | connectors-mcp.js engine | ~2 hours |
| 31 | 10 mapping configs (YAML) | ~2 hours |
| 32 | 6 lookup tables | ~1 hour |
| 33-35 | Agents, commands, skills, rest-adapter | ~2 hours |
| 36-37 | MCP HTTP transport, Docker, Makefile | ~2 hours |
| 38-39 | LLM router, agent runtime, observability | ~1.5 hours |
| 40-42 | Auth, seed data, test fixtures | ~1.5 hours |

## Execution Order (Quality Lead)

| Step | Task | Duration |
|------|------|----------|
| 43-49 | Test files (7 test suites) | ~3 hours |
| 50 | CI pipeline | ~30 min |
| 51 | Integration test run | ~1 hour |
| 52-53 | Cleanup (tool naming, stale refs) | ~30 min |
| Ongoing | Documentation (8 docs) | ~2 hours |
| Ongoing | Auth + config modules | ~1 hour |

---

## Verification Gates

### Post Gate 0

```bash
node plugins/test-mcp-servers.js
# Expected: 3 servers, all PASS, tool counts match
```

### Post Parallel Build

```bash
node plugins/test-mcp-servers.js
# Expected: 6 servers (calc, exec, strategy, scope12, swarm, connectors), all PASS

make test
# Expected: all 7 test suites pass

make up
# Expected: Docker stack starts, health checks pass
```

### Final Acceptance

All 18 verification tests from the build spec pass (see CARBONKIT_BUILD_SPEC.md section 14).
