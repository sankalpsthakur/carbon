---
name: carbon-connect-list
description: List all available connector mapping configs and their status.
allowed-tools:
  - connectors.health
  - connectors.list
  - connectors.db.list
---
Usage: `/carbon:connect:list`

## Workflow

1. Run `connectors.list` to enumerate all mapping configs in the mappings/ directory.
2. For each config, display:
   - Source name
   - API type (odata, rest, csv, excel)
   - Auth type (oauth2, api_key, none)
   - Version
3. Check `connectors.db.list` with collection `connector_state` for any configured connections.
4. Show connection status for any sources that have been configured:
   - Last sync timestamp
   - Row count from last ingestion
   - Any errors or warnings

## Output format
```
Available Connectors (10):
  sap-s4hana      odata   oauth2    v1.0
  oracle-netsuite  rest    oauth2    v1.0
  dynamics-365     odata   oauth2    v1.0
  xero             rest    oauth2    v1.0
  quickbooks       rest    oauth2    v1.0
  coupa            rest    oauth2    v1.0
  concur           rest    oauth2    v1.0
  brex-ramp        rest    api_key   v1.0
  generic-csv      csv     none      v1.0
  generic-excel    excel   none      v1.0

Configured Connections: (none)
```
