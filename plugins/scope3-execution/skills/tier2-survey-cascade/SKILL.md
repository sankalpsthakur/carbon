---
name: tier2-survey-cascade
description: Runs non-response-based cascade orchestration into tier-2+ suppliers using idempotent engagement updates and evidence-aware suppression gates.
---
Use this skill for multi-tier supplier survey orchestration.

Flow:
1. Build tier-1 queue from `GET /api/suppliers`.
2. Check evidence readiness via `GET /api/suppliers/{supplier_id}/deep-dive`.
3. Pull engagement state from `GET /api/engagements`.
4. Upsert tiered outreach records with `PUT /api/engagements/{supplier_id}`.

Tiering model:
- `tier1`: original supplier benchmark record.
- `tier2+`: deterministic synthetic IDs:
  `tier2::{parent_supplier_id}::{child_key}`,
  `tier3::{parent_supplier_id}::{child_key}`.

Deterministic `child_key` derivation (v1):
- Inputs: `tier_level`, `parent_supplier_id`, and a `child_identity` descriptor (at minimum a real `supplier_name`).
- Canonicalization:
  - Strings: Unicode NFKC, trim, lowercase, collapse internal whitespace to a single space.
  - `website_domain`: extract hostname from URL if needed; lowercase; strip leading `www.`.
  - `email_domain`: domain after `@`; lowercase.
  - `country`: ISO-3166-1 alpha-2 uppercase when known.
  - `external_id` (DUNS/LEI/etc): uppercase; strip spaces and dashes.
  - Omit empty fields after canonicalization.
- Canonical string (UTF-8, newline-delimited, exact key order):
  - `v=1`
  - `tier=<tier_level>`
  - `parent=<parent_supplier_id>`
  - `name=<supplier_name>`
  - `website_domain=<website_domain>`
  - `email_domain=<email_domain>`
  - `country=<country>`
  - `city=<city>`
  - `external_id=<external_id>`
- Hash: `child_key = sha256_hex(canonical_string)` (64 lowercase hex chars). Use MCP tool `exec.sha256` when available.
- Collision/ambiguity handling:
  - Missing identity (empty/all placeholders): do not create a child; emit blocker `missing_child_identity`.
  - Same canonicalized identity => same child engagement (idempotent merge).
  - If synthetic ID already exists but stored `CascadeChildKey::v1::<child_key>` tag mismatches, treat as integrity error `child_key_collision` and block writes.
- Write hygiene: include `CascadeChildKey::v1::<child_key>` in tier engagement notes.

Non-response handling:
- 0-14 days: `pending_response`.
- 15-30 days: `on_hold` + escalation note.
- 31+ days: keep `on_hold` and create next-tier cascade records.

Suppression gate:
- Only suppress when disclosure evidence is strong and provenance-backed.

Edge-case handling:
- Duplicate suppliers: idempotent IDs prevent duplicate cascade writes.
- Missing docs: no suppression; keep requests active.
- OCR confidence thresholds:
  - `OCR_CONF_STRONG >= 0.90`: eligible for automatic suppression if provenance is complete.
  - `OCR_CONF_REVIEW` in `[0.75, 0.90)`: manual review required; do not suppress.
  - `OCR_CONF_LOW < 0.75` or confidence missing: treat as unresolved evidence; do not suppress.
- Non-response tiers: always recorded in notes using `CascadeSurvey::<tier>::...` tags.
