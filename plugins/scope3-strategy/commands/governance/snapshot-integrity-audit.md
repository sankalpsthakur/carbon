---
name: snapshot-integrity-audit
description: Audit DMA snapshot integrity and ensure export chain uses finalized snapshot-bound reports.
allowed-tools:
  - Bash
  - Read
  - Grep
---
Audit snapshot chain of custody.

Checks:
1. Validate DMA snapshot status is `final`.
2. Verify compute report is stamped with matching `snapshot_id`.
3. Validate export evidence pack manifest and section digests.

Gate:
- No export if snapshot linkage or manifest integrity is missing.
