#!/usr/bin/env node
'use strict';

// MCP stdio server (LSP-style message framing + JSON-RPC 2.0).
// Implements: initialize, tools/list, tools/call.
// Swarm orchestration: DAG resolution, stage gating, merge strategies, deliverables.
// No external deps. Uses Node built-ins only.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// ─── Plugin manifest ───────────────────────────────────────────────────────────

const MANIFEST_PATH = path.resolve(__dirname, '..', '.claude-plugin', 'plugin.json');

function readPluginManifest() {
  try {
    const raw = fs.readFileSync(MANIFEST_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      name: typeof parsed?.name === 'string' ? parsed.name : 'swarms',
      version: typeof parsed?.version === 'string' ? parsed.version : '0.0.0',
    };
  } catch (_err) {
    return { name: 'swarms', version: '0.0.0' };
  }
}

const PLUGIN = readPluginManifest();
const SERVER_NAME = `${PLUGIN.name}-mcp`;
const SERVER_VERSION = PLUGIN.version;

// ─── Store (unified adapter) ────────────────────────────────────────────────
const DATA_DIR = path.resolve(__dirname, '..', 'data');
const { createStore } = require('../../shared-services/tools/store-adapter');
const store = createStore({ dataDir: DATA_DIR, serverName: SERVER_NAME });

// ─── YAML parser (recursive descent, no deps) ────────────────────────────────
// Handles the subset of YAML used in swarm workflow definitions:
// mappings, sequences, nested structures, scalars, inline flow, comments.

function parseYaml(text) {
  try { return JSON.parse(text); } catch (_e) { /* not JSON, parse as YAML */ }

  const lines = text.split('\n');
  // Pre-process: strip full-line comments, keep track of original indices
  const processed = [];
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    // Remove inline comments (but not inside quotes)
    const stripped = stripComment(raw);
    const trimmed = stripped.trimEnd();
    // Skip blank lines and full-line comments for processing
    if (trimmed === '' || /^\s*#/.test(trimmed)) continue;
    processed.push({ text: stripped.replace(/\s+$/, ''), indent: stripped.search(/\S/), idx: i });
  }

  const ctx = { lines: processed, pos: 0 };
  return parseNode(ctx, -1);
}

function stripComment(line) {
  let inSingle = false, inDouble = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === "'" && !inDouble) inSingle = !inSingle;
    else if (c === '"' && !inSingle) inDouble = !inDouble;
    else if (c === '#' && !inSingle && !inDouble && (i === 0 || line[i-1] === ' ')) {
      return line.substring(0, i);
    }
  }
  return line;
}

function parseNode(ctx, parentIndent) {
  if (ctx.pos >= ctx.lines.length) return null;
  const line = ctx.lines[ctx.pos];
  if (line.indent <= parentIndent && parentIndent >= 0) return null;

  // Check if this is a sequence item
  const trimmed = line.text.trim();
  if (trimmed.startsWith('- ')) {
    return parseSequence(ctx, line.indent);
  }

  // Check if this is a mapping key
  if (trimmed.includes(':')) {
    return parseMapping(ctx, line.indent);
  }

  // Bare scalar
  ctx.pos++;
  return parseScalar(trimmed);
}

function parseMapping(ctx, baseIndent) {
  const result = {};

  while (ctx.pos < ctx.lines.length) {
    const line = ctx.lines[ctx.pos];
    if (line.indent < baseIndent) break;
    if (line.indent > baseIndent) break; // belongs to a child

    const trimmed = line.text.trim();

    // Must be a key: value line (not a sequence item at this level)
    if (trimmed.startsWith('- ')) break;

    const colonIdx = findMappingColon(trimmed);
    if (colonIdx === -1) { ctx.pos++; continue; }

    const key = trimmed.substring(0, colonIdx).trim();
    const valPart = trimmed.substring(colonIdx + 1).trim();

    ctx.pos++;

    if (valPart === '' || valPart === '|' || valPart === '>') {
      // Value is on next lines (nested mapping, sequence, or block scalar)
      if (ctx.pos < ctx.lines.length && ctx.lines[ctx.pos].indent > baseIndent) {
        const nextLine = ctx.lines[ctx.pos];
        const nextTrimmed = nextLine.text.trim();
        if (nextTrimmed.startsWith('- ')) {
          result[key] = parseSequence(ctx, nextLine.indent);
        } else {
          result[key] = parseMapping(ctx, nextLine.indent);
        }
      } else {
        result[key] = null;
      }
    } else if (valPart.startsWith('[')) {
      // Inline flow sequence
      result[key] = parseFlowSequence(valPart);
    } else if (valPart.startsWith('{')) {
      // Inline flow mapping
      result[key] = parseFlowMapping(valPart);
    } else {
      result[key] = parseScalar(valPart);
    }
  }

  return result;
}

function parseSequence(ctx, baseIndent) {
  const result = [];

  while (ctx.pos < ctx.lines.length) {
    const line = ctx.lines[ctx.pos];
    if (line.indent < baseIndent) break;
    if (line.indent > baseIndent) break;

    const trimmed = line.text.trim();
    if (!trimmed.startsWith('- ')) break;

    const content = trimmed.substring(2).trim();

    // Check what follows the dash
    const dashContentIndent = line.indent + 2; // content after "- "

    if (content === '') {
      // Bare dash, children follow indented
      ctx.pos++;
      if (ctx.pos < ctx.lines.length && ctx.lines[ctx.pos].indent > baseIndent) {
        const child = parseNode(ctx, baseIndent);
        result.push(child);
      } else {
        result.push(null);
      }
    } else if (content.startsWith('[')) {
      result.push(parseFlowSequence(content));
      ctx.pos++;
    } else if (content.startsWith('{')) {
      result.push(parseFlowMapping(content));
      ctx.pos++;
    } else {
      const colonIdx = findMappingColon(content);
      if (colonIdx >= 0) {
        // This is a mapping item in a sequence: - key: value
        // Parse the first key:value, then continue with indented children
        const firstKey = content.substring(0, colonIdx).trim();
        const firstVal = content.substring(colonIdx + 1).trim();
        const obj = {};

        ctx.pos++;

        // Parse first value
        if (firstVal === '' || firstVal === '|' || firstVal === '>') {
          if (ctx.pos < ctx.lines.length && ctx.lines[ctx.pos].indent > baseIndent) {
            const nextLine = ctx.lines[ctx.pos];
            const nextTrimmed = nextLine.text.trim();
            if (nextTrimmed.startsWith('- ')) {
              obj[firstKey] = parseSequence(ctx, nextLine.indent);
            } else {
              obj[firstKey] = parseMapping(ctx, nextLine.indent);
            }
          } else {
            obj[firstKey] = null;
          }
        } else if (firstVal.startsWith('[')) {
          obj[firstKey] = parseFlowSequence(firstVal);
        } else if (firstVal.startsWith('{')) {
          obj[firstKey] = parseFlowMapping(firstVal);
        } else {
          obj[firstKey] = parseScalar(firstVal);
        }

        // Parse remaining keys at the same indent as the content after "- "
        // These are indented more than baseIndent
        while (ctx.pos < ctx.lines.length) {
          const nextLine = ctx.lines[ctx.pos];
          if (nextLine.indent <= baseIndent) break;

          const nt = nextLine.text.trim();
          if (nt.startsWith('- ')) {
            // Might be a sub-array or a new sequence item at a different indent
            if (nextLine.indent === baseIndent) break;
            // Sub-array belongs to the last key
            break; // Let the parent mapping key handle sub-arrays
          }

          const nc = findMappingColon(nt);
          if (nc >= 0) {
            const nk = nt.substring(0, nc).trim();
            const nv = nt.substring(nc + 1).trim();
            ctx.pos++;

            if (nv === '' || nv === '|' || nv === '>') {
              if (ctx.pos < ctx.lines.length && ctx.lines[ctx.pos].indent > nextLine.indent) {
                const childLine = ctx.lines[ctx.pos];
                const ct = childLine.text.trim();
                if (ct.startsWith('- ')) {
                  obj[nk] = parseSequence(ctx, childLine.indent);
                } else {
                  obj[nk] = parseMapping(ctx, childLine.indent);
                }
              } else {
                obj[nk] = null;
              }
            } else if (nv.startsWith('[')) {
              obj[nk] = parseFlowSequence(nv);
            } else if (nv.startsWith('{')) {
              obj[nk] = parseFlowMapping(nv);
            } else {
              obj[nk] = parseScalar(nv);
            }
          } else {
            ctx.pos++;
          }
        }

        result.push(obj);
      } else {
        // Simple scalar sequence item
        result.push(parseScalar(content));
        ctx.pos++;
      }
    }
  }

  return result;
}

