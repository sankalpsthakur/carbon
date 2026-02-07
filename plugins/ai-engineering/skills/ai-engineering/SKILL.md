---
name: ai-engineering
description: Execute model engineering workflows for training, serving, RAG, optimization, evaluation, vision/audio, agent frameworks, 3D/creative, and utility.
---

## Auth/Env
- OPENAI_API_KEY
- ANTHROPIC_API_KEY
- GOOGLE_API_KEY / GEMINI_API_KEY
- WANDB_API_KEY
- LANGSMITH_API_KEY
- MLFLOW_TRACKING_URI
- HF_TOKEN
- PINECONE_API_KEY

## Primary Workflows
- workflows:ai-engineering:train-or-finetune-stack
- workflows:ai-engineering:run-serving-benchmark
- workflows:ai-engineering:build-rag-stack

## Bundled Skills

### Training
- skills/accelerate, skills/axolotl, skills/deepspeed, skills/flash-attention, skills/llama-factory, skills/megatron, skills/peft, skills/ray-train, skills/torchtitan, skills/trl, skills/unsloth

### Serving
- skills/llama-cpp, skills/sglang, skills/tensorrt-llm, skills/vllm

### Quantization
- skills/awq, skills/bitsandbytes, skills/gguf, skills/gptq

### RAG / Vector
- skills/chroma, skills/faiss, skills/llamaindex, skills/pinecone, skills/qdrant, skills/sentence-transformers

### Vision / Audio / Multimodal
- skills/audiocraft, skills/blip-2, skills/clip, skills/gemini-imagegen, skills/llava, skills/segment-anything, skills/stable-diffusion, skills/whisper

### Agent Frameworks
- skills/agent-browser, skills/agent-engineering-workflows, skills/autogpt, skills/crewai, skills/dspy, skills/langchain

### 3D / Creative
- skills/threejs-fundamentals, skills/threejs-geometry, skills/threejs-interaction, skills/threejs-postprocessing, skills/threejs-shaders, skills/remotion-best-practices

### Utility
- skills/brainstorming, skills/find-skills, skills/frontend-design, skills/rclone, skills/skill-installer
