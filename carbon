#!/usr/bin/env bash
set -euo pipefail

# Repo-local entrypoint for the Carbon CLI.
# For npm installs, users will get the `carbon` binary via package.json "bin".

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec node "$ROOT_DIR/plugins/shared-services/tools/carbon-cli.js" "$@"

