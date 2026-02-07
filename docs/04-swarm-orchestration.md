# 04: Team & Agent Orchestration

How Claude Code's native primitives (TeamCreate, SendMessage, Task, TaskCreate) map to CarbonKit's plugin system for multi-agent coordination.

## Core Mapping

| Claude Code Primitive | CarbonKit Concept | Example |
|----------------------|-------------------|---------|
| `TeamCreate` | Team composition from `teams.json` | `esg-scope3` team spawns agents from 4 plugins |
| `Task` (subagent spawn) | Plugin agent `.md` file | `spend-baseline-operator.md` becomes a teammate |
| `SendMessage` | Inter-agent coordination | Strategy agent sends DMA results to calculation agent |
| `TaskCreate/TaskUpdate` | Work items with dependencies | "Ingest spend data" blocks "Compute emissions" |
| `TaskList` | Shared task board | All agents see team progress and claim available work |
| Plugin MCP tools | Agent capabilities | `calc.ingest`, `calc.compute`, `exec.ocr` |
| Plugin commands | Executable workflows | `/carbon:calc:ingest` triggers the ingest flow |
| Plugin skills | Domain knowledge | `compute-method-hierarchy/SKILL.md` informs factor selection |

## Team Composition: `teams.json`

Teams define which plugins (and therefore which agents, commands, skills, and MCP tools) are available to a team:

```json
{
  "esg-scope3": {
    "description": "End-to-end Scope 3: DMA/strategy, calculation, execution controls, and quality gates.",
    "plugins": [
      "scope3-strategy",
      "scope3-calculation",
      "scope3-execution",
      "quality-monitoring"
    ]
  }
}
```

When a team is created, every agent, command, skill, and MCP tool from the listed plugins becomes available. The team lead dispatches work by spawning agents and assigning tasks.

### Current Teams

| Team | Plugins | Agents Available | MCP Tools |
|------|---------|-----------------|-----------|
| `esg-scope3` | strategy, calculation, execution, quality | ~15 agents | calc (11) + exec (21) + strategy (18) |
| `esg-scope12` | scope12-accounting, quality | ~7 agents | scope12 (planned) |
| `esg-full-swarm` | All ESG plugins + connectors + swarms | ~30+ agents | All servers |
| `revops` | sales-outreach, quality | ~4 agents | - |
| `growth` | growth-content, ai-engineering, quality | ~5 agents | - |

## Agent `.md` -> Teammate

Each plugin agent is a markdown file with YAML frontmatter defining its identity and an execution protocol defining how it works:

```yaml
---
name: spend-baseline-operator
description: Operates a spend-first rapid baseline workflow...
---
Mission:
- Deliver a fast Scope 3 baseline while preserving traceability.

Execution order:
1. commands/ingest/client-server-ingest-flow.md
2. commands/factors/factor-index-search-governance.md
3. commands/baseline/spend-rapid-baseline-screenshot.md
4. commands/compute/refresh-summary-and-replay.md

Hard gates:
- Stop on mixed-unit quantity calculations...
- Stop on FX normalization gaps...
```

When spawned as a teammate via `Task`, the agent:
1. Reads its `.md` definition for mission and execution order
2. Has access to its plugin's MCP tools (e.g., `calc.ingest`, `calc.compute`)
3. Follows the command references sequentially
4. Applies hard gates as stop conditions
5. References skills for domain knowledge

### Agent Dispatch Pattern

```
Team Lead
  |
  |-- Task(subagent_type="general-purpose", team_name="esg-scope3")
  |     prompt: "You are spend-baseline-operator. Follow your .md execution protocol."
  |     -> Spawns teammate with access to calc-mcp tools
  |
  |-- Task(subagent_type="general-purpose", team_name="esg-scope3")
  |     prompt: "You are external-risk-intelligence-analyst. Run risk scan."
  |     -> Spawns teammate with access to strategy-mcp tools
  |
  |-- Coordinates via SendMessage + TaskCreate/TaskUpdate
```

## Plugin MCP Tools -> Agent Capabilities

Each plugin registers MCP tools that agents can call. The tool namespace maps to the plugin:

| Plugin | MCP Server | Tool Namespace | Tool Count |
|--------|-----------|----------------|------------|
| scope3-calculation | `calc-mcp.js` | `calc.*` | 11 |
| scope3-execution | `exec-mcp.js` | `exec.*` | 21 |
| scope3-strategy | `strategy-mcp.js` | `strategy.*` | 18 |
| scope12-accounting | `scope12-mcp.js` | `scope12.*` | planned |
| connectors | `connectors-mcp.js` | `connectors.*` | 10 |
| swarms | `swarm-mcp.js` | `swarm.*` | 14 |

Agents within a team have access to all MCP tools from plugins listed in that team's config. Some agent `.md` files specify `allowedTools` to restrict scope:

```yaml
---
name: swarm-conductor
allowedTools:
  - swarm.health
  - swarm.validate
  - swarm.run
  - swarm.status
  - Read
  - Glob
  - Bash
---
```

## Cross-Plugin Collaboration

The power of the team model is that agents from different plugins can collaborate through shared task boards and direct messages.

### Pattern 1: Sequential Handoff

Strategy agent completes DMA, hands off to calculation agent:

```
TaskCreate: "Run double materiality assessment" -> strategy agent
  |
  TaskUpdate: completed (output: DMA results in strategy DB)
  |
TaskCreate: "Ingest spend data using DMA material topics" -> calculation agent
  |
  Reads strategy.db.get('assessments', ...) for material topics
  Runs calc.ingest with filtered categories
```

