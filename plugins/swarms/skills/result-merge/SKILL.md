---
name: result-merge
description: The four merge strategies for combining parallel agent outputs within a swarm stage.
---

## Result Merge Strategies

When multiple agents run in parallel within a stage, their outputs must be combined into a single result before passing to downstream stages. The merge strategy is configured per-stage.

## Strategy: collect

**Purpose**: Preserve all outputs as-is in an ordered array.

**Algorithm**: `merged = [output_1, output_2, ..., output_N]`

**When to use**:
- Each agent handles a different slice of work (e.g., one supplier category each).
- Downstream stages need to iterate over individual agent results.
- No aggregation or deduplication is needed.

**Example**: Three agents each analyze a different Scope 3 category. Collect produces an array of three category reports.

## Strategy: reduce

**Purpose**: Aggregate outputs by summing numeric values and keeping first-seen non-numerics.

**Algorithm**:
```
merged = {}
for each output in outputs:
  for each (key, value) in output:
    if key exists in merged AND both are numbers:
      merged[key] += value
    else if key not in merged:
      merged[key] = value
```

**When to use**:
- Agents produce numeric metrics that should be totaled (emissions, spend, counts).
- There is a clear additive relationship between outputs.

**Example**: Five agents each compute emissions for a business unit. Reduce sums `total_kgco2e` across all five.

## Strategy: vote

**Purpose**: Consensus through majority voting on each output key.

**Algorithm**:
```
for each key across all outputs:
  count occurrences of each unique value
  merged[key] = value with highest count
```

**When to use**:
- Multiple agents independently classify or assess the same data.
- You want the most common answer to win (reduces individual agent bias).
- Works best with 3+ agents for meaningful majority.

**Example**: Three agents independently classify 50 suppliers by materiality. Vote selects the majority classification for each supplier.

## Strategy: chain

**Purpose**: Sequential refinement where later agents override earlier ones.

**Algorithm**:
```
merged = {}
for each output in outputs (in declaration order):
  Object.assign(merged, output)
```

**When to use**:
- Agents represent a pipeline: draft, review, finalize.
- Later agents intentionally correct or enhance earlier outputs.
- Order of the `agents` array in the workflow defines the chain sequence.

**Example**: Agent 1 drafts emission factors, Agent 2 reviews and corrects outliers, Agent 3 adds confidence scores. Chain preserves Agent 3's corrections.

## Choosing a Strategy

| Scenario | Strategy |
|----------|----------|
| Independent parallel work | collect |
| Numeric aggregation | reduce |
| Classification consensus | vote |
| Sequential refinement | chain |
| Unknown / default | collect |
