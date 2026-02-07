'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

// ── MCP test client ──────────────────────────────────────────────────────────
// LSP Content-Length framing + JSON-RPC 2.0 over stdio.
// Same pattern as exec-mcp.test.js.

function createMcpClient(serverPath) {
  const child = spawn('node', [serverPath], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env },
  });

  let buffer = Buffer.alloc(0);
  const pending = new Map();
  let nextId = 1;

  child.stdout.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length > 0) {
      let headerEnd = buffer.indexOf('\r\n\r\n');
      let sepLen = 4;
      if (headerEnd === -1) {
        headerEnd = buffer.indexOf('\n\n');
        sepLen = 2;
      }
      if (headerEnd === -1) return;

      const headerText = buffer.slice(0, headerEnd).toString('utf8');
      const match = /content-length\s*:\s*(\d+)/i.exec(headerText);
      if (!match) { buffer = buffer.slice(headerEnd + sepLen); continue; }

      const bodyLen = parseInt(match[1], 10);
      const bodyStart = headerEnd + sepLen;
      if (buffer.length < bodyStart + bodyLen) return;

      const body = buffer.slice(bodyStart, bodyStart + bodyLen).toString('utf8');
      buffer = buffer.slice(bodyStart + bodyLen);

      try {
        const msg = JSON.parse(body);
        const resolve = pending.get(msg.id);
        if (resolve) {
          pending.delete(msg.id);
          resolve(msg);
        }
      } catch (_e) { /* ignore */ }
    }
  });

  child.stderr.on('data', () => { /* silence stderr */ });

  function send(method, params) {
    return new Promise((resolve, reject) => {
      const id = nextId++;
      const msg = { jsonrpc: '2.0', id, method, params };
      const body = JSON.stringify(msg);
      const frame = `Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n${body}`;

      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Timeout: ${method} (id=${id})`));
      }, 10000);

      pending.set(id, (response) => {
        clearTimeout(timer);
        resolve(response);
      });

      child.stdin.write(frame);
    });
  }

  async function callTool(name, args) {
    const resp = await send('tools/call', { name, arguments: args || {} });
    if (resp.error) throw new Error(`RPC error: ${resp.error.message}`);
    const result = resp.result;
    if (result && result.content && result.content[0]) {
      const text = result.content[0].text;
      try { return { parsed: JSON.parse(text), isError: result.isError || false }; }
      catch (_e) { return { parsed: text, isError: result.isError || false }; }
    }
    return { parsed: result, isError: false };
  }

  async function initialize() {
    return send('initialize', { protocolVersion: '2024-11-05' });
  }

  function close() {
    child.stdin.end();
    child.kill('SIGTERM');
  }

  return { send, callTool, initialize, close };
}

// ── Test fixtures ────────────────────────────────────────────────────────────

const SERVER_PATH = path.resolve(__dirname, '..', 'swarm-mcp.js');
const DATA_DIR = path.resolve(__dirname, '..', '..', 'data');
const WORKFLOWS_DIR = path.resolve(__dirname, '..', '..', 'workflows');

const TEST_WF_FILE = '_test_simple.yaml';
const TEST_WF_PATH = path.join(WORKFLOWS_DIR, TEST_WF_FILE);

// Minimal valid workflow: two stages with a dependency edge.
const TEST_WF_YAML = `apiVersion: carbonkit-swarm/v1

metadata:
  name: _test_simple
  version: "1.0.0"
  description: "Minimal workflow for automated tests"
  tags:
    - test

params:
  region:
    type: string
    default: "US"

stages:
  - id: gather
    name: "Data Gathering"
    depends_on: []
    agents:
      - role: collector
        agent: test-collector
        plugin: scope3-calculation
        task: "Collect data from sources"
        tools:
          - calc.db.get
        inputs:
          region: "$params.region"
        outputs:
          - raw_data
    merge:
      strategy: collect
    gate:
      type: all_agents_succeed

  - id: synthesize
    name: "Synthesis"
    depends_on:
      - gather
    agents:
      - role: synthesizer
        agent: test-synthesizer
        plugin: scope3-calculation
        task: "Synthesize gathered data"
        tools:
          - calc.compute
        inputs:
          raw: "$stages.gather.outputs.raw_data"
        outputs:
          - summary
    merge:
      strategy: reduce
    gate:
      type: all_agents_succeed

deliverable:
  name: "Test Report"
  format: json
  sections:
    - title: "Gathered Data"
      source_stage: gather
      output_key: gather_result
    - title: "Synthesis"
      source_stage: synthesize
      output_key: synthesize_result
  hash: true
  audit_trail: true
`;

const ALL_16_TOOLS = [
  'swarm.health', 'swarm.validate', 'swarm.run', 'swarm.status',
  'swarm.stage.result', 'swarm.gate.check', 'swarm.merge',
  'swarm.deliverable', 'swarm.replay', 'swarm.list',
  'swarm.agent.spawn', 'swarm.recover',
  'swarm.db.get', 'swarm.db.set', 'swarm.db.delete', 'swarm.db.list',
];

// ── Test suite ──────────────────────────────────────────────────────────────

let client;

describe('swarm-mcp.js', () => {
  before(async () => {
    if (!fs.existsSync(WORKFLOWS_DIR)) fs.mkdirSync(WORKFLOWS_DIR, { recursive: true });
    fs.writeFileSync(TEST_WF_PATH, TEST_WF_YAML, 'utf8');
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

    client = createMcpClient(SERVER_PATH);
    await client.initialize();
  });

  after(() => {
    if (client) client.close();
    try { fs.unlinkSync(TEST_WF_PATH); } catch (_e) { /* ignore */ }
    if (fs.existsSync(DATA_DIR)) {
      for (const f of fs.readdirSync(DATA_DIR)) {
        if (f.startsWith('_test_') || f.startsWith('swarm_')) {
          try { fs.unlinkSync(path.join(DATA_DIR, f)); } catch (_e) { /* ignore */ }
        }
      }
    }
  });

  // ── initialize ──

  describe('initialize', () => {
    it('responds with protocolVersion, serverInfo, and capabilities', async () => {
      const resp = await client.send('initialize', { protocolVersion: '2024-11-05' });
      assert.ok(resp.result);
      assert.strictEqual(resp.result.protocolVersion, '2024-11-05');
      assert.ok(resp.result.serverInfo);
      assert.ok(resp.result.serverInfo.name);
      assert.ok(resp.result.capabilities.tools);
    });
  });

  // ── tools/list ──

  describe('tools/list', () => {
    it('returns all 16 expected tools', async () => {
      const resp = await client.send('tools/list', {});
      const names = resp.result.tools.map((t) => t.name).sort();
      assert.deepStrictEqual(names, [...ALL_16_TOOLS].sort());
    });

    it('each tool has name, description, and inputSchema', async () => {
      const resp = await client.send('tools/list', {});
      for (const t of resp.result.tools) {
        assert.ok(typeof t.name === 'string');
        assert.ok(typeof t.description === 'string');
        assert.ok(t.inputSchema && typeof t.inputSchema === 'object');
      }
    });
  });

  // ── swarm.health ──

  describe('swarm.health', () => {
    it('returns plugin info, server info, timestamp, and workflow count', async () => {
      const { parsed, isError } = await client.callTool('swarm.health');
      assert.strictEqual(isError, false);
      assert.ok(parsed.plugin);
      assert.ok(parsed.plugin.name);
      assert.ok(parsed.server);
      assert.ok(parsed.server.name);
      assert.ok(parsed.timestamp);
      assert.ok(typeof parsed.workflow_count === 'number');
      assert.ok(typeof parsed.data_dir === 'string');
    });
  });

  // ── swarm.validate ──

  describe('swarm.validate', () => {
    it('validates a correct workflow from a YAML string', async () => {
      const { parsed, isError } = await client.callTool('swarm.validate', { yaml: TEST_WF_YAML });
      assert.strictEqual(isError, false);
      assert.strictEqual(parsed.valid, true);
      assert.deepStrictEqual(parsed.errors, []);
      assert.ok(parsed.dag);
      assert.strictEqual(parsed.dag.error, false);
      assert.ok(parsed.dag.order.includes('gather'));
      assert.ok(parsed.dag.order.includes('synthesize'));
    });

    it('validates a workflow passed as an object', async () => {
      const { parsed } = await client.callTool('swarm.validate', {
        workflow: {
          apiVersion: 'carbonkit-swarm/v1',
          metadata: { name: 'obj-test', version: '1.0.0', description: 'Object test' },
          stages: [{ id: 's1', name: 'S', agents: [{ role: 'r', agent: 'a', plugin: 'p', task: 't' }] }],
          deliverable: { name: 'R', format: 'json' },
        },
      });
      assert.strictEqual(parsed.valid, true);
    });

    it('validates a workflow by filename', async () => {
      const { parsed } = await client.callTool('swarm.validate', { filename: TEST_WF_FILE });
      assert.strictEqual(parsed.valid, true);
    });

    it('rejects missing apiVersion', async () => {
      const { parsed } = await client.callTool('swarm.validate', {
        workflow: {
          metadata: { name: 'bad', version: '1.0', description: 'Bad' },
          stages: [{ id: 's', name: 'S', agents: [{ role: 'r', agent: 'a', plugin: 'p', task: 't' }] }],
          deliverable: { name: 'R', format: 'json' },
        },
      });
      assert.strictEqual(parsed.valid, false);
      assert.ok(parsed.errors.some((e) => e.includes('apiVersion')));
    });

    it('rejects missing metadata fields', async () => {
      const { parsed } = await client.callTool('swarm.validate', {
        workflow: {
          apiVersion: 'carbonkit-swarm/v1',
          metadata: { name: 'partial' },
          stages: [{ id: 's', name: 'S', agents: [{ role: 'r', agent: 'a', plugin: 'p', task: 't' }] }],
          deliverable: { name: 'R', format: 'json' },
        },
      });
      assert.strictEqual(parsed.valid, false);
      assert.ok(parsed.errors.some((e) => e.includes('metadata.version')));
      assert.ok(parsed.errors.some((e) => e.includes('metadata.description')));
    });

    it('rejects empty stages array', async () => {
      const { parsed } = await client.callTool('swarm.validate', {
        workflow: {
          apiVersion: 'carbonkit-swarm/v1',
          metadata: { name: 'e', version: '1.0', description: 'E' },
          stages: [],
          deliverable: { name: 'R', format: 'json' },
        },
      });
      assert.strictEqual(parsed.valid, false);
      assert.ok(parsed.errors.some((e) => e.includes('stages')));
    });

    it('detects DAG cycles', async () => {
      const { parsed } = await client.callTool('swarm.validate', {
        workflow: {
          apiVersion: 'carbonkit-swarm/v1',
          metadata: { name: 'cyc', version: '1.0', description: 'Cyc' },
          stages: [
            { id: 'a', name: 'A', depends_on: ['b'], agents: [{ role: 'r', agent: 'a', plugin: 'p', task: 't' }] },
            { id: 'b', name: 'B', depends_on: ['a'], agents: [{ role: 'r', agent: 'a', plugin: 'p', task: 't' }] },
          ],
          deliverable: { name: 'D', format: 'json' },
        },
      });
      assert.strictEqual(parsed.valid, false);
      assert.ok(parsed.errors.some((e) => e.includes('cycle')));
    });

    it('rejects when no arguments are provided', async () => {
      const { isError } = await client.callTool('swarm.validate', {});
      assert.strictEqual(isError, true);
    });
  });

  // ── swarm.db CRUD cycle ──

  describe('swarm.db CRUD', () => {
    const COL = '_test_crud';

    it('db.set inserts a document with timestamps', async () => {
      const { parsed, isError } = await client.callTool('swarm.db.set', {
        collection: COL, doc: { _id: 'd1', name: 'Alpha', value: 42 },
      });
      assert.strictEqual(isError, false);
      assert.strictEqual(parsed.doc._id, 'd1');
      assert.strictEqual(parsed.doc.name, 'Alpha');
      assert.ok(parsed.doc._created_at);
      assert.ok(parsed.doc._updated_at);
    });

    it('db.set inserts a second document', async () => {
      const { parsed } = await client.callTool('swarm.db.set', {
        collection: COL, doc: { _id: 'd2', name: 'Beta', value: 99 },
      });
      assert.strictEqual(parsed.doc._id, 'd2');
    });

    it('db.get retrieves by query', async () => {
      const { parsed } = await client.callTool('swarm.db.get', {
        collection: COL, query: { _id: 'd1' },
      });
      assert.strictEqual(parsed.count, 1);
      assert.strictEqual(parsed.docs[0].name, 'Alpha');
    });

    it('db.get returns all with empty query', async () => {
      const { parsed } = await client.callTool('swarm.db.get', { collection: COL });
      assert.ok(parsed.count >= 2);
    });

    it('db.get respects limit', async () => {
      const { parsed } = await client.callTool('swarm.db.get', { collection: COL, limit: 1 });
      assert.strictEqual(parsed.count, 1);
    });

    it('db.list returns documents with optional filter', async () => {
      const { parsed } = await client.callTool('swarm.db.list', {
        collection: COL, query: { name: 'Beta' },
      });
      assert.strictEqual(parsed.count, 1);
      assert.strictEqual(parsed.docs[0].name, 'Beta');
    });

    it('db.set upserts an existing document', async () => {
      await client.callTool('swarm.db.set', {
        collection: COL, doc: { _id: 'd1', name: 'Alpha v2', value: 100 },
      });
      const { parsed } = await client.callTool('swarm.db.get', {
        collection: COL, query: { _id: 'd1' },
      });
      assert.strictEqual(parsed.docs[0].name, 'Alpha v2');
      assert.strictEqual(parsed.docs[0].value, 100);
    });

    it('db.delete removes matching documents', async () => {
      const { parsed } = await client.callTool('swarm.db.delete', {
        collection: COL, query: { _id: 'd2' },
      });
      assert.strictEqual(parsed.removed, 1);
      const { parsed: after } = await client.callTool('swarm.db.get', { collection: COL });
      assert.ok(!after.docs.some((d) => d._id === 'd2'));
    });

    it('db.delete rejects empty query', async () => {
      const { isError } = await client.callTool('swarm.db.delete', {
        collection: COL, query: {},
      });
      assert.strictEqual(isError, true);
    });

    it('db.set rejects missing collection', async () => {
      const { isError } = await client.callTool('swarm.db.set', { doc: { x: 1 } });
      assert.strictEqual(isError, true);
    });

    it('db.get rejects missing collection', async () => {
      const { isError } = await client.callTool('swarm.db.get', {});
      assert.strictEqual(isError, true);
    });
  });

  // ── swarm.merge ──

  describe('swarm.merge', () => {
    let runId;

    before(async () => {
      const { parsed } = await client.callTool('swarm.run', { workflow: TEST_WF_FILE });
      runId = parsed.run_id;
    });

    it('collect strategy gathers outputs into array', async () => {
      const outputs = [{ scope: 1, v: 100 }, { scope: 2, v: 200 }];
      const { parsed } = await client.callTool('swarm.merge', {
        run_id: runId, stage_id: 'gather', agent_outputs: outputs,
      });
      assert.strictEqual(parsed.merge.strategy, 'collect');
      assert.strictEqual(parsed.merge.count, 2);
      assert.deepStrictEqual(parsed.merge.merged, outputs);
      assert.strictEqual(parsed.next_stage, 'synthesize');
    });

    it('reduce strategy sums numeric values', async () => {
      // gather already merged, now merge synthesize (reduce strategy)
      const { parsed } = await client.callTool('swarm.merge', {
        run_id: runId, stage_id: 'synthesize',
        agent_outputs: [{ emissions: 100, count: 5 }, { emissions: 200, count: 3 }],
      });
      assert.strictEqual(parsed.merge.strategy, 'reduce');
      assert.strictEqual(parsed.merge.merged.emissions, 300);
      assert.strictEqual(parsed.merge.merged.count, 8);
      assert.strictEqual(parsed.status, 'completed');
    });

    it('vote strategy selects majority value per key', async () => {
      // Create a run with a vote-strategy stage via direct DB setup
      const voteRunId = 'vote-run-' + Date.now();
      const workflow = {
        apiVersion: 'carbonkit-swarm/v1',
        metadata: { name: 'vote-wf', version: '1.0', description: 'V' },
        stages: [{ id: 'vs', name: 'V', agents: [{ role: 'r', agent: 'a', plugin: 'p', task: 't' }], merge: { strategy: 'vote' } }],
        deliverable: { name: 'D', format: 'json' },
      };
      await client.callTool('swarm.db.set', {
        collection: 'swarm_runs',
        doc: {
          _id: voteRunId, workflow, status: 'running',
          dag_order: ['vs'], dag_layers: [['vs']],
          current_stage: 'vs', stage_results: {}, started_at: new Date().toISOString(),
        },
      });
      const { parsed } = await client.callTool('swarm.merge', {
        run_id: voteRunId, stage_id: 'vs',
        agent_outputs: [{ rating: 'A', score: 85 }, { rating: 'B', score: 85 }, { rating: 'A', score: 90 }],
      });
      assert.strictEqual(parsed.merge.strategy, 'vote');
      assert.strictEqual(parsed.merge.merged.rating, 'A');
      assert.ok(parsed.merge.vote_counts);
    });

    it('rejects unknown run_id', async () => {
      const { isError } = await client.callTool('swarm.merge', {
        run_id: 'nonexistent', stage_id: 'gather', agent_outputs: [],
      });
      assert.strictEqual(isError, true);
    });

    it('rejects unknown stage_id', async () => {
      const { parsed: r } = await client.callTool('swarm.run', { workflow: TEST_WF_FILE });
      const { isError } = await client.callTool('swarm.merge', {
        run_id: r.run_id, stage_id: 'no-such-stage', agent_outputs: [],
      });
      assert.strictEqual(isError, true);
    });
  });

  // ── swarm.gate.check ──

  describe('swarm.gate.check', () => {
    let runId;

    before(async () => {
      const { parsed } = await client.callTool('swarm.run', { workflow: TEST_WF_FILE });
      runId = parsed.run_id;
    });

    it('all_agents_succeed passes when every agent completed', async () => {
      const { parsed } = await client.callTool('swarm.gate.check', {
        run_id: runId, stage_id: 'gather',
        agent_results: [{ status: 'completed' }, { status: 'completed' }],
      });
      assert.strictEqual(parsed.gate.passed, true);
      assert.strictEqual(parsed.gate.type, 'all_agents_succeed');
      assert.strictEqual(parsed.gate.detail.total, 2);
      assert.strictEqual(parsed.gate.detail.succeeded, 2);
    });

    it('all_agents_succeed fails when any agent failed', async () => {
      const { parsed } = await client.callTool('swarm.gate.check', {
        run_id: runId, stage_id: 'gather',
        agent_results: [{ status: 'completed' }, { status: 'failed' }],
      });
      assert.strictEqual(parsed.gate.passed, false);
      assert.strictEqual(parsed.gate.detail.succeeded, 1);
    });

    it('persists gate result to stage_results', async () => {
      const { parsed } = await client.callTool('swarm.stage.result', {
        run_id: runId, stage_id: 'gather',
      });
      assert.ok(parsed.result.gate);
      assert.strictEqual(parsed.result.gate.type, 'all_agents_succeed');
    });

    it('quorum gate passes at threshold', async () => {
      const qRunId = 'quorum-run-' + Date.now();
      const workflow = {
        apiVersion: 'carbonkit-swarm/v1',
        metadata: { name: 'q', version: '1.0', description: 'Q' },
        stages: [{ id: 'qs', name: 'QS', agents: [{ role: 'r', agent: 'a', plugin: 'p', task: 't' }], gate: { type: 'quorum', conditions: { quorum_pct: 0.5 } } }],
        deliverable: { name: 'D', format: 'json' },
      };
      await client.callTool('swarm.db.set', {
        collection: 'swarm_runs',
        doc: {
          _id: qRunId, workflow, status: 'running',
          dag_order: ['qs'], dag_layers: [['qs']],
          current_stage: 'qs', stage_results: {}, started_at: new Date().toISOString(),
        },
      });
      const { parsed } = await client.callTool('swarm.gate.check', {
        run_id: qRunId, stage_id: 'qs',
        agent_results: [{ status: 'completed' }, { status: 'failed' }, { status: 'completed' }, { status: 'failed' }],
      });
      assert.strictEqual(parsed.gate.passed, true);
      assert.strictEqual(parsed.gate.type, 'quorum');
    });

    it('rejects nonexistent run_id', async () => {
      const { isError } = await client.callTool('swarm.gate.check', {
        run_id: 'no', stage_id: 'gather', agent_results: [],
      });
      assert.strictEqual(isError, true);
    });

    it('rejects nonexistent stage_id', async () => {
      const { isError } = await client.callTool('swarm.gate.check', {
        run_id: runId, stage_id: 'no', agent_results: [],
      });
      assert.strictEqual(isError, true);
    });
  });

  // ── swarm.agent.spawn ──

  describe('swarm.agent.spawn', () => {
    let runId;

    before(async () => {
      const { parsed } = await client.callTool('swarm.run', {
        workflow: TEST_WF_FILE, params: { region: 'EU' },
      });
      runId = parsed.run_id;
    });

    it('spawns agent with simulated output', async () => {
      const { parsed, isError } = await client.callTool('swarm.agent.spawn', {
        run_id: runId, stage_id: 'gather',
        agent: {
          role: 'collector', agent: 'test-collector', plugin: 'scope3-calculation',
          task: 'Collect', outputs: ['raw_data'], inputs: { region: '$params.region' },
        },
      });
      assert.strictEqual(isError, false);
      assert.ok(parsed.agent_id);
      assert.strictEqual(parsed.status, 'completed');
      assert.ok(parsed.output.raw_data.startsWith('simulated_'));
      assert.ok(parsed.started_at);
      assert.ok(parsed.completed_at);
    });

    it('resolves $params references in inputs', async () => {
      const { parsed } = await client.callTool('swarm.agent.spawn', {
        run_id: runId, stage_id: 'gather',
        agent: { role: 'r', agent: 'a', plugin: 'p', task: 't', inputs: { region: '$params.region' }, outputs: [] },
      });
      assert.strictEqual(parsed.inputs.region, 'EU');
    });

    it('rejects missing agent object', async () => {
      const { isError } = await client.callTool('swarm.agent.spawn', {
        run_id: runId, stage_id: 'gather',
      });
      assert.strictEqual(isError, true);
    });

    it('rejects nonexistent stage_id', async () => {
      const { isError } = await client.callTool('swarm.agent.spawn', {
        run_id: runId, stage_id: 'no',
        agent: { role: 'r', agent: 'a', plugin: 'p', task: 't' },
      });
      assert.strictEqual(isError, true);
    });
  });

  // ── swarm.run ──

  describe('swarm.run', () => {
    it('starts a run with DAG order and execution plan', async () => {
      const { parsed, isError } = await client.callTool('swarm.run', { workflow: TEST_WF_FILE });
      assert.strictEqual(isError, false);
      assert.ok(parsed.run_id);
      assert.strictEqual(parsed.workflow, '_test_simple');
      assert.strictEqual(parsed.status, 'running');
      assert.deepStrictEqual(parsed.dag_order, ['gather', 'synthesize']);
      assert.strictEqual(parsed.stage_count, 2);
      assert.ok(parsed.total_agents >= 2);
      assert.ok(parsed.started_at);
    });

    it('accepts runtime param overrides', async () => {
      const { parsed } = await client.callTool('swarm.run', {
        workflow: TEST_WF_FILE, params: { region: 'APAC' },
      });
      assert.ok(parsed.run_id);
    });

    it('rejects missing workflow name', async () => {
      const { isError } = await client.callTool('swarm.run', {});
      assert.strictEqual(isError, true);
    });

    it('rejects nonexistent workflow file', async () => {
      const { isError } = await client.callTool('swarm.run', { workflow: 'no-such-file.yaml' });
      assert.strictEqual(isError, true);
    });
  });

  // ── swarm.status ──

  describe('swarm.status', () => {
    let runId;

    before(async () => {
      const { parsed } = await client.callTool('swarm.run', { workflow: TEST_WF_FILE });
      runId = parsed.run_id;
    });

    it('returns running status for a fresh run', async () => {
      const { parsed } = await client.callTool('swarm.status', { run_id: runId });
      assert.strictEqual(parsed.run_id, runId);
      assert.strictEqual(parsed.status, 'running');
      assert.strictEqual(parsed.current_stage, 'gather');
      assert.strictEqual(parsed.stages_total, 2);
      assert.strictEqual(parsed.stages_completed, 0);
    });

    it('shows completed after all stages are merged', async () => {
      await client.callTool('swarm.merge', {
        run_id: runId, stage_id: 'gather', agent_outputs: [{ raw_data: 'x' }],
      });
      await client.callTool('swarm.merge', {
        run_id: runId, stage_id: 'synthesize', agent_outputs: [{ summary: 'y' }],
      });
      const { parsed } = await client.callTool('swarm.status', { run_id: runId });
      assert.strictEqual(parsed.status, 'completed');
      assert.strictEqual(parsed.stages_completed, 2);
      assert.ok(parsed.completed_at);
    });

    it('rejects nonexistent run_id', async () => {
      const { isError } = await client.callTool('swarm.status', { run_id: 'no' });
      assert.strictEqual(isError, true);
    });
  });

  // ── swarm.list ──

  describe('swarm.list', () => {
    it('returns available workflows including the test workflow', async () => {
      const { parsed } = await client.callTool('swarm.list');
      assert.ok(parsed.count >= 1);
      assert.ok(Array.isArray(parsed.workflows));
      const tw = parsed.workflows.find((w) => w.filename === TEST_WF_FILE);
      assert.ok(tw, 'Test workflow not found');
      assert.strictEqual(tw.name, '_test_simple');
      assert.strictEqual(tw.stage_count, 2);
    });
  });

  // ── swarm.recover ──

  describe('swarm.recover', () => {
    it('skip_with_warning skips stage and advances', async () => {
      const { parsed: r } = await client.callTool('swarm.run', { workflow: TEST_WF_FILE });
      const { parsed, isError } = await client.callTool('swarm.recover', {
        run_id: r.run_id, stage_id: 'gather',
        action: 'skip_with_warning', reason: 'Non-critical failure',
      });
      assert.strictEqual(isError, false);
      assert.ok(parsed.recovery_id);
      assert.strictEqual(parsed.recovery.action, 'skip_with_warning');
      assert.ok(parsed.recovery.warning);
      assert.strictEqual(parsed.recovery.next_stage, 'synthesize');
    });

    it('retry_with_fix resets stage and records attempt', async () => {
      const { parsed: r } = await client.callTool('swarm.run', { workflow: TEST_WF_FILE });
      const { parsed } = await client.callTool('swarm.recover', {
        run_id: r.run_id, stage_id: 'gather',
        action: 'retry_with_fix', fix_params: { timeout: 20 },
      });
      assert.strictEqual(parsed.recovery.action, 'retry_with_fix');
      assert.strictEqual(parsed.recovery.attempt, 1);
      assert.strictEqual(parsed.recovery.stage_reset, true);
      assert.deepStrictEqual(parsed.recovery.fix_params, { timeout: 20 });
    });

    it('retry_with_fix escalates after max retries', async () => {
      const { parsed: r } = await client.callTool('swarm.run', { workflow: TEST_WF_FILE });
      await client.callTool('swarm.recover', { run_id: r.run_id, stage_id: 'gather', action: 'retry_with_fix' });
      await client.callTool('swarm.recover', { run_id: r.run_id, stage_id: 'gather', action: 'retry_with_fix' });
      const { parsed } = await client.callTool('swarm.recover', {
        run_id: r.run_id, stage_id: 'gather', action: 'retry_with_fix',
      });
      assert.strictEqual(parsed.recovery.action, 'escalate_to_user');
      assert.strictEqual(parsed.recovery.escalated, true);
    });

    it('escalate_to_user pauses the run', async () => {
      const { parsed: r } = await client.callTool('swarm.run', { workflow: TEST_WF_FILE });
      await client.callTool('swarm.recover', {
        run_id: r.run_id, stage_id: 'gather',
        action: 'escalate_to_user', message: 'Critical', severity: 'critical',
      });
      const { parsed: s } = await client.callTool('swarm.status', { run_id: r.run_id });
      assert.strictEqual(s.status, 'paused');
    });

    it('reassign records backup agent', async () => {
      const { parsed: r } = await client.callTool('swarm.run', { workflow: TEST_WF_FILE });
      const { parsed } = await client.callTool('swarm.recover', {
        run_id: r.run_id, stage_id: 'gather',
        action: 'reassign', failed_agent: 'op1', backup_agent: 'op2',
      });
      assert.strictEqual(parsed.recovery.action, 'reassign');
      assert.strictEqual(parsed.recovery.backup_agent, 'op2');
      assert.strictEqual(parsed.recovery.original_agent, 'op1');
    });

    it('rejects unknown recovery action', async () => {
      const { parsed: r } = await client.callTool('swarm.run', { workflow: TEST_WF_FILE });
      const { isError } = await client.callTool('swarm.recover', {
        run_id: r.run_id, stage_id: 'gather', action: 'bogus',
      });
      assert.strictEqual(isError, true);
    });

    it('rejects missing run_id', async () => {
      const { isError } = await client.callTool('swarm.recover', {
        stage_id: 'gather', action: 'skip_with_warning',
      });
      assert.strictEqual(isError, true);
    });
  });

  // ── swarm.deliverable ──

  describe('swarm.deliverable', () => {
    let runId;

    before(async () => {
      const { parsed } = await client.callTool('swarm.run', { workflow: TEST_WF_FILE });
      runId = parsed.run_id;
      await client.callTool('swarm.merge', {
        run_id: runId, stage_id: 'gather',
        agent_outputs: [{ raw_data: 'emissions_2025' }],
      });
      await client.callTool('swarm.merge', {
        run_id: runId, stage_id: 'synthesize',
        agent_outputs: [{ summary: 'Total: 1500 tCO2e' }],
      });
    });

    it('assembles deliverable with sections from a completed run', async () => {
      const { parsed, isError } = await client.callTool('swarm.deliverable', { run_id: runId });
      assert.strictEqual(isError, false);
      assert.strictEqual(parsed.name, 'Test Report');
      assert.strictEqual(parsed.format, 'json');
      assert.strictEqual(parsed.run_id, runId);
      assert.strictEqual(parsed.workflow, '_test_simple');
      assert.ok(parsed.generated_at);
      assert.strictEqual(parsed.sections.length, 2);
      assert.strictEqual(parsed.sections[0].title, 'Gathered Data');
      assert.strictEqual(parsed.sections[1].title, 'Synthesis');
    });

    it('includes valid SHA-256 integrity hash', async () => {
      const { parsed } = await client.callTool('swarm.deliverable', { run_id: runId });
      assert.ok(parsed.sha256);
      assert.strictEqual(parsed.sha256.length, 64);
      assert.ok(/^[0-9a-f]{64}$/.test(parsed.sha256));
    });

    it('includes audit trail with counts and timing', async () => {
      const { parsed } = await client.callTool('swarm.deliverable', { run_id: runId });
      assert.ok(parsed.audit_trail);
      assert.ok(parsed.audit_trail.started_at);
      assert.ok(parsed.audit_trail.completed_at);
      assert.strictEqual(parsed.audit_trail.stage_count, 2);
      assert.ok(parsed.audit_trail.stages_completed >= 2);
      assert.ok(parsed.audit_trail.total_agents >= 2);
    });

    it('rejects nonexistent run_id', async () => {
      const { isError } = await client.callTool('swarm.deliverable', { run_id: 'no' });
      assert.strictEqual(isError, true);
    });
  });

  // ── swarm.replay ──

  describe('swarm.replay', () => {
    let origRunId;

    before(async () => {
      const { parsed } = await client.callTool('swarm.run', { workflow: TEST_WF_FILE });
      origRunId = parsed.run_id;
      await client.callTool('swarm.merge', {
        run_id: origRunId, stage_id: 'gather',
        agent_outputs: [{ raw_data: 'replay_src' }],
      });
    });

    it('replays from a specific stage, reusing prior results', async () => {
      const { parsed, isError } = await client.callTool('swarm.replay', {
        run_id: origRunId, from_stage: 'synthesize',
      });
      assert.strictEqual(isError, false);
      assert.ok(parsed.run_id);
      assert.notStrictEqual(parsed.run_id, origRunId);
      assert.strictEqual(parsed.replay_of, origRunId);
      assert.strictEqual(parsed.stages_reused, 1);
      assert.strictEqual(parsed.stages_to_replay, 1);
      assert.ok(parsed.replay_order.includes('synthesize'));
    });

    it('replays entire run when from_stage is omitted', async () => {
      const { parsed } = await client.callTool('swarm.replay', { run_id: origRunId });
      assert.strictEqual(parsed.stages_reused, 0);
      assert.strictEqual(parsed.stages_to_replay, 2);
    });

    it('rejects nonexistent run_id', async () => {
      const { isError } = await client.callTool('swarm.replay', { run_id: 'no' });
      assert.strictEqual(isError, true);
    });
  });

  // ── End-to-end lifecycle ──

  describe('end-to-end lifecycle', () => {
    let runId;

    it('step 1: start run', async () => {
      const { parsed } = await client.callTool('swarm.run', {
        workflow: TEST_WF_FILE, params: { region: 'APAC' },
      });
      runId = parsed.run_id;
      assert.strictEqual(parsed.status, 'running');
    });

    it('step 2: spawn agent for gather', async () => {
      const { parsed } = await client.callTool('swarm.agent.spawn', {
        run_id: runId, stage_id: 'gather',
        agent: { role: 'c', agent: 'tc', plugin: 'p', task: 'T', inputs: { r: '$params.region' }, outputs: ['raw_data'] },
      });
      assert.strictEqual(parsed.status, 'completed');
    });

    it('step 3: gate check for gather', async () => {
      const { parsed } = await client.callTool('swarm.gate.check', {
        run_id: runId, stage_id: 'gather',
        agent_results: [{ status: 'completed' }],
      });
      assert.strictEqual(parsed.gate.passed, true);
    });

    it('step 4: merge gather', async () => {
      const { parsed } = await client.callTool('swarm.merge', {
        run_id: runId, stage_id: 'gather',
        agent_outputs: [{ raw_data: 'apac_data' }],
      });
      assert.strictEqual(parsed.next_stage, 'synthesize');
    });

    it('step 5: merge synthesize (completes run)', async () => {
      const { parsed } = await client.callTool('swarm.merge', {
        run_id: runId, stage_id: 'synthesize',
        agent_outputs: [{ summary: 'APAC 800 tCO2e' }],
      });
      assert.strictEqual(parsed.status, 'completed');
    });

    it('step 6: verify completed status', async () => {
      const { parsed } = await client.callTool('swarm.status', { run_id: runId });
      assert.strictEqual(parsed.status, 'completed');
      assert.strictEqual(parsed.stages_completed, 2);
    });

    it('step 7: assemble deliverable', async () => {
      const { parsed } = await client.callTool('swarm.deliverable', { run_id: runId });
      assert.strictEqual(parsed.name, 'Test Report');
      assert.ok(parsed.sha256);
      assert.ok(parsed.audit_trail);
    });
  });

  // ── Unknown tool ──

  describe('unknown tool', () => {
    it('returns RPC error for unrecognized tool name', async () => {
      const resp = await client.send('tools/call', { name: 'swarm.nope', arguments: {} });
      assert.ok(resp.error);
    });
  });
});
