# Env, API Keys, and Auth Setup

This document covers connector prerequisites for the plugins in this repo:
- `sales-outreach`
- `ai-engineering`
- `growth-content`
- `quality-monitoring`

Notes:
- The Scope plugins (`scope12-accounting`, `scope3-*`) are policy/workflow packs and do not require API keys by default.
- This repo does not store secrets. API keys are read from environment variables at runtime.

## Setup Checklist (New Person)

1. Install prerequisites (Node.js, Python, jq).
2. If you want to use external MCP connectors, ensure MCP servers are present and set `MCP_ROOT` (required for those plugins).
3. Create a local env file in this repo (gitignored), for example:
   - `.env.plugins.local`
4. Load env (bash/zsh):
```bash
set -a
source .env.plugins.local
set +a
```
5. Validate this bundle:
```bash
python3 scripts/validate_bundle.py --mcp-selftest
```

## 1) Core Runtime

- `Node.js` (18+ recommended)
- `Python` (3.10+ recommended)
- `jq`
- Optional visual tools:
  - `npx playwright` for visual regression paths

## 2) Required Environment Variables

| Variable | Required For | Purpose |
|---|---|---|
| `MCP_ROOT` | MCP-backed plugins | Base path to your MCP servers checkout. Required for `ai-engineering`, `growth-content`, `sales-outreach` when using their `.mcp.json` connectors. |
| `GOOGLE_API_KEY` | `ai-engineering`, `growth-content` | Mapped to `GEMINI_API_KEY` for `nano-banana` image MCP. |
| `RETELL_API_KEY` | `sales-outreach` | Auth for `retell-mcp-server`. |
| `HUNTER_API_KEY` | `sales-outreach` | Auth for `hunter-io-mcp-server`. |

Optional tuning vars:

- `HUNTER_RETRY_MAX_ATTEMPTS`
- `HUNTER_RETRY_INITIAL_DELAY`
- `HUNTER_RETRY_MAX_DELAY`
- `HUNTER_RETRY_BACKOFF_FACTOR`

## 3) Connector Auth Notes

### Retell

- Source: `${MCP_ROOT}/retell-mcp-server/index.js`
- Hard requirement: `RETELL_API_KEY` (export in your shell)

### Hunter.io

- Source: `${MCP_ROOT}/hunter-io-mcp-server/README.md`
- Hard requirement: `HUNTER_API_KEY`

### Nano Banana (Gemini image)

- Source: `${MCP_ROOT}/nano-banana-mcp-server/README.md`
- Hard requirement: `GEMINI_API_KEY` (this repo wires it from `GOOGLE_API_KEY`)

## 4) Example Export Block

```bash
export MCP_ROOT=/absolute/path/to/mcp
export GOOGLE_API_KEY=your_google_key
export RETELL_API_KEY=your_retell_key
export HUNTER_API_KEY=your_hunter_key
```

## 5) Validation Commands

Run bundle validation:

```bash
python3 scripts/validate_bundle.py --mcp-selftest
```
