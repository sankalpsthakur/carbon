---
name: csrd-dma-precollection-guidance
description: Builds classic strategic CSRD guidance before data collection using DMA-first hypotheses, boundaries, and evidence-ready backlog design.
---
Use this skill when teams need screenshot-ready evidence that strategy came before data collection.

Workflow:
1. Initialize or load DMA assessment for `org_id` + `year`.
2. Create hypothesis IRO set spanning core ESRS environment topics (`E1/E2/E3/E5`).
3. Capture provisional scores as hypotheses with explicit confidence level.
4. Build collection backlog with evidence type, data owner, due date, and fallback source per IRO.
5. Record boundary assumptions before any collection requests.
6. Persist a draft (non-final) snapshot for traceability.

Validation gates:
- Block if DMA context is missing.
- Block if topic coverage is incomplete across required families.
- Block if any IRO lacks a data owner or evidence acquisition path.
- Block if boundary assumptions are absent.

Deliverable:
- CSRD pre-collection strategy packet with hypothesis register, collection controls, and draft snapshot metadata.
