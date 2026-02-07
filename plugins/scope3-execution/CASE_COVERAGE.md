# CASE_COVERAGE

## Capability Mapping
| Capability | Command | Skill | Agent | Edge-case handling |
| --- | --- | --- | --- | --- |
| Public data/scores first to avoid survey fatigue via disclosure ingestion and screenshot evidence | `commands/disclosure-screenshot-intel.md` | `skills/disclosure-screenshot-intel/SKILL.md` | `agents/public-disclosure-intel-operator.md` | Missing docs -> anomaly + targeted survey; suppression requires `source_docs/source_citations` contract + strong OCR (`>=0.90`); review OCR (`0.75-0.90`) -> manual review; duplicates -> canonical `supplier_id` mapping only |
| Supplier maturity scorecards with standardized engagement language | `commands/supplier-maturity-scorecards.md` | `skills/supplier-maturity-scorecards/SKILL.md` | `agents/supplier-maturity-scorecard-operator.md` | Missing docs caps maturity at `M0`; low-confidence OCR caps at `M1`; duplicate supplier names across IDs raise `duplicate_name_conflict` |
| Cascading survey orchestration into tier-2+ suppliers | `commands/cascade-tier2-surveys.md` | `skills/tier2-survey-cascade/SKILL.md` | `agents/tier2-survey-cascade-operator.md` | Non-response tiers (0-14, 15-30, 31+ days) drive escalation; deterministic tier IDs via `child_key` v1 (sha256 canonical identity); unresolved/low-confidence evidence keeps survey active |

## Explicit Edge-Case Playbook
1. Missing docs:
- Detect with `GET /api/pipeline/docs`.
- If empty/incomplete, run `POST /api/quality/anomalies/run` and treat `pipeline.source_not_downloaded` as blocker.
2. Low-confidence OCR:
- Detect using OCR block confidence and empty-block checks from `POST /api/execution/ocr` + `GET /api/execution/ocr-blocks`.
- Thresholds: strong `>=0.90` (suppression eligible), review `[0.75,0.90)` (manual review), low `<0.75` (no suppression).
- Route to manual review and defer survey suppression unless strong-confidence citations exist.
3. Duplicate suppliers:
- Resolve by stable `supplier_id`; never merge different IDs solely by `supplier_name`.
- When same name appears across IDs, report conflict and require canonical mapping.
4. Non-response tiers:
- Tier clock drives status transitions: `pending_response` -> `on_hold` -> cascade spawn.
- Persist transitions via `PUT /api/engagements/{supplier_id}` and standardized `CascadeSurvey::<tier>::...` notes.
