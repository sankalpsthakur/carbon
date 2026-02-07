---
name: shared-services
description: Shared MCP servers (sequential-thinking, nano-banana) used across multiple plugins.
version: 0.1.0
---

# shared-services

This plugin provides shared MCP server configurations used by multiple plugins in the portfolio.

## MCP Servers

- **sequential-thinking** — Structured reasoning via the sequential-thinking MCP server
- **nano-banana** — Gemini-powered capabilities via nano-banana MCP server (requires `GOOGLE_API_KEY`)

## Environment Variables

| Variable | Required By | Description |
|----------|------------|-------------|
| `MCP_ROOT` | Both servers | Root directory containing MCP server installations |
| `GOOGLE_API_KEY` | nano-banana | Google/Gemini API key |
