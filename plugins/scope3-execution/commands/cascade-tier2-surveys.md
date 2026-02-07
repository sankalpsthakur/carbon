---
name: cascade-tier2-surveys
description: Orchestrate tier-2+ survey cascades using engagement records, non-response escalation tiers, and evidence-aware suppression from disclosure-first scoring.
allowed-tools:
  - Bash
  - Read
  - Grep
---
Use this command to cascade supplier surveys beyond tier-1 without duplicating requests.

Objective:
- Drive survey completion for tier-2+ networks while suppressing unnecessary requests where public evidence is already strong.

Inputs:
1. Tier-1 candidates from `GET /api/suppliers` (sorted by `upstream_impact_pct`).
2. Evidence and readiness from `GET /api/suppliers/{supplier_id}/deep-dive`.
3. Existing outreach state from `GET /api/engagements` and `GET /api/engagements/{supplier_id}`.

Cascade model:
1. Tier-1 supplier outreach.
- Create/update `PUT /api/engagements/{supplier_id}`.
- If evidence is strong (`evidence_status=ok` + provenance complete + strong OCR confidence per thresholds below), set `status=completed` and suppress survey.
2. Tier-2 expansion.
- For unresolved tier-1 suppliers, create deterministic child IDs:
  `tier2::{parent_supplier_id}::{child_key}`.
- Upsert child outreach with `PUT /api/engagements/{synthetic_tier2_id}`.
3. Tier-3+ continuation.
- Repeat with `tier3::...` IDs only for unresolved parent nodes.

Deterministic `child_key` derivation (v1):
- Purpose: stable synthetic engagement IDs across runs (ordering-independent) and safe idempotent upserts.
- Inputs:
  - `tier_level` (integer, >=2)
  - `parent_supplier_id` (string)
  - `child_identity` (object describing the tier-2+ target; at minimum `supplier_name` plus any stable discriminators you have)
- Canonicalization (apply to each field before hashing):
  - Strings: Unicode NFKC, trim, lowercase, collapse internal whitespace to a single space.
  - `website_domain`: if a URL is provided, extract hostname; lowercase; strip leading `www.`.
  - `email_domain`: if a contact email is provided, use only the domain part (after `@`); lowercase.
  - `country`: ISO-3166-1 alpha-2 uppercase when known, else canonicalized string.
  - `external_id` (DUNS/LEI/etc): uppercase; strip spaces and dashes.
  - Omit fields that are empty after canonicalization.
- Canonical string format (UTF-8, exact key order, newline-delimited):
  - `v=1`
  - `tier=<tier_level>`
  - `parent=<parent_supplier_id>`
  - `name=<supplier_name>`
  - `website_domain=<website_domain>`
  - `email_domain=<email_domain>`
  - `country=<country>`
  - `city=<city>`
  - `external_id=<external_id>`
- Hash:
  - `child_key = sha256_hex(canonical_string)` (64 lowercase hex chars).
  - Use MCP tool `exec.sha256` to generate deterministic keys when running in an MCP-enabled environment.
- Ambiguity / collision handling:
  - If all child identity fields are empty (or `name` is a placeholder like `unknown`/`n/a`), do not create a child engagement; emit blocker `missing_child_identity`.
  - If two candidate children canonicalize to the same canonical string, treat them as the same entity (merge/idempotent upsert) and do not create duplicate child engagements.
  - If an existing engagement ID matches the computed synthetic ID but its stored note tag `CascadeChildKey::v1::<child_key>` differs, treat as integrity error `child_key_collision` and block writes (no auto-suffixing).
- Required write hygiene:
  - When upserting a synthetic tier engagement, include a note tag: `CascadeChildKey::v1::<child_key>`.

Non-response escalation tiers:
1. `tier_response_1` (0-14 days since request):
- status `pending_response`; send reminder language in notes.
2. `tier_response_2` (15-30 days):
- status `on_hold`; include escalation owner and second deadline.
3. `tier_response_3` (31+ days):
- keep `on_hold`; spawn next-tier child engagements and tag parent as escalated.

Standardized cascade note fragments:
- `CascadeSurvey::<tier>::request_sent::<deadline>`
- `CascadeSurvey::<tier>::reminder_1::<deadline>`
- `CascadeSurvey::<tier>::escalation::<owner>`
- `CascadeSurvey::<tier>::suppressed_public_evidence`

Data hygiene and controls:
1. Duplicate suppliers:
- skip write when an equal `(supplier_id, status, next_action_date)` already exists.
- enforce idempotency by deterministic synthetic IDs.
2. Missing docs:
- never suppress on missing evidence; keep active survey status.
3. OCR confidence thresholds (for suppression):
- `OCR_CONF_STRONG >= 0.90` (min block confidence across cited blocks for a field): eligible for automatic suppression.
- `OCR_CONF_REVIEW` in `[0.75, 0.90)`: require manual review; do not suppress.
- `OCR_CONF_LOW < 0.75` or confidence missing: treat as unresolved evidence; do not suppress.

Required output:
- Cascade run report with parent supplier, tier level, engagement ID, status transition, response tier, and suppression rationale.