function findMappingColon(s) {
  // Find the first colon that's a mapping separator (followed by space or end)
  // Skip colons inside quotes
  let inSingle = false, inDouble = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "'" && !inDouble) inSingle = !inSingle;
    else if (c === '"' && !inSingle) inDouble = !inDouble;
    else if (c === ':' && !inSingle && !inDouble) {
      if (i + 1 >= s.length || s[i + 1] === ' ' || s[i + 1] === '\t') {
        return i;
      }
    }
  }
  return -1;
}

function parseFlowSequence(s) {
  // Parse [a, b, c] inline syntax
  s = s.trim();
  if (s.startsWith('[')) s = s.substring(1);
  if (s.endsWith(']')) s = s.substring(0, s.length - 1);
  if (s.trim() === '') return [];
  return s.split(',').map((item) => parseScalar(item.trim()));
}

function parseFlowMapping(s) {
  // Parse {a: 1, b: 2} inline syntax
  s = s.trim();
  if (s.startsWith('{')) s = s.substring(1);
  if (s.endsWith('}')) s = s.substring(0, s.length - 1);
  if (s.trim() === '') return {};
  const result = {};
  for (const pair of s.split(',')) {
    const ci = pair.indexOf(':');
    if (ci >= 0) {
      result[pair.substring(0, ci).trim()] = parseScalar(pair.substring(ci + 1).trim());
    }
  }
  return result;
}

