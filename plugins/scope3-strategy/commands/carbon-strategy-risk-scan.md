---
name: carbon-strategy-risk-scan
description: Scan external regulatory, media, and NGO channels for ESG risk signals.
allowed-tools:
  - mcp__strategy-local__strategy.risk_scan
  - mcp__strategy-local__strategy.iro.create
  - mcp__strategy-local__strategy.db.list
---
Use this command to scan for emerging ESG risk signals and optionally convert high-priority signals into IRO (Impact, Risk, Opportunity) records.

## Available operations

1. **Run a risk scan**:
   - `strategy.risk_scan` with `keywords` (array of search terms), optional `channels` (subset of `regulatory`, `media`, `ngo`), and optional `since` (ISO date to limit recency).
   - Returns a ranked list of signals.

2. **Create an IRO from a signal**:
   - `strategy.iro.create` with `title`, `type` (impact | risk | opportunity), `description`, `source_signal_id`, and `esrs_topic`.
   - Links the new IRO back to the originating risk signal.

3. **List existing IROs or signals**:
   - `strategy.db.list` with `collection: "iros"` or `collection: "risk_signals"` to check for duplicates before creating.

## Signal ranking dimensions

Each signal is scored on five dimensions (1-5 scale):

| Dimension       | What it measures                                    |
|-----------------|-----------------------------------------------------|
| Severity        | Potential magnitude of impact on the organisation.  |
| Relevance       | Alignment with the company's sector and operations. |
| Credibility     | Trustworthiness of the source channel.              |
| Novelty         | Whether this is a new or previously tracked signal. |
| Actionability   | How directly the organisation can respond.          |

The composite score is the weighted average, with severity and relevance weighted 2x.

## DB collections involved

| Collection     | Purpose                                  |
|----------------|------------------------------------------|
| risk_signals   | Raw signals from scan results            |
| iros           | Impact, Risk, Opportunity records        |
| dma_topics     | DMA topics linked to IROs                |

## Workflow

1. Run `strategy.risk_scan` with relevant keywords (e.g. `["CBAM", "deforestation", "CSRD enforcement"]`).
2. Review the ranked signal list, focusing on high composite scores.
3. Check `strategy.db.list` with `collection: "iros"` to avoid duplicate IRO creation.
4. For high-priority signals, call `strategy.iro.create` to convert them into actionable IRO records.
5. Re-run periodically to track evolving regulatory and reputational landscape.
