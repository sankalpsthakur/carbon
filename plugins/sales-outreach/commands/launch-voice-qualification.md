---
name: launch-voice-qualification
description: Execute Retell-backed call qualification only for approved leads and persist transcript artifacts.
allowed-tools:
  - Read
  - Write
  - Grep
  - Glob
  - Bash
---

For each approved record:
```bash
python3 skills/retell-calls/call.py --to "+15555550123" --name "Contact" --company "Company" --esg-context true
```
Store call transcript snapshots under `content/calls/transcripts/` and decision outcomes in `state/revenue/call-results.json`.
