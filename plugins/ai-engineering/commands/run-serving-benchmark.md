---
name: run-serving-benchmark
description: Benchmark serving stacks (vLLM/sglang/llama.cpp/TensorRT-LLM) with standardized throughput and latency outputs.
allowed-tools:
  - Read
  - Write
  - Grep
  - Glob
  - Bash
---

Generate comparable benchmark report at `artifacts/ai/serving-benchmarks/latest.json`.
Include p50/p95 latency, tok/s, memory footprint, and startup time.
