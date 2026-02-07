# CarbonKit: Self-Hosted Swarm Research Platform

## Build Plan Documentation

This directory contains the complete build plan for transforming CarbonKit from a Claude Code plugin SDK into a **fully self-hostable, privacy-first carbon/ESG research platform** with agent swarm orchestration.

### Documents

| Document | Description |
|----------|-------------|
| [00-overview.md](./00-overview.md) | Context, current state, and vision |
| [01-database-layer.md](./01-database-layer.md) | Workstream 1: Unified SQLite/Postgres store adapter |
| [02-mcp-completion.md](./02-mcp-completion.md) | Workstream 2: Complete stubbed MCP tools (OCR, PDF, risk scan) |
| [03-scope12-server.md](./03-scope12-server.md) | Workstream 3: New Scope 1/2 MCP server with calculation engines |
| [04-swarm-orchestration.md](./04-swarm-orchestration.md) | Workstream 4: DAG-based multi-agent swarm system |
| [05-self-hosting.md](./05-self-hosting.md) | Workstream 5: Docker, LLM abstraction, auth, privacy |
| [06-testing-ci.md](./06-testing-ci.md) | Workstream 6: Test suite and CI pipeline |
| [07-connectors.md](./07-connectors.md) | Workstream 7: ERP/CRM/SaaS schema mapping and MCP registry |
| [08-build-strategy.md](./08-build-strategy.md) | Swarm team composition and parallel execution plan |
| [09-erp-crm-research.md](./09-erp-crm-research.md) | Integration research: APIs, schemas, MCP servers for 23 systems |

### Quick Stats

- **7 workstreams** across ~70 new/modified files
- **10 new plugins/plugins**: 2 new plugins (swarms, connectors) + enhancements to 8 existing
- **4-agent swarm team** building in parallel after Gate 0 (DB foundation)
- **8 pre-built swarm workflows** for real-world ESG research
- **10 schema mapping configs** covering SAP, NetSuite, Dynamics 365, Xero, QuickBooks, Coupa, Concur, Brex/Ramp, CSV, Excel
- **13 external MCP servers** registered for Excel, Browser, Sheets, PDF, DB, accounting, ERP
