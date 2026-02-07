---
name: train-or-finetune-stack
description: Select and run the correct fine-tuning stack (axolotl/trl/peft/llama-factory/unsloth) with tracked outputs.
allowed-tools:
  - Read
  - Write
  - Grep
  - Glob
  - Bash
---

1. Choose stack by constraints (GPU RAM, objective, latency).
2. Write config under `artifacts/ai/train-configs/`.
3. Launch training command.
4. Persist run summary + metrics + checkpoints index.