### Pattern 2: Parallel Fan-Out

Multiple agents work simultaneously, results merged by lead:

```
TaskCreate: "Scan supplier risk signals" -> risk-intelligence-analyst
TaskCreate: "Score supplier maturity" -> supplier-maturity-analyst
TaskCreate: "Compute supplier emissions" -> spend-baseline-operator
  |
  All three complete in parallel
  |
Team lead merges results: risk scores + maturity + emissions -> supplier priority ranking
```

### Pattern 3: Pipeline with Gates

Each stage must pass quality gates before the next begins:

```
Stage 1: Ingest -> calculation agent
  Gate: row_count > 0, reconciliation.match_rate > 0.95
  |
Stage 2: Compute -> calculation agent
  Gate: method_none_pct < 0.05, dqs_avg < 2.5
  |
Stage 3: Evidence Pack -> execution agent
  Gate: all documents rendered, OCR confidence > 0.8
  |
Stage 4: Disclosure -> strategy agent
  Deliverable: CSRD-ready disclosure with audit trail
```

### Pattern 4: Cross-Scope Reconciliation

Agents from different scope plugins collaborate:

```
Team: esg-full-swarm (all plugins)
  |
  Scope 1/2 agent (scope12-accounting) -> direct emissions total
  Scope 3 agent (scope3-calculation) -> value chain emissions total
  Connectors agent (connectors) -> pulls source data from ERP
  Quality agent (quality-monitoring) -> validates consistency
  |
  Lead reconciles all scopes into unified board report
```

## Data Flow Between Plugins

Agents share data through the unified store adapter. All plugins write to the same store (SQLite or Postgres), using collection namespaces:

| Plugin | Collections | Key Data |
|--------|------------|----------|
| scope3-calculation | `jobs`, `activity_rows`, `factors`, `summaries` | Spend data, emission factors, computed results |
| scope3-execution | `documents`, `ocr_blocks`, `engagements`, `pipelines` | Evidence, supplier engagement records |
| scope3-strategy | `assessments`, `iros`, `snapshots`, `signals` | DMA results, risk signals, audit snapshots |
| scope12-accounting | `scope1_sources`, `scope2_sites`, `scope12_reports` | Combustion, electricity, reports |
| connectors | `connector_configs`, `ingest_runs`, `mapping_errors` | Source configs, ingestion history |
| swarms | `swarm_runs`, `stage_results`, `deliverables` | Workflow execution state |

Cross-plugin data access is direct -- any agent can read from any collection:

```javascript
// Strategy agent reading calculation results
const summary = store.get('summaries', { job_id: 'abc' });

// Execution agent reading strategy DMA
const assessment = store.get('assessments', { _id: 'dma-2025' });
```

## Commands -> Task Assignments

Plugin commands (slash commands) map to work that gets assigned as tasks:

```
/carbon:calc:ingest           -> TaskCreate("Ingest spend data from file")
/carbon:strategy:risk-scan    -> TaskCreate("Run risk intelligence scan")
/carbon:connect:ingest-from   -> TaskCreate("Pull data from SAP and ingest")
/carbon:scope12:compute       -> TaskCreate("Calculate Scope 1/2 emissions")
```

Commands reference other commands in execution chains. An agent following `spend-baseline-operator.md` runs 4 commands in sequence -- each maps to a sub-task.

## Skills -> Domain Knowledge

Skills provide reusable domain knowledge that agents reference during execution. They don't create tasks -- they inform how tasks are performed:

| Skill | Used By | Provides |
|-------|---------|----------|
| `compute-method-hierarchy/SKILL.md` | calculation agents | Factor selection priority: supplier > quantity > spend > none |
| `scope1-method-rules/SKILL.md` | scope12 agents | Combustion calculation rules, GWP application |
| `schema-mapping/SKILL.md` | connector agents | How field mapping transforms work |
| `dag-resolution/SKILL.md` | swarm conductor | How to resolve workflow stage ordering |

## Putting It Together: Full Scope 3 Audit

```
User: "Run a full Scope 3 audit for FY2025"

1. Team Lead creates team: esg-full-swarm
   -> TeamCreate("esg-fy2025-audit")

2. Team Lead creates task board:
   -> TaskCreate("Pull FY2025 spend from SAP")           [connectors agent]
   -> TaskCreate("Run DMA for material topics")           [strategy agent]
   -> TaskCreate("Ingest and compute Scope 3")             [calculation agent]
   -> TaskCreate("Build evidence pack")                    [execution agent]
   -> TaskCreate("Prepare CSRD disclosure")                [strategy agent]
   -> Dependencies: task 3 blocked by 1+2, task 4 blocked by 3, task 5 blocked by 4

3. Agents claim tasks, work in parallel where possible:
   - Connectors agent: connectors.map -> connectors.ingest -> calc.ingest
   - Strategy agent: strategy.risk_scan -> strategy.db.set (DMA assessment)
   - [gate: both complete]
   - Calculation agent: calc.compute -> calc.dqs_score -> calc.export
   - [gate: DQS < 2.5, method_none < 5%]
   - Execution agent: exec.upload_pdf -> exec.render_page -> exec.ocr
   - [gate: all pages rendered, OCR > 80% confidence]
   - Strategy agent: assembles disclosure with snapshot.verify

4. Team Lead assembles deliverable:
   -> SHA-256 hash of all outputs
   -> Full audit trail of which agent did what, when, with what tools
```
