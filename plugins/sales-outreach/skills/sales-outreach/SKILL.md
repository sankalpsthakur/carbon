---
name: sales-outreach
description: Execute sales and outreach workflows with strict approval gating, call qualification, and audit-ready artifacts.
---

## Auth/Env
- RETELL_API_KEY
- RETELL_FROM_NUMBER
- RETELL_AGENT_ID
- HUNTER_API_KEY
- APOLLO_API_KEY
- APOLLO_BASE_URL
- GMAIL_CREDENTIALS_PATH

## MCP Server Environment Variables

This plugin ships two optional MCP server connectors (retell, hunter-io).
Each server validates its required environment variables at startup using the
`${VAR:?message}` shell pattern and will exit with a clear error if any are missing.
This is intentional -- the servers are optional connectors and only start when
their credentials are present.

| MCP Server  | Required Variables                  |
|-------------|-------------------------------------|
| `retell`    | `MCP_ROOT`, `RETELL_API_KEY`        |
| `hunter-io` | `MCP_ROOT`, `HUNTER_API_KEY`       |

Set `MCP_ROOT` to the directory containing the MCP server source trees
(e.g. `retell-mcp-server/`, `hunter-io-mcp-server/`).

## Primary Workflows
- workflows:sales-outreach:run-daily-revenue-cycle
- workflows:sales-outreach:prepare-approval-batch
- workflows:sales-outreach:launch-voice-qualification

## Bundled Skills

### Voice Qualification
- skills/retell-calls — AI-powered outbound calls via Retell API with ESG lead qualification and CRM webhook integration