function parseScalar(s) {
  if (s === undefined || s === null) return null;
  s = String(s).trim();
  if (s === '' || s === 'null' || s === '~') return null;
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (/^-?\d+$/.test(s)) return parseInt(s, 10);
  if (/^-?\d+\.\d+$/.test(s)) return parseFloat(s);
  // Strip quotes
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

// ─── Schema validator ──────────────────────────────────────────────────────────

const SCHEMA_PATH = path.resolve(__dirname, '..', 'schema', 'swarm-v1.schema.json');

function loadSchema() {
  try {
    return JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
  } catch (_e) {
    return null;
  }
}

function validateWorkflow(doc) {
  const errors = [];

  if (!doc || typeof doc !== 'object') {
    return { valid: false, errors: ['Document must be an object'] };
  }

  // apiVersion
  if (doc.apiVersion !== 'carbonkit-swarm/v1') {
    errors.push(`apiVersion must be "carbonkit-swarm/v1", got "${doc.apiVersion}"`);
  }

  // metadata
  if (!doc.metadata || typeof doc.metadata !== 'object') {
    errors.push('metadata is required and must be an object');
  } else {
    if (!doc.metadata.name) errors.push('metadata.name is required');
    if (!doc.metadata.version) errors.push('metadata.version is required');
    if (!doc.metadata.description) errors.push('metadata.description is required');
  }

  // stages
  if (!Array.isArray(doc.stages) || doc.stages.length === 0) {
    errors.push('stages must be a non-empty array');
  } else {
    const stageIds = new Set();
    for (let si = 0; si < doc.stages.length; si++) {
      const stage = doc.stages[si];
      const prefix = `stages[${si}]`;
      if (!stage.id) errors.push(`${prefix}.id is required`);
      else if (stageIds.has(stage.id)) errors.push(`${prefix}.id "${stage.id}" is duplicate`);
      else stageIds.add(stage.id);

      if (!stage.name) errors.push(`${prefix}.name is required`);

      if (stage.depends_on && Array.isArray(stage.depends_on)) {
        for (const dep of stage.depends_on) {
          if (!stageIds.has(dep) && !doc.stages.some((s) => s.id === dep)) {
            errors.push(`${prefix}.depends_on references unknown stage "${dep}"`);
          }
        }
      }

      if (!Array.isArray(stage.agents) || stage.agents.length === 0) {
        errors.push(`${prefix}.agents must be a non-empty array`);
      } else {
        for (let ai = 0; ai < stage.agents.length; ai++) {
          const agent = stage.agents[ai];
          const ap = `${prefix}.agents[${ai}]`;
          if (!agent.role) errors.push(`${ap}.role is required`);
          if (!agent.agent) errors.push(`${ap}.agent is required`);
          if (!agent.plugin) errors.push(`${ap}.plugin is required`);
          if (!agent.task) errors.push(`${ap}.task is required`);
        }
      }

      if (stage.merge) {
        const validStrategies = ['collect', 'reduce', 'vote', 'chain'];
        if (stage.merge.strategy && !validStrategies.includes(stage.merge.strategy)) {
          errors.push(`${prefix}.merge.strategy must be one of: ${validStrategies.join(', ')}`);
        }
      }

      if (stage.gate) {
        const validTypes = ['all_agents_succeed', 'quorum', 'unanimous', 'custom'];
        if (stage.gate.type && !validTypes.includes(stage.gate.type)) {
          errors.push(`${prefix}.gate.type must be one of: ${validTypes.join(', ')}`);
        }
      }
    }

    // Check for DAG cycles
    const cycleErr = detectCycles(doc.stages);
    if (cycleErr) errors.push(cycleErr);
  }

  // deliverable
  if (!doc.deliverable || typeof doc.deliverable !== 'object') {
    errors.push('deliverable is required and must be an object');
  } else {
    if (!doc.deliverable.name) errors.push('deliverable.name is required');
    if (!doc.deliverable.format) errors.push('deliverable.format is required');
  }

  return { valid: errors.length === 0, errors };
}

// ─── DAG resolution ────────────────────────────────────────────────────────────

function detectCycles(stages) {
  const adj = {};
  const ids = new Set();
  for (const s of stages) {
    ids.add(s.id);
    adj[s.id] = s.depends_on || [];
  }

  const visited = new Set();
  const inStack = new Set();

  function dfs(node) {
    if (inStack.has(node)) return node;
    if (visited.has(node)) return null;
    visited.add(node);
    inStack.add(node);
    for (const dep of (adj[node] || [])) {
      const cycle = dfs(dep);
      if (cycle) return cycle;
    }
    inStack.delete(node);
    return null;
  }

  for (const id of ids) {
    const cycle = dfs(id);
    if (cycle) return `DAG cycle detected involving stage "${cycle}"`;
  }
  return null;
}

function topologicalSort(stages) {
  const adj = {};
  const inDeg = {};
  const stageMap = {};

  for (const s of stages) {
    adj[s.id] = [];
    inDeg[s.id] = 0;
    stageMap[s.id] = s;
  }

  for (const s of stages) {
    for (const dep of (s.depends_on || [])) {
      if (adj[dep]) {
        adj[dep].push(s.id);
        inDeg[s.id]++;
      }
    }
  }

  const queue = [];
  for (const id of Object.keys(inDeg)) {
    if (inDeg[id] === 0) queue.push(id);
  }

  const order = [];
  const layers = [];

  while (queue.length > 0) {
    const layer = [...queue];
    layers.push(layer);
    queue.length = 0;

    for (const id of layer) {
      order.push(id);
      for (const next of adj[id]) {
        inDeg[next]--;
        if (inDeg[next] === 0) queue.push(next);
      }
    }
  }

  if (order.length !== stages.length) {
    return { error: true, message: 'DAG has unreachable stages or cycles' };
  }

  return {
    error: false,
    order,
    layers,
    parallelizable: layers.filter((l) => l.length > 1).map((l) => l),
  };
}

// ─── Merge strategies ──────────────────────────────────────────────────────────

function executeMerge(strategy, agentOutputs) {
  switch (strategy) {
    case 'collect':
      // Gather all outputs into an array
      return {
        strategy: 'collect',
        merged: agentOutputs,
        count: agentOutputs.length,
      };

    case 'reduce':
      // Flatten and deduplicate keys, summing numeric values
      const reduced = {};
      for (const output of agentOutputs) {
        if (output && typeof output === 'object') {
          for (const [k, v] of Object.entries(output)) {
            if (typeof v === 'number' && typeof reduced[k] === 'number') {
              reduced[k] += v;
            } else if (reduced[k] === undefined) {
              reduced[k] = v;
            }
          }
        }
      }
      return { strategy: 'reduce', merged: reduced };

    case 'vote':
      // For each key, take the most common value
      const votes = {};
      for (const output of agentOutputs) {
        if (output && typeof output === 'object') {
          for (const [k, v] of Object.entries(output)) {
            if (!votes[k]) votes[k] = {};
            const sv = JSON.stringify(v);
            votes[k][sv] = (votes[k][sv] || 0) + 1;
          }
        }
      }
      const voted = {};
      for (const [k, counts] of Object.entries(votes)) {
        let best = null;
        let bestCount = 0;
        for (const [sv, count] of Object.entries(counts)) {
          if (count > bestCount) {
            bestCount = count;
            best = sv;
          }
        }
        if (best !== null) voted[k] = JSON.parse(best);
      }
      return { strategy: 'vote', merged: voted, vote_counts: votes };

    case 'chain':
      // Outputs feed sequentially; last output wins per key
      const chained = {};
      for (const output of agentOutputs) {
        if (output && typeof output === 'object') {
          Object.assign(chained, output);
        }
      }
      return { strategy: 'chain', merged: chained };

    default:
      return { strategy: strategy || 'collect', merged: agentOutputs };
  }
}

// ─── Gate evaluation ───────────────────────────────────────────────────────────

function evaluateGate(gate, agentResults) {
  if (!gate || !gate.type) {
    // Default: all must succeed
    const allOk = agentResults.every((r) => r.status === 'completed');
    return { passed: allOk, type: 'all_agents_succeed', detail: { total: agentResults.length, succeeded: agentResults.filter((r) => r.status === 'completed').length } };
  }

  const total = agentResults.length;
  const succeeded = agentResults.filter((r) => r.status === 'completed').length;

  switch (gate.type) {
    case 'all_agents_succeed':
      return { passed: succeeded === total, type: gate.type, detail: { total, succeeded } };

    case 'quorum': {
      const pct = gate.conditions?.quorum_pct || 0.5;
      const needed = Math.ceil(total * pct);
      return { passed: succeeded >= needed, type: gate.type, detail: { total, succeeded, needed, quorum_pct: pct } };
    }

    case 'unanimous':
      return { passed: succeeded === total, type: gate.type, detail: { total, succeeded } };

    case 'custom': {
      // Custom gates check conditions against aggregated outputs
      const conditionsMet = gate.conditions ? Object.keys(gate.conditions).length > 0 : false;
      return { passed: conditionsMet && succeeded > 0, type: gate.type, detail: { total, succeeded, conditions: gate.conditions } };
    }

    default:
      return { passed: succeeded === total, type: gate.type || 'unknown', detail: { total, succeeded } };
  }
}

// ─── Workflow loader ───────────────────────────────────────────────────────────

const WORKFLOWS_DIR = path.resolve(__dirname, '..', 'workflows');

function listWorkflows() {
  if (!fs.existsSync(WORKFLOWS_DIR)) return [];
  return fs.readdirSync(WORKFLOWS_DIR)
    .filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'))
    .map((f) => {
      const fp = path.join(WORKFLOWS_DIR, f);
      try {
        const raw = fs.readFileSync(fp, 'utf8');
        const doc = parseYaml(raw);
        return {
          filename: f,
          name: doc.metadata?.name || f,
          version: doc.metadata?.version || 'unknown',
          description: doc.metadata?.description || '',
          tags: doc.metadata?.tags || [],
          stage_count: Array.isArray(doc.stages) ? doc.stages.length : 0,
        };
      } catch (_e) {
        return { filename: f, name: f, error: 'parse_failed' };
      }
    });
}

function loadWorkflow(nameOrFile) {
  if (!fs.existsSync(WORKFLOWS_DIR)) {
    return { error: true, message: 'Workflows directory not found' };
  }

  // Try exact filename
  let fp = path.join(WORKFLOWS_DIR, nameOrFile);
  if (!fs.existsSync(fp)) {
    fp = path.join(WORKFLOWS_DIR, `${nameOrFile}.yaml`);
  }
  if (!fs.existsSync(fp)) {
    fp = path.join(WORKFLOWS_DIR, `${nameOrFile}.yml`);
  }
  if (!fs.existsSync(fp)) {
    // Try matching by metadata.name
    const files = fs.readdirSync(WORKFLOWS_DIR).filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'));
    for (const f of files) {
      try {
        const raw = fs.readFileSync(path.join(WORKFLOWS_DIR, f), 'utf8');
        const doc = parseYaml(raw);
        if (doc.metadata?.name === nameOrFile) {
          return { error: false, workflow: doc, filename: f };
        }
      } catch (_e) { /* skip */ }
    }
    return { error: true, message: `Workflow not found: ${nameOrFile}` };
  }

  try {
    const raw = fs.readFileSync(fp, 'utf8');
    const doc = parseYaml(raw);
    return { error: false, workflow: doc, filename: path.basename(fp) };
  } catch (e) {
    return { error: true, message: `Failed to parse workflow: ${e.message}` };
  }
}

// ─── Deliverable assembler ─────────────────────────────────────────────────────

function assembleDeliverable(runRecord) {
  const deliverableSpec = runRecord.workflow?.deliverable;
  if (!deliverableSpec) {
    return { error: true, message: 'No deliverable spec in workflow' };
  }

  const sections = [];
  for (const sec of (deliverableSpec.sections || [])) {
    const stageResult = (runRecord.stage_results || {})[sec.source_stage];
    sections.push({
      title: sec.title,
      source_stage: sec.source_stage,
      output_key: sec.output_key || null,
      content: stageResult?.merged || stageResult?.outputs || null,
    });
  }

  const deliverable = {
    name: deliverableSpec.name,
    format: deliverableSpec.format,
    run_id: runRecord._id,
    workflow: runRecord.workflow?.metadata?.name || 'unknown',
    generated_at: new Date().toISOString(),
    sections,
  };

  // SHA-256 hash
  if (deliverableSpec.hash !== false) {
    const content = JSON.stringify(sections);
    deliverable.sha256 = crypto.createHash('sha256').update(content, 'utf8').digest('hex');
  }

  // Audit trail
  if (deliverableSpec.audit_trail !== false) {
    deliverable.audit_trail = {
      started_at: runRecord.started_at,
      completed_at: runRecord.completed_at || new Date().toISOString(),
      stage_count: runRecord.workflow?.stages?.length || 0,
      stages_completed: Object.keys(runRecord.stage_results || {}).length,
      total_agents: (runRecord.workflow?.stages || []).reduce((s, st) => s + (st.agents?.length || 0), 0),
    };
  }

  return { error: false, deliverable };
}

// ─── Tool dispatch ─────────────────────────────────────────────────────────────

function ok(data) {
  return { content: [{ type: 'text', text: typeof data === 'string' ? data : JSON.stringify(data, null, 2) }], isError: false };
}

function fail(data) {
  return { content: [{ type: 'text', text: typeof data === 'string' ? data : JSON.stringify(data) }], isError: true };
}

function callTool(name, args) {
  switch (name) {
    // ── Health ──
    case 'swarm.health': {
      return ok({
        plugin: { name: PLUGIN.name, version: PLUGIN.version },
        server: { name: SERVER_NAME, version: SERVER_VERSION },
        timestamp: new Date().toISOString(),
        data_dir: DATA_DIR,
        workflows_dir: WORKFLOWS_DIR,
        workflow_count: listWorkflows().length,
      });
    }

    // ── Validate ──
    case 'swarm.validate': {
      if (!args) return fail('Missing arguments');
      let doc;
      if (args.workflow && typeof args.workflow === 'object') {
        doc = args.workflow;
      } else if (args.yaml && typeof args.yaml === 'string') {
        try { doc = parseYaml(args.yaml); } catch (e) { return fail({ valid: false, errors: [`YAML parse error: ${e.message}`] }); }
      } else if (args.filename && typeof args.filename === 'string') {
        const loaded = loadWorkflow(args.filename);
        if (loaded.error) return fail(loaded);
        doc = loaded.workflow;
      } else {
        return fail('Provide workflow (object), yaml (string), or filename');
      }
      const result = validateWorkflow(doc);
      if (result.valid) {
        const dag = topologicalSort(doc.stages);
        result.dag = dag;
      }
      return ok(result);
    }

    // ── Run ──
    case 'swarm.run': {
      if (!args || !args.workflow) return fail('Missing workflow name or filename');
      const loaded = loadWorkflow(args.workflow);
      if (loaded.error) return fail(loaded);

      const doc = loaded.workflow;
      const validation = validateWorkflow(doc);
      if (!validation.valid) return fail({ message: 'Workflow validation failed', errors: validation.errors });

      const dag = topologicalSort(doc.stages);
      if (dag.error) return fail(dag);

      // Apply params
      const params = { ...(doc.params || {}), ...(args.params || {}) };

      const runId = store._generateId();
      const now = new Date().toISOString();
      const runRecord = {
        _id: runId,
        workflow: doc,
        filename: loaded.filename,
        params,
        status: 'running',
        dag_order: dag.order,
        dag_layers: dag.layers,
        current_stage: dag.order[0] || null,
        current_layer: 0,
        stage_results: {},
        started_at: now,
        completed_at: null,
      };
      store.set('swarm_runs', runRecord);

      return ok({
        run_id: runId,
        workflow: doc.metadata?.name,
        status: 'running',
        dag_order: dag.order,
        dag_layers: dag.layers,
        parallelizable: dag.parallelizable,
        stage_count: doc.stages.length,
        total_agents: doc.stages.reduce((s, st) => s + (st.agents?.length || 0), 0),
        started_at: now,
      });
    }

    // ── Status ──
    case 'swarm.status': {
      if (!args || !args.run_id) return fail('Missing run_id');
      const run = store.get('swarm_runs', { _id: args.run_id });
      if (!run) return fail({ error: true, message: `Run not found: ${args.run_id}` });
      return ok({
        run_id: run._id,
        workflow: run.workflow?.metadata?.name,
        status: run.status,
        current_stage: run.current_stage,
        current_layer: run.current_layer,
        stages_completed: Object.keys(run.stage_results || {}).length,
        stages_total: run.dag_order?.length || 0,
        started_at: run.started_at,
        completed_at: run.completed_at,
      });
    }

    // ── Stage Result ──
    case 'swarm.stage.result': {
      if (!args || !args.run_id || !args.stage_id) return fail('Missing run_id or stage_id');
      const run = store.get('swarm_runs', { _id: args.run_id });
      if (!run) return fail({ error: true, message: `Run not found: ${args.run_id}` });
      const stageResult = (run.stage_results || {})[args.stage_id];
      if (!stageResult) return fail({ error: true, message: `Stage "${args.stage_id}" has no results yet` });
      return ok({ run_id: args.run_id, stage_id: args.stage_id, result: stageResult });
    }

    // ── Gate Check ──
    case 'swarm.gate.check': {
      if (!args || !args.run_id || !args.stage_id) return fail('Missing run_id or stage_id');
      const run = store.get('swarm_runs', { _id: args.run_id });
      if (!run) return fail({ error: true, message: `Run not found: ${args.run_id}` });

      const stage = (run.workflow?.stages || []).find((s) => s.id === args.stage_id);
      if (!stage) return fail({ error: true, message: `Stage "${args.stage_id}" not found in workflow` });

      const agentResults = args.agent_results || [];
      const gateResult = evaluateGate(stage.gate, agentResults);

      // Persist gate result
      const stageResults = run.stage_results || {};
      if (!stageResults[args.stage_id]) stageResults[args.stage_id] = {};
      stageResults[args.stage_id].gate = gateResult;
      store.set('swarm_runs', { _id: args.run_id, stage_results: stageResults });

      return ok({ run_id: args.run_id, stage_id: args.stage_id, gate: gateResult });
    }

    // ── Merge ──
    case 'swarm.merge': {
      if (!args || !args.run_id || !args.stage_id) return fail('Missing run_id or stage_id');
      const run = store.get('swarm_runs', { _id: args.run_id });
      if (!run) return fail({ error: true, message: `Run not found: ${args.run_id}` });

      const stage = (run.workflow?.stages || []).find((s) => s.id === args.stage_id);
      if (!stage) return fail({ error: true, message: `Stage "${args.stage_id}" not found in workflow` });

      const strategy = stage.merge?.strategy || 'collect';
      const agentOutputs = args.agent_outputs || [];
      const mergeResult = executeMerge(strategy, agentOutputs);

      // Persist merge result
      const stageResults = run.stage_results || {};
      if (!stageResults[args.stage_id]) stageResults[args.stage_id] = {};
      stageResults[args.stage_id].merged = mergeResult;
      stageResults[args.stage_id].outputs = mergeResult.merged;

      // Advance to next stage
      const dagOrder = run.dag_order || [];
      const currentIdx = dagOrder.indexOf(args.stage_id);
      const nextStage = currentIdx >= 0 && currentIdx < dagOrder.length - 1 ? dagOrder[currentIdx + 1] : null;
      const isComplete = nextStage === null;

      store.set('swarm_runs', {
        _id: args.run_id,
        stage_results: stageResults,
        current_stage: nextStage,
        status: isComplete ? 'completed' : 'running',
        completed_at: isComplete ? new Date().toISOString() : null,
      });

      return ok({
        run_id: args.run_id,
        stage_id: args.stage_id,
        merge: mergeResult,
        next_stage: nextStage,
        status: isComplete ? 'completed' : 'running',
      });
    }

    // ── Deliverable ──
    case 'swarm.deliverable': {
      if (!args || !args.run_id) return fail('Missing run_id');
      const run = store.get('swarm_runs', { _id: args.run_id });
      if (!run) return fail({ error: true, message: `Run not found: ${args.run_id}` });

      const result = assembleDeliverable(run);
      if (result.error) return fail(result);

      // Persist deliverable
      store.set('swarm_deliverables', {
        _id: store._generateId(),
        run_id: args.run_id,
        ...result.deliverable,
      });

      return ok(result.deliverable);
    }

    // ── Replay ──
    case 'swarm.replay': {
      if (!args || !args.run_id) return fail('Missing run_id');
      const originalRun = store.get('swarm_runs', { _id: args.run_id });
      if (!originalRun) return fail({ error: true, message: `Run not found: ${args.run_id}` });

      const fromStage = args.from_stage || null;
      const dag = topologicalSort(originalRun.workflow?.stages || []);
      if (dag.error) return fail(dag);

      // Create new run from checkpoint
      const newRunId = store._generateId();
      const now = new Date().toISOString();

      // Copy stage results up to (but not including) from_stage
      const copiedResults = {};
      if (fromStage) {
        for (const stageId of dag.order) {
          if (stageId === fromStage) break;
          if (originalRun.stage_results?.[stageId]) {
            copiedResults[stageId] = originalRun.stage_results[stageId];
          }
        }
      }

      const replayOrder = fromStage
        ? dag.order.slice(dag.order.indexOf(fromStage))
        : dag.order;

      const newRun = {
        _id: newRunId,
        workflow: originalRun.workflow,
        filename: originalRun.filename,
        params: originalRun.params,
        status: 'running',
        dag_order: dag.order,
        dag_layers: dag.layers,
        current_stage: replayOrder[0] || null,
        stage_results: copiedResults,
        replay_of: args.run_id,
        replay_from_stage: fromStage,
        started_at: now,
        completed_at: null,
      };
      store.set('swarm_runs', newRun);

      return ok({
        run_id: newRunId,
        replay_of: args.run_id,
        from_stage: fromStage,
        stages_reused: Object.keys(copiedResults).length,
        stages_to_replay: replayOrder.length,
        replay_order: replayOrder,
        status: 'running',
        started_at: now,
      });
    }

    // ── List ──
    case 'swarm.list': {
      const workflows = listWorkflows();
      return ok({ count: workflows.length, workflows });
    }

    // ── Agent Spawn ──
    case 'swarm.agent.spawn': {
      if (!args || !args.run_id || !args.stage_id) return fail('Missing run_id or stage_id');
      if (!args.agent || typeof args.agent !== 'object') return fail('Missing agent object');

      const run = store.get('swarm_runs', { _id: args.run_id });
      if (!run) return fail({ error: true, message: `Run not found: ${args.run_id}` });

      const stage = (run.workflow?.stages || []).find((s) => s.id === args.stage_id);
      if (!stage) return fail({ error: true, message: `Stage "${args.stage_id}" not found in workflow` });

      const agentDef = args.agent;
      const agentId = store._generateId();
      const now = new Date().toISOString();

      // Resolve input references ($params.*, $stages.*.outputs.*)
      const resolvedInputs = {};
      for (const [key, val] of Object.entries(agentDef.inputs || {})) {
        if (typeof val === 'string' && val.startsWith('$params.')) {
          const paramKey = val.substring('$params.'.length);
          resolvedInputs[key] = (run.params || {})[paramKey] ?? val;
        } else if (typeof val === 'string' && val.startsWith('$stages.')) {
          const parts = val.substring('$stages.'.length).split('.');
          const srcStage = parts[0];
          const srcKey = parts.slice(2).join('.'); // skip "outputs"
          const srcResult = (run.stage_results || {})[srcStage];
          resolvedInputs[key] = srcResult?.outputs?.[srcKey] ?? val;
        } else {
          resolvedInputs[key] = val;
        }
      }

      // Create agent task record
      const agentRecord = {
        _id: agentId,
        run_id: args.run_id,
        stage_id: args.stage_id,
        role: agentDef.role || 'unknown',
        agent: agentDef.agent || 'unknown',
        plugin: agentDef.plugin || 'unknown',
        task: agentDef.task || '',
        tools: agentDef.tools || [],
        inputs: resolvedInputs,
        expected_outputs: agentDef.outputs || [],
        status: 'running',
        started_at: now,
        completed_at: null,
        output: null,
        error: null,
      };
      store.set('swarm_agent_results', agentRecord);

      // Simulate execution: produce synthetic outputs from expected_outputs
      const simulatedOutput = {};
      for (const outKey of (agentDef.outputs || [])) {
        simulatedOutput[outKey] = `simulated_${outKey}_${agentId.substring(0, 8)}`;
      }

      // Mark agent as completed with simulated output
      agentRecord.status = 'completed';
      agentRecord.completed_at = new Date().toISOString();
      agentRecord.output = simulatedOutput;
      store.set('swarm_agent_results', agentRecord);

      return ok({
        agent_id: agentId,
        run_id: args.run_id,
        stage_id: args.stage_id,
        role: agentRecord.role,
        agent: agentRecord.agent,
        plugin: agentRecord.plugin,
        status: 'completed',
        inputs: resolvedInputs,
        output: simulatedOutput,
        started_at: agentRecord.started_at,
        completed_at: agentRecord.completed_at,
      });
    }

    // ── Recover ──
    case 'swarm.recover': {
      if (!args || !args.run_id || !args.stage_id) return fail('Missing run_id or stage_id');
      if (!args.action) return fail('Missing action (retry_with_fix | reassign | escalate_to_user | skip_with_warning)');

      const run = store.get('swarm_runs', { _id: args.run_id });
      if (!run) return fail({ error: true, message: `Run not found: ${args.run_id}` });

      const stage = (run.workflow?.stages || []).find((s) => s.id === args.stage_id);
      if (!stage) return fail({ error: true, message: `Stage "${args.stage_id}" not found in workflow` });

      const now = new Date().toISOString();
      const recoveryId = store._generateId();
      const stageResults = run.stage_results || {};
      if (!stageResults[args.stage_id]) stageResults[args.stage_id] = {};
      const stageRec = stageResults[args.stage_id];

      // Track recovery attempts
      const recoveries = stageRec.recoveries || [];
      const attemptNum = recoveries.length + 1;
      const MAX_RETRIES = 2;

      let recoveryResult;

      switch (args.action) {
        case 'retry_with_fix': {
          if (attemptNum > MAX_RETRIES) {
            recoveryResult = {
              action: 'escalate_to_user',
              original_action: 'retry_with_fix',
              reason: `Max retries (${MAX_RETRIES}) exceeded for stage "${args.stage_id}"`,
              attempt: attemptNum,
              escalated: true,
              message: args.message || 'Stage exceeded maximum retry attempts. Human review required.',
            };
          } else {
            // Clear previous agent results for this stage
            const adjustedParams = { ...(args.fix_params || {}) };
            recoveryResult = {
              action: 'retry_with_fix',
              attempt: attemptNum,
              fix_params: adjustedParams,
              reason: args.reason || 'Retrying with adjusted parameters',
              stage_reset: true,
            };
            // Reset stage status
            stageRec.gate = null;
            stageRec.merged = null;
            stageRec.outputs = null;
          }
          break;
        }

        case 'reassign': {
          const backupAgent = args.backup_agent || `backup_${stage.agents?.[0]?.agent || 'agent'}`;
          recoveryResult = {
            action: 'reassign',
            attempt: attemptNum,
            original_agent: args.failed_agent || 'unknown',
            backup_agent: backupAgent,
            reason: args.reason || 'Agent-specific failure, reassigning task',
          };
          break;
        }

        case 'escalate_to_user': {
          recoveryResult = {
            action: 'escalate_to_user',
            attempt: attemptNum,
            message: args.message || `Stage "${args.stage_id}" requires human intervention`,
            reason: args.reason || 'Persistent failure or critical gate violation',
            severity: args.severity || 'high',
            escalated: true,
          };
          // Pause the run
          store.set('swarm_runs', {
            _id: args.run_id,
            status: 'paused',
            paused_at: now,
            paused_reason: `Escalated at stage "${args.stage_id}": ${recoveryResult.message}`,
          });
          break;
        }

        case 'skip_with_warning': {
          recoveryResult = {
            action: 'skip_with_warning',
            attempt: attemptNum,
            reason: args.reason || `Skipping stage "${args.stage_id}" due to non-critical failure`,
            warning: `Stage "${args.stage_id}" was skipped. Downstream stages may have incomplete inputs.`,
          };
          // Mark stage as skipped and advance
          stageRec.status = 'skipped';
          stageRec.skipped_at = now;
          stageRec.skip_reason = recoveryResult.reason;

          const dagOrder = run.dag_order || [];
          const currentIdx = dagOrder.indexOf(args.stage_id);
          const nextStage = currentIdx >= 0 && currentIdx < dagOrder.length - 1 ? dagOrder[currentIdx + 1] : null;
          const isComplete = nextStage === null;

          store.set('swarm_runs', {
            _id: args.run_id,
            stage_results: stageResults,
            current_stage: nextStage,
            status: isComplete ? 'completed' : 'running',
            completed_at: isComplete ? now : null,
          });

          recoveryResult.next_stage = nextStage;
          recoveryResult.run_status = isComplete ? 'completed' : 'running';
          break;
        }

        default:
          return fail(`Unknown recovery action: ${args.action}. Valid: retry_with_fix, reassign, escalate_to_user, skip_with_warning`);
      }

      // Persist recovery record
      recoveryResult._id = recoveryId;
      recoveryResult.timestamp = now;
      recoveries.push(recoveryResult);
      stageRec.recoveries = recoveries;

      store.set('swarm_runs', { _id: args.run_id, stage_results: stageResults });
      store.set('swarm_recoveries', {
        _id: recoveryId,
        run_id: args.run_id,
        stage_id: args.stage_id,
        ...recoveryResult,
      });

      return ok({
        recovery_id: recoveryId,
        run_id: args.run_id,
        stage_id: args.stage_id,
        recovery: recoveryResult,
      });
    }

    // ── DB CRUD ──
    case 'swarm.db.get': {
      if (!args || typeof args.collection !== 'string') return fail('Missing collection');
      const docs = store.list(args.collection, args.query || {}, args.limit);
      return ok({ collection: args.collection, count: docs.length, docs });
    }
    case 'swarm.db.set': {
      if (!args || typeof args.collection !== 'string') return fail('Missing collection');
      if (!args.doc || typeof args.doc !== 'object') return fail('Missing doc object');
      const doc = store.set(args.collection, args.doc);
      return ok({ collection: args.collection, doc });
    }
    case 'swarm.db.delete': {
      if (!args || typeof args.collection !== 'string') return fail('Missing collection');
      if (!args.query || typeof args.query !== 'object') return fail('Missing query object');
      try {
        const result = store.delete(args.collection, args.query);
        return ok({ collection: args.collection, ...result });
      } catch (e) {
        return fail(e.message);
      }
    }
    case 'swarm.db.list': {
      if (!args || typeof args.collection !== 'string') return fail('Missing collection');
      const docs = store.list(args.collection, args.query || {}, args.limit);
      return ok({ collection: args.collection, count: docs.length, docs });
    }

    default:
      return { jsonrpc: '2.0', id: null, error: { code: -32601, message: `Unknown tool: ${name}` } };
  }
}

// ─── Tool definitions ──────────────────────────────────────────────────────────

function listTools() {
  return {
    tools: [
      {
        name: 'swarm.health',
        description: 'Returns swarm plugin name/version, server timestamp, and workflow count.',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      },
      {
        name: 'swarm.validate',
        description: 'Validate a swarm workflow definition against the schema. Checks structure, DAG cycles, stage/agent completeness.',
        inputSchema: {
          type: 'object',
          properties: {
            workflow: { type: 'object', description: 'Parsed workflow object to validate.' },
            yaml: { type: 'string', description: 'Raw YAML string to parse and validate.' },
            filename: { type: 'string', description: 'Workflow filename from workflows/ directory.' },
          },
          additionalProperties: false,
        },
      },
      {
        name: 'swarm.run',
        description: 'Start a swarm run. Parses the named workflow YAML, validates, resolves DAG ordering, creates a run record, and returns run_id with execution plan.',
        inputSchema: {
          type: 'object',
          properties: {
            workflow: { type: 'string', description: 'Workflow name or filename to execute.' },
            params: { type: 'object', description: 'Runtime parameter overrides (key-value).' },
          },
          required: ['workflow'],
          additionalProperties: false,
        },
      },
      {
        name: 'swarm.status',
        description: 'Get current execution state of a swarm run: status, current stage, completion progress.',
        inputSchema: {
          type: 'object',
          properties: {
            run_id: { type: 'string', description: 'Swarm run ID.' },
          },
          required: ['run_id'],
          additionalProperties: false,
        },
      },
      {
        name: 'swarm.stage.result',
        description: 'Get the output from a completed stage in a swarm run.',
        inputSchema: {
          type: 'object',
          properties: {
            run_id: { type: 'string', description: 'Swarm run ID.' },
            stage_id: { type: 'string', description: 'Stage ID to retrieve results for.' },
          },
          required: ['run_id', 'stage_id'],
          additionalProperties: false,
        },
      },
      {
        name: 'swarm.gate.check',
        description: 'Evaluate a stage gate against agent results. Supports all_agents_succeed, quorum, unanimous, and custom gate types.',
        inputSchema: {
          type: 'object',
          properties: {
            run_id: { type: 'string', description: 'Swarm run ID.' },
            stage_id: { type: 'string', description: 'Stage ID whose gate to evaluate.' },
            agent_results: {
              type: 'array',
              description: 'Array of agent result objects with at least { status: "completed"|"failed" }.',
              items: { type: 'object' },
            },
          },
          required: ['run_id', 'stage_id', 'agent_results'],
          additionalProperties: false,
        },
      },
      {
        name: 'swarm.merge',
        description: 'Execute the merge strategy for a stage. Strategies: collect (array), reduce (sum numerics), vote (majority), chain (sequential override).',
        inputSchema: {
          type: 'object',
          properties: {
            run_id: { type: 'string', description: 'Swarm run ID.' },
            stage_id: { type: 'string', description: 'Stage ID to merge outputs for.' },
            agent_outputs: {
              type: 'array',
              description: 'Array of output objects from each agent in the stage.',
              items: { type: 'object' },
            },
          },
          required: ['run_id', 'stage_id', 'agent_outputs'],
          additionalProperties: false,
        },
      },
      {
        name: 'swarm.agent.spawn',
        description: 'Create an agent task record for a stage, resolve input references, and simulate execution. Returns agent_id and simulated outputs.',
        inputSchema: {
          type: 'object',
          properties: {
            run_id: { type: 'string', description: 'Swarm run ID.' },
            stage_id: { type: 'string', description: 'Stage ID to spawn the agent for.' },
            agent: {
              type: 'object',
              description: 'Agent definition from the workflow: { role, agent, plugin, task, tools, inputs, outputs }.',
            },
          },
          required: ['run_id', 'stage_id', 'agent'],
          additionalProperties: false,
        },
      },
      {
        name: 'swarm.recover',
        description: 'Apply a self-healing recovery action to a failed stage. Actions: retry_with_fix, reassign, escalate_to_user, skip_with_warning.',
        inputSchema: {
          type: 'object',
          properties: {
            run_id: { type: 'string', description: 'Swarm run ID.' },
            stage_id: { type: 'string', description: 'Stage ID to recover.' },
            action: {
              type: 'string',
              description: 'Recovery action: retry_with_fix, reassign, escalate_to_user, skip_with_warning.',
              enum: ['retry_with_fix', 'reassign', 'escalate_to_user', 'skip_with_warning'],
            },
            reason: { type: 'string', description: 'Reason for the recovery action.' },
            message: { type: 'string', description: 'Message for escalation or warning.' },
            fix_params: { type: 'object', description: 'Adjusted parameters for retry_with_fix.' },
            failed_agent: { type: 'string', description: 'Name of the failed agent (for reassign).' },
            backup_agent: { type: 'string', description: 'Backup agent name (for reassign).' },
            severity: { type: 'string', description: 'Escalation severity: low, medium, high, critical.' },
          },
          required: ['run_id', 'stage_id', 'action'],
          additionalProperties: false,
        },
      },
      {
        name: 'swarm.deliverable',
        description: 'Assemble the final deliverable for a completed swarm run. Generates SHA-256 integrity hash and audit trail.',
        inputSchema: {
          type: 'object',
          properties: {
            run_id: { type: 'string', description: 'Swarm run ID.' },
          },
          required: ['run_id'],
          additionalProperties: false,
        },
      },
      {
        name: 'swarm.replay',
        description: 'Re-execute a swarm run from a checkpoint stage. Copies prior stage results and replays from the specified point.',
        inputSchema: {
          type: 'object',
          properties: {
            run_id: { type: 'string', description: 'Original run ID to replay from.' },
            from_stage: { type: 'string', description: 'Stage ID to restart from. Omit to replay entire run.' },
          },
          required: ['run_id'],
          additionalProperties: false,
        },
      },
      {
        name: 'swarm.list',
        description: 'List available workflow templates from the workflows/ directory.',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      },
      {
        name: 'swarm.db.get',
        description: 'Query documents from a swarm collection. Collections: swarm_runs, swarm_deliverables.',
        inputSchema: {
          type: 'object',
          properties: {
            collection: { type: 'string', description: 'Collection name.' },
            query: { type: 'object', description: 'Key-value filter.' },
            limit: { type: 'number', description: 'Max documents to return.' },
          },
          required: ['collection'],
          additionalProperties: false,
        },
      },
      {
        name: 'swarm.db.set',
        description: 'Upsert a document into a swarm collection.',
        inputSchema: {
          type: 'object',
          properties: {
            collection: { type: 'string', description: 'Collection name.' },
            doc: { type: 'object', description: 'Document to upsert.' },
          },
          required: ['collection', 'doc'],
          additionalProperties: false,
        },
      },
      {
        name: 'swarm.db.delete',
        description: 'Delete documents matching query from a swarm collection.',
        inputSchema: {
          type: 'object',
          properties: {
            collection: { type: 'string', description: 'Collection name.' },
            query: { type: 'object', description: 'Key-value filter. Must be non-empty.' },
          },
          required: ['collection', 'query'],
          additionalProperties: false,
        },
      },
      {
        name: 'swarm.db.list',
        description: 'List documents from a swarm collection with optional filter.',
        inputSchema: {
          type: 'object',
          properties: {
            collection: { type: 'string', description: 'Collection name.' },
            query: { type: 'object', description: 'Optional key-value filter.' },
            limit: { type: 'number', description: 'Max documents to return.' },
          },
          required: ['collection'],
          additionalProperties: false,
        },
      },
    ],
  };
}

// ─── Wire + MCP protocol ──────────────────────────────────────────────────────

function sendFrame(msg) {
  const json = JSON.stringify(msg);
  const byteLen = Buffer.byteLength(json, 'utf8');
  process.stdout.write(`Content-Length: ${byteLen}\r\n\r\n${json}`);
}

function jsonRpcResult(id, result) {
  return { jsonrpc: '2.0', id, result };
}

function jsonRpcError(id, code, message, data) {
  const err = { jsonrpc: '2.0', id, error: { code, message } };
  if (data !== undefined) err.error.data = data;
  return err;
}

async function handleMessage(msg) {
  if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
    const id = msg && Object.prototype.hasOwnProperty.call(msg, 'id') ? msg.id : null;
    return jsonRpcError(id, -32600, 'Invalid Request');
  }
  if (!Object.prototype.hasOwnProperty.call(msg, 'id')) return null;
  const id = msg.id;

  try {
    switch (msg.method) {
      case 'initialize': {
        const requested =
          msg.params && typeof msg.params.protocolVersion === 'string'
            ? msg.params.protocolVersion
            : '2024-11-05';
        return jsonRpcResult(id, {
          protocolVersion: requested,
          serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
          capabilities: { tools: { listChanged: false } },
          instructions:
            'Swarm orchestration MCP server. Manages declarative DAG-based multi-agent workflows for carbon accounting. Provides workflow validation, execution, gating, merge, and deliverable assembly.',
        });
      }
      case 'tools/list': {
        return jsonRpcResult(id, { ...listTools(), nextCursor: null });
      }
      case 'tools/call': {
        const name = msg.params && msg.params.name;
        const args = msg.params && (msg.params.arguments || msg.params.args);
        if (typeof name !== 'string') {
          return jsonRpcError(id, -32602, 'Invalid params: missing tool name');
        }
        const result = await callTool(name, args);
        if (result && result.jsonrpc === '2.0' && result.error) {
          return jsonRpcError(id, result.error.code, result.error.message, result.error.data);
        }
        return jsonRpcResult(id, result);
      }
      default: {
        return jsonRpcError(id, -32601, `Method not found: ${msg.method}`);
      }
    }
  } catch (e) {
    return jsonRpcError(id, -32603, 'Internal error', {
      message: e && e.message ? e.message : String(e),
    });
  }
}

