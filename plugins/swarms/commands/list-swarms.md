---
name: carbon-swarm-list
description: List all available swarm workflow templates.
allowed-tools:
  - swarm.list
  - swarm.health
  - Read
---

List all swarm workflow templates available in the workflows/ directory.

## Usage

`/carbon:swarm:list`

## Steps

1. Call `swarm.list` to retrieve all workflow templates.
2. Display each workflow with:
   - **Name** and version
   - **Description**
   - **Tags** (e.g., scope3, csrd, annual-close)
   - **Stage count**: Number of stages in the DAG
3. If no workflows are found, report that the workflows/ directory is empty.
