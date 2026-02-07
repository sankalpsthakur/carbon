---
name: ai-external-risk-scanning
description: Runs AI-powered external risk scanning from regulatory, media, and NGO sources and links validated findings to DMA evidence.
---
Use this skill when evidence packages need forward-looking external risk intelligence.

Workflow:
1. Define scan scope (topics, geographies, value chain segments).
2. Collect external signals from regulatory, media, and NGO channels.
3. Normalize and harden provenance (mandatory per signal):
   - Resolve canonical URL and compute `canonical_url_sha256`.
   - Capture immutable `evidence_snapshot_id` + `retrieved_at` timestamp.
   - Capture a verbatim excerpt/quote and hash it (`quote_sha256`).
   - Deduplicate using canonical URL hash + semantic similarity + date windows.
   - Classify signals into IRO candidate types.
4. Rank by severity/relevance/credibility/novelty/actionability.
5. Convert validated signals to DMA evidence links or new IRO candidates.
6. Record accepted/rejected dispositions and matrix impact.

Evidence object (required per signal):
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
- `retrieved_at` must be ISO 8601 UTC (`...Z`).
- Resolve and store a canonical URL before hashing; compute `canonical_url_sha256` as SHA-256 hex of the canonical URL string.
- `excerpt.quote` must be verbatim (not paraphrase-only) and include enough context to stand alone; always hash the excerpt (`quote_sha256`).

Validation gates:
- Block sources missing URL or publication metadata.
- Block signals missing mandatory evidence snapshot fields (`evidence_snapshot_id`, `retrieved_at`, `canonical_url_sha256`, `excerpt.quote`).
- Block signals where canonical URL cannot be normalized/resolved (or hash mismatch).
- Block acceptance of high-severity claims without a verbatim excerpt (paraphrase-only is not sufficient).
- Block low-credibility or single-source claims from driving score changes for high-severity topics.
- Block unresolved contradictory claims until corroboration exists.
- Block completion if any required channel class is missing.

Deliverable:
- External risk intelligence packet with ranked signals, immutable evidence snapshots (ids + hashes + excerpts + retrieval timestamps), and DMA linkage actions.