// ─── LSP framing (stdin) ───────────────────────────────────────────────────────

let buffer = Buffer.alloc(0);

// In stdio mode we serialize requests via this hook to avoid interleaved frames.
// It is assigned in the transport selection block.
let enqueueMessage = function(msg) {
  Promise.resolve(handleMessage(msg)).then((resp) => { if (resp) sendFrame(resp); }).catch(() => {});
};

function tryParseMessages() {
  while (buffer.length > 0) {
    let headerEnd = buffer.indexOf('\r\n\r\n');
    let headerSepLen = 4;
    if (headerEnd === -1) {
      headerEnd = buffer.indexOf('\n\n');
      headerSepLen = 2;
    }
    if (headerEnd === -1) return;

    const headerText = buffer.slice(0, headerEnd).toString('utf8');
    const lengthMatch = /content-length\s*:\s*(\d+)/i.exec(headerText);
    if (!lengthMatch) {
      buffer = buffer.slice(headerEnd + headerSepLen);
      continue;
    }

    const bodyLen = Number.parseInt(lengthMatch[1], 10);
    const bodyStart = headerEnd + headerSepLen;
    const bodyEnd = bodyStart + bodyLen;
    if (buffer.length < bodyEnd) return;

    const body = buffer.slice(bodyStart, bodyEnd).toString('utf8');
    buffer = buffer.slice(bodyEnd);

    let parsed;
    try {
      parsed = JSON.parse(body);
    } catch (_e) {
      sendFrame(jsonRpcError(null, -32700, 'Parse error'));
      continue;
    }
    enqueueMessage(parsed);
  }
}

