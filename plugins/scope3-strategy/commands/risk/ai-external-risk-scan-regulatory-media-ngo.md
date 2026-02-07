---
name: ai-external-risk-scan-regulatory-media-ngo
description: Run AI-powered external risk scanning across regulatory, media, and NGO sources and convert validated signals into DMA-ready evidence.
allowed-tools:
  - Read
  - Write
  - Edit
  - MultiEdit
  - Glob
  - Grep
  - Bash
---
Use this flow to produce screenshot-ready proof of proactive external risk intelligence.

Signal channels (all required):
1. Regulatory: EU and local regulator releases, consultations, enforcement notices.
2. Media: high-reliability business press plus sector-specialist publications.
3. NGO/civil society: watchdog reports, campaign updates, and independent impact studies.

Execution sequence:
1. Define scan frame
- Set `org_id`, `year`, geographies, value chain segments, and ESRS topic map (`E1/E2/E3/E5`).
- Define watch keywords by risk archetype (compliance, litigation, supply disruption, reputational harm).

2. Collect and normalize external signals
- Ingest source metadata: `source_name`, `published_at`, `url`, `jurisdiction`, `topic_hint`, `claim_summary`.
- Capture an immutable evidence object per signal (mandatory), then deduplicate by canonical URL hash + semantic similarity + publication date windows.

Mandatory evidence object (per signal):
```json
{
  "evidence_snapshot_id": "evsnap_<opaque_id>",
  "retrieved_at": "2026-02-06T16:22:05Z",
  "canonical_url": "https://example.com/source",
  "canonical_url_sha256": "<64-hex-sha256>",
  "excerpt": {
    "quote": "verbatim excerpt containing the claim + enough context to interpret it",
    "quote_sha256": "<64-hex-sha256>",
    "capture_notes": "where in the page/doc the quote came from (section heading, paragraph index, etc.)"
  }
}
```

Evidence capture rules (strict):
- `evidence_snapshot_id` is immutable: once assigned to a signal, never overwrite it. If re-retrieved, create a new snapshot id and keep the prior one.
- `retrieved_at` must be the actual retrieval time in ISO 8601 UTC (`...Z`).
- Resolve and store a canonical URL (follow redirects; strip known tracking params) before hashing.
- `canonical_url_sha256` must be SHA-256 hex of the canonical URL string.
- `excerpt.quote` must be verbatim and include enough surrounding context to stand alone; do not rely on paraphrase-only claims for acceptance.
- Always hash the captured excerpt (`quote_sha256`) to make the captured evidence tamper-evident.

3. AI triage and ranking
- Classify each signal into `impact|risk|opportunity` candidate class.
- Score dimensions (0-10):
  - `severity`, `relevance`, `source_credibility`, `novelty`, `actionability`.
- Compute weighted priority:
  - `priority = 0.30*severity + 0.25*relevance + 0.20*source_credibility + 0.15*novelty + 0.10*actionability`.

4. Convert validated signals into DMA evidence
- For existing IROs: attach via `POST /api/dma/iros/{iro_id}/evidence` using `url` or `external_doc`.
- For novel high-priority themes: create new IRO candidates with `POST /api/dma/iros`, then link evidence.
- Trigger matrix refresh when material score implications change.

5. Human assurance and disposition
- Require analyst disposition per high-priority signal: `accepted`, `monitor`, or `rejected` with rationale.
- Log false-positive patterns to improve keywording and ranking.

Hard validation gates:
- Block signals without valid URL or publication date.
- Block signals missing the mandatory evidence object (`evidence_snapshot_id`, `retrieved_at`, `canonical_url_sha256`, and `excerpt.quote`).
- Block if canonical URL cannot be normalized/resolved (no canonical URL, or hash mismatch).
- Block if `retrieved_at` is missing or not ISO 8601 UTC.
- Block acceptance when excerpt is not captured verbatim (paraphrase-only) for high-severity claims.
- Block auto-linking of low-credibility sources unless corroborated by independent channel.
- Block score changes driven by a single-source claim for high-severity topics.
- Block unresolved contradictory claims; require at least 2 independent sources before raising confidence.
- Block final publication of scan report when channel coverage misses any of regulatory/media/NGO.

Deliverable:
- External risk scan dossier containing ranked signal table, accepted/rejected rationale, immutable evidence objects (snapshot ids + hashes + excerpts), linked IRO evidence actions, matrix change impacts, and residual watchlist.
