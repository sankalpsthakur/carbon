---
name: carbon-connect-configure
description: Configure a data source connection with API credentials and sync settings.
allowed-tools:
  - connectors.list
  - connectors.db.get
  - connectors.db.set
  - connectors.db.delete
  - connectors.health
---
Usage: `/carbon:connect:configure <source>`

## Parameters
- `source`: Source system name to configure (e.g. sap-s4hana, xero, quickbooks)

## Workflow

1. Verify the source has a mapping config via `connectors.list`.
2. Check for existing configuration via `connectors.db.get` with collection `connector_state`.
3. Prompt user for required configuration based on the mapping config's auth_type:

   For oauth2 sources:
   - base_url: API base URL
   - client_id: OAuth2 client ID
   - client_secret: OAuth2 client secret (store securely)
   - token_url: Token endpoint URL
   - scope: Required OAuth scopes

   For api_key sources:
   - base_url: API base URL
   - api_key: API key value
   - header_name: Header name for the key (default X-API-Key)

   For file-based sources (csv, excel):
   - default_file_path: Default directory to scan for files
   - delimiter: CSV delimiter override
   - sheet_name: Excel sheet name override

4. Save configuration via `connectors.db.set` to collection `connector_state`.
5. Test the connection (for API sources) by making a health check request.
6. Report configuration status.

## Security notes
- API keys and secrets should be stored as environment variable references, not plaintext.
- Store as `{ secret_ref: "ENV_VAR_NAME" }` rather than the actual secret value.
- The rest-adapter resolves secret_ref at runtime from process.env.

## Examples
```
/carbon:connect:configure sap-s4hana
/carbon:connect:configure xero
/carbon:connect:configure generic-csv
```