// ─── Transport selection (stdio vs HTTP) ──────────────────────────────────────

const transport = (process.env.CARBONKIT_MCP_TRANSPORT || 'stdio').toLowerCase();

if (transport === 'http') {
  const { startHttpTransport } = require('../../shared-services/tools/mcp-http-transport');
  const port = process.env.CARBONKIT_MCP_PORT || process.env.CARBONKIT_SWARM_PORT || 8405;
  startHttpTransport(handleMessage, null, port, { serverInfo: { name: SERVER_NAME, version: SERVER_VERSION } });
} else {
  // Serialize request handling to avoid interleaved stdout frames.
  let _queue = Promise.resolve();
  enqueueMessage = function enqueueMessage(msg) {
    _queue = _queue.then(async () => {
      const resp = await handleMessage(msg);
      if (resp) sendFrame(resp);
    }).catch((err) => {
      const id = msg && Object.prototype.hasOwnProperty.call(msg, 'id') ? msg.id : null;
      sendFrame(jsonRpcError(id, -32603, err?.message || 'Internal error'));
    });
  };

  // stdio mode (default)
  process.stdin.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    tryParseMessages();
  });

  process.stdin.on('error', (err) => {
    process.stderr.write(`[swarm-mcp] stdin error: ${err?.stack || String(err)}\n`);
  });

  process.stdin.resume();
}
