#!/usr/bin/env node
/* eslint-disable no-console */

// Scope3 Strategy MCP Server (Model Context Protocol) - stdio transport.
// Implements: initialize, tools/list, tools/call
// Transport framing: LSP-style headers with Content-Length.
// No external dependencies - Node built-ins only.

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const SERVER_NAME = "scope3-strategy-mcp";

function readServerVersion() {
  try {
    const manifestPath = path.join(__dirname, "..", ".claude-plugin", "plugin.json");
    const raw = fs.readFileSync(manifestPath, "utf8");
    const parsed = JSON.parse(raw);
    if (typeof parsed?.version === "string" && parsed.version.trim().length > 0) {
      return parsed.version.trim();
    }
  } catch {
    // Best-effort only.
  }
  return "0.0.0";
}

const SERVER_VERSION = readServerVersion();

// ---------------------------------------------------------------------------
// Store (unified adapter)
// ---------------------------------------------------------------------------
const DATA_DIR = path.join(__dirname, "..", "data");
const { createStore } = require("../../shared-services/tools/store-adapter");
const store = createStore({ dataDir: DATA_DIR, serverName: SERVER_NAME });

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

function sha256Hex(text) {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

function uid() {
  return crypto.randomUUID();
}

function now() {
  return new Date().toISOString();
}

function textResult(obj) {
  return { content: [{ type: "text", text: typeof obj === "string" ? obj : JSON.stringify(obj, null, 2) }] };
}

function errorResult(msg) {
  return { isError: true, content: [{ type: "text", text: msg }] };
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

const TOOLS = [
  // --- Existing tools ---
  {
    name: "strategy.health",
    description: "Basic health check for the scope3 strategy MCP server.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "strategy.sha256",
    description: "Compute SHA-256 hex digest of provided UTF-8 text.",
    inputSchema: {
      type: "object",
      properties: { text: { type: "string", description: "Text to hash (UTF-8)." } },
      required: ["text"],
      additionalProperties: false,
    },
  },
  // --- DB tools ---
  {
    name: "strategy.db.get",
    description: "Retrieve a single document from a collection matching query.",
    inputSchema: {
      type: "object",
      properties: {
        collection: { type: "string", description: "Collection name." },
        query: { type: "object", description: "Key-value query to match." },
      },
      required: ["collection", "query"],
      additionalProperties: false,
    },
  },
  {
    name: "strategy.db.set",
    description: "Upsert a document into a collection. If doc has _id and matches existing, updates it; otherwise inserts.",
    inputSchema: {
      type: "object",
      properties: {
        collection: { type: "string", description: "Collection name." },
        doc: { type: "object", description: "Document to upsert. Include _id to update existing." },
      },
      required: ["collection", "doc"],
      additionalProperties: false,
    },
  },
  {
    name: "strategy.db.delete",
    description: "Delete documents from a collection matching query.",
    inputSchema: {
      type: "object",
      properties: {
        collection: { type: "string", description: "Collection name." },
        query: { type: "object", description: "Key-value query to match for deletion." },
      },
      required: ["collection", "query"],
      additionalProperties: false,
    },
  },
  {
    name: "strategy.db.list",
    description: "List documents from a collection, optionally filtered by query and limited.",
    inputSchema: {
      type: "object",
      properties: {
        collection: { type: "string", description: "Collection name." },
        query: { type: "object", description: "Optional key-value filter." },
        limit: { type: "number", description: "Max documents to return." },
      },
      required: ["collection"],
      additionalProperties: false,
    },
  },
  {
    name: "strategy.db.bulkSet",
    description: "Bulk upsert an array of documents into a collection.",
    inputSchema: {
      type: "object",
      properties: {
        collection: { type: "string", description: "Collection name." },
        docs: { type: "array", items: { type: "object" }, description: "Array of documents to upsert." },
      },
      required: ["collection", "docs"],
      additionalProperties: false,
    },
  },
  {
    name: "strategy.db.count",
    description: "Count documents in a collection matching an optional query.",
    inputSchema: {
      type: "object",
      properties: {
        collection: { type: "string", description: "Collection name." },
        query: { type: "object", description: "Optional key-value filter." },
      },
      required: ["collection"],
      additionalProperties: false,
    },
  },
  // --- Assessment tools ---
  {
    name: "strategy.assessment.create",
    description: "Create a new DMA assessment for an organization and year.",
    inputSchema: {
      type: "object",
      properties: {
        org_id: { type: "string", description: "Organization identifier." },
        year: { type: "number", description: "Reporting year." },
      },
      required: ["org_id", "year"],
      additionalProperties: false,
    },
  },
  {
    name: "strategy.assessment.get",
    description: "Retrieve a DMA assessment by its ID.",
    inputSchema: {
      type: "object",
      properties: {
        assessment_id: { type: "string", description: "Assessment identifier." },
      },
      required: ["assessment_id"],
      additionalProperties: false,
    },
  },
  // --- IRO tools ---
  {
    name: "strategy.iro.list",
    description: "List all IROs (Impacts, Risks, Opportunities) for a given assessment.",
    inputSchema: {
      type: "object",
      properties: {
        assessment_id: { type: "string", description: "Assessment identifier." },
      },
      required: ["assessment_id"],
      additionalProperties: false,
    },
  },
  {
    name: "strategy.iro.create",
    description: "Create a new IRO linked to an assessment.",
    inputSchema: {
      type: "object",
      properties: {
        assessment_id: { type: "string", description: "Assessment identifier." },
        type: { type: "string", description: "IRO type: impact, risk, or opportunity." },
        topic: { type: "string", description: "ESRS topic code (e.g. E1, S1, G1)." },
        title: { type: "string", description: "Descriptive title for this IRO." },
      },
      required: ["assessment_id", "type", "topic", "title"],
      additionalProperties: false,
    },
  },
  {
    name: "strategy.iro.score",
    description: "Score an IRO with impact and financial materiality values.",
    inputSchema: {
      type: "object",
      properties: {
        iro_id: { type: "string", description: "IRO identifier." },
        impact_materiality: { type: "number", description: "Impact materiality score (1-5)." },
        financial_materiality: { type: "number", description: "Financial materiality score (1-5)." },
        likelihood: { type: "number", description: "Optional likelihood score (1-5)." },
        confidence: { type: "string", description: "Confidence level: low, medium, high." },
      },
      required: ["iro_id", "impact_materiality", "financial_materiality"],
      additionalProperties: false,
    },
  },
  // --- Evidence ---
  {
    name: "strategy.evidence.add",
    description: "Attach stakeholder evidence to an IRO.",
    inputSchema: {
      type: "object",
      properties: {
        iro_id: { type: "string", description: "IRO identifier." },
        source: { type: "string", description: "Evidence source name or URL." },
        stakeholder_type: { type: "string", enum: ["internal", "external"], description: "Whether source is internal or external." },
        description: { type: "string", description: "Description of the evidence." },
      },
      required: ["iro_id", "source", "stakeholder_type", "description"],
      additionalProperties: false,
    },
  },
  // --- Analytical tools ---
  {
    name: "strategy.materiality_matrix",
    description: "Generate materiality matrix from scored IROs for an assessment. Classifies each IRO into quadrants based on impact and financial materiality thresholds.",
    inputSchema: {
      type: "object",
      properties: {
        assessment_id: { type: "string", description: "Assessment identifier." },
        threshold: { type: "number", description: "Materiality threshold (1-5). Default 3." },
      },
      required: ["assessment_id"],
      additionalProperties: false,
    },
  },
  {
    name: "strategy.esrs_sequence",
    description: "Compute ESRS materiality sequencing from assessed IROs. Groups material topics by ESRS standard and orders by combined materiality score.",
    inputSchema: {
      type: "object",
      properties: {
        assessment_id: { type: "string", description: "Assessment identifier." },
      },
      required: ["assessment_id"],
      additionalProperties: false,
    },
  },
  {
    name: "strategy.snapshot",
    description: "Create an immutable snapshot of an assessment. Optionally finalize to lock further mutations.",
    inputSchema: {
      type: "object",
      properties: {
        assessment_id: { type: "string", description: "Assessment identifier." },
        finalize: { type: "boolean", description: "If true, finalize the assessment (irreversible)." },
      },
      required: ["assessment_id"],
      additionalProperties: false,
    },
  },
  {
    name: "strategy.snapshot.verify",
    description: "Verify a snapshot's integrity by recomputing the SHA-256 hash of the assessment data and comparing it to the stored hash.",
    inputSchema: {
      type: "object",
      properties: {
        snapshot_id: { type: "string", description: "Snapshot identifier to verify." },
      },
      required: ["snapshot_id"],
      additionalProperties: false,
    },
  },
  {
    name: "strategy.risk_scan",
    description: "Scan stored documents and risk intelligence baseline for ESG risk signals across regulatory, media, and NGO channels.",
    inputSchema: {
      type: "object",
      properties: {
        org_id: { type: "string", description: "Organization identifier." },
        keywords: { type: "array", items: { type: "string" }, description: "Optional keywords to focus the scan." },
      },
      required: ["org_id"],
      additionalProperties: false,
    },
  },
  {
    name: "strategy.export",
    description: "Export an assessment as JSON or evidence pack.",
    inputSchema: {
      type: "object",
      properties: {
        assessment_id: { type: "string", description: "Assessment identifier." },
        format: { type: "string", enum: ["json", "evidence_pack"], description: "Export format." },
      },
      required: ["assessment_id", "format"],
      additionalProperties: false,
    },
  },
];

// ---------------------------------------------------------------------------
// Tool handlers
// ---------------------------------------------------------------------------

function handleHealth() {
  return textResult({
    ok: true,
    name: SERVER_NAME,
    version: SERVER_VERSION,
    pid: process.pid,
    timestamp: now(),
    collections_dir: DATA_DIR,
  });
}

function handleSha256(args) {
  if (typeof args?.text !== "string") return errorResult("Missing required argument: text (string)");
  return textResult(sha256Hex(args.text));
}

// --- DB handlers ---

function handleDbGet(args) {
  if (!args?.collection) return errorResult("Missing required argument: collection");
  if (!args?.query) return errorResult("Missing required argument: query");
  const doc = store.get(args.collection, args.query);
  if (!doc) return textResult({ found: false, doc: null });
  return textResult({ found: true, doc });
}

function handleDbSet(args) {
  if (!args?.collection) return errorResult("Missing required argument: collection");
  if (!args?.doc || typeof args.doc !== "object") return errorResult("Missing required argument: doc (object)");
  const doc = store.set(args.collection, args.doc);
  return textResult({ ok: true, doc });
}

function handleDbDelete(args) {
  if (!args?.collection) return errorResult("Missing required argument: collection");
  if (!args?.query || typeof args.query !== "object" || Object.keys(args.query).length === 0) {
    return errorResult("query must be a non-empty object to prevent accidental wipe");
  }
  try {
    const result = store.delete(args.collection, args.query);
    return textResult({ ok: true, ...result });
  } catch (e) {
    return errorResult(e.message);
  }
}

function handleDbList(args) {
  if (!args?.collection) return errorResult("Missing required argument: collection");
  const docs = store.list(args.collection, args.query, args.limit);
  return textResult({ count: docs.length, docs });
}

function handleDbBulkSet(args) {
  if (!args?.collection) return errorResult("Missing required argument: collection");
  if (!Array.isArray(args?.docs)) return errorResult("Missing required argument: docs (array)");
  const results = store.bulkSet(args.collection, args.docs);
  return textResult({ ok: true, count: results.length, docs: results });
}

function handleDbCount(args) {
  if (!args?.collection) return errorResult("Missing required argument: collection");
  const count = store.count(args.collection, args.query);
  return textResult({ collection: args.collection, count });
}

// --- Assessment handlers ---

function handleAssessmentCreate(args) {
  if (!args?.org_id) return errorResult("Missing required argument: org_id");
  if (typeof args?.year !== "number") return errorResult("Missing required argument: year (number)");

  // Check for duplicate active assessment
  const existing = store.get("assessments", { org_id: args.org_id, year: args.year });
  if (existing && !existing.finalized) {
    return errorResult(`Active assessment already exists for org ${args.org_id} year ${args.year}: ${existing._id}`);
  }

  const assessment = store.set("assessments", {
    _id: `asmt_${uid()}`,
    org_id: args.org_id,
    year: args.year,
    status: "draft",
    finalized: false,
    snapshot_count: 0,
  });

  return textResult({ ok: true, assessment });
}

function handleAssessmentGet(args) {
  if (!args?.assessment_id) return errorResult("Missing required argument: assessment_id");
  const assessment = store.get("assessments", { _id: args.assessment_id });
  if (!assessment) return errorResult(`Assessment not found: ${args.assessment_id}`);
  return textResult({ assessment });
}

// --- IRO handlers ---

function handleIroList(args) {
  if (!args?.assessment_id) return errorResult("Missing required argument: assessment_id");
  const assessment = store.get("assessments", { _id: args.assessment_id });
  if (!assessment) return errorResult(`Assessment not found: ${args.assessment_id}`);
  const iros = store.list("iros", { assessment_id: args.assessment_id });
  return textResult({ count: iros.length, iros });
}

function handleIroCreate(args) {
  if (!args?.assessment_id) return errorResult("Missing required argument: assessment_id");
  if (!args?.type) return errorResult("Missing required argument: type");
  if (!args?.topic) return errorResult("Missing required argument: topic");
  if (!args?.title) return errorResult("Missing required argument: title");

  const validTypes = ["impact", "risk", "opportunity"];
  if (!validTypes.includes(args.type)) return errorResult(`type must be one of: ${validTypes.join(", ")}`);

  const assessment = store.get("assessments", { _id: args.assessment_id });
  if (!assessment) return errorResult(`Assessment not found: ${args.assessment_id}`);
  if (assessment.finalized) return errorResult("409 DMA assessment is finalized");

  const iro = store.set("iros", {
    _id: `iro_${uid()}`,
    assessment_id: args.assessment_id,
    org_id: assessment.org_id,
    type: args.type,
    topic: args.topic,
    title: args.title,
    scores: null,
    evidence_count: 0,
  });

  return textResult({ ok: true, iro });
}

function handleIroScore(args) {
  if (!args?.iro_id) return errorResult("Missing required argument: iro_id");
  if (typeof args?.impact_materiality !== "number") return errorResult("Missing required argument: impact_materiality (number)");
  if (typeof args?.financial_materiality !== "number") return errorResult("Missing required argument: financial_materiality (number)");

  if (args.impact_materiality < 1 || args.impact_materiality > 5) return errorResult("impact_materiality must be between 1 and 5");
  if (args.financial_materiality < 1 || args.financial_materiality > 5) return errorResult("financial_materiality must be between 1 and 5");

  const iro = store.get("iros", { _id: args.iro_id });
  if (!iro) return errorResult(`IRO not found: ${args.iro_id}`);

  const assessment = store.get("assessments", { _id: iro.assessment_id });
  if (assessment?.finalized) return errorResult("409 DMA assessment is finalized");

  const scores = {
    impact_materiality: args.impact_materiality,
    financial_materiality: args.financial_materiality,
  };
  if (typeof args.likelihood === "number") {
    if (args.likelihood < 1 || args.likelihood > 5) return errorResult("likelihood must be between 1 and 5");
    scores.likelihood = args.likelihood;
  }
  if (args.confidence) {
    const validConf = ["low", "medium", "high"];
    if (!validConf.includes(args.confidence)) return errorResult(`confidence must be one of: ${validConf.join(", ")}`);
    scores.confidence = args.confidence;
  }
  scores.scored_at = now();

  iro.scores = scores;
  store.set("iros", iro);

  return textResult({ ok: true, iro });
}

// --- Evidence handler ---

function handleEvidenceAdd(args) {
  if (!args?.iro_id) return errorResult("Missing required argument: iro_id");
  if (!args?.source) return errorResult("Missing required argument: source");
  if (!args?.stakeholder_type) return errorResult("Missing required argument: stakeholder_type");
  if (!args?.description) return errorResult("Missing required argument: description");

  if (!["internal", "external"].includes(args.stakeholder_type)) {
    return errorResult("stakeholder_type must be 'internal' or 'external'");
  }

  const iro = store.get("iros", { _id: args.iro_id });
  if (!iro) return errorResult(`IRO not found: ${args.iro_id}`);

  const assessment = store.get("assessments", { _id: iro.assessment_id });
  if (assessment?.finalized) return errorResult("409 DMA assessment is finalized");

  // Check for duplicate evidence (same source + iro + description prefix)
  const dedupKey = sha256Hex(`${args.source}|${args.iro_id}|${String(args.description).slice(0, 100)}`);
  const existing = store.get("evidence", { iro_id: args.iro_id, dedup_hash: dedupKey });
  if (existing) return errorResult("409 Evidence already attached");

  const evidence = store.set("evidence", {
    _id: `ev_${uid()}`,
    iro_id: args.iro_id,
    assessment_id: iro.assessment_id,
    source: args.source,
    source_hash: sha256Hex(args.source),
    dedup_hash: dedupKey,
    stakeholder_type: args.stakeholder_type,
    description: args.description,
    captured_at: now(),
  });

  // Increment evidence count on IRO
  iro.evidence_count = (iro.evidence_count || 0) + 1;
  store.set("iros", iro);

  return textResult({ ok: true, evidence });
}

// --- Materiality matrix ---

function handleMaterialityMatrix(args) {
  if (!args?.assessment_id) return errorResult("Missing required argument: assessment_id");

  const assessment = store.get("assessments", { _id: args.assessment_id });
  if (!assessment) return errorResult(`Assessment not found: ${args.assessment_id}`);

  const iros = store.list("iros", { assessment_id: args.assessment_id });
  const scored = iros.filter((i) => i.scores);
  const unscored = iros.filter((i) => !i.scores);

  if (scored.length === 0) return errorResult("No scored IROs found. Score IROs before generating the matrix.");

  const THRESHOLD = (typeof args.threshold === "number" && args.threshold >= 1 && args.threshold <= 5)
    ? args.threshold
    : 3;
  const quadrants = {
    material: [],       // both >= 3
    impact_only: [],    // impact >= 3, financial < 3
    financial_only: [], // financial >= 3, impact < 3
    not_material: [],   // both < 3
  };

  for (const iro of scored) {
    const im = iro.scores.impact_materiality;
    const fm = iro.scores.financial_materiality;

    const entry = {
      iro_id: iro._id,
      title: iro.title,
      type: iro.type,
      topic: iro.topic,
      impact_materiality: im,
      financial_materiality: fm,
      likelihood: iro.scores.likelihood || null,
      confidence: iro.scores.confidence || null,
      evidence_count: iro.evidence_count || 0,
    };

    if (im >= THRESHOLD && fm >= THRESHOLD) {
      entry.quadrant = "material";
      quadrants.material.push(entry);
    } else if (im >= THRESHOLD) {
      entry.quadrant = "impact_only";
      quadrants.impact_only.push(entry);
    } else if (fm >= THRESHOLD) {
      entry.quadrant = "financial_only";
      quadrants.financial_only.push(entry);
    } else {
      entry.quadrant = "not_material";
      quadrants.not_material.push(entry);
    }
  }

  // Sort each quadrant by combined score descending
  for (const key of Object.keys(quadrants)) {
    quadrants[key].sort((a, b) =>
      (b.impact_materiality + b.financial_materiality) - (a.impact_materiality + a.financial_materiality)
    );
  }

  const matrix = {
    assessment_id: args.assessment_id,
    org_id: assessment.org_id,
    year: assessment.year,
    generated_at: now(),
    threshold: THRESHOLD,
    total_iros: iros.length,
    scored_count: scored.length,
    unscored_count: unscored.length,
    summary: {
      material: quadrants.material.length,
      impact_only: quadrants.impact_only.length,
      financial_only: quadrants.financial_only.length,
      not_material: quadrants.not_material.length,
    },
    quadrants,
  };

  // Persist the matrix result
  store.set("matrices", {
    _id: `mtx_${uid()}`,
    assessment_id: args.assessment_id,
    ...matrix,
  });

  return textResult(matrix);
}

// --- ESRS Sequencing ---

function handleEsrsSequence(args) {
  if (!args?.assessment_id) return errorResult("Missing required argument: assessment_id");

  const assessment = store.get("assessments", { _id: args.assessment_id });
  if (!assessment) return errorResult(`Assessment not found: ${args.assessment_id}`);

  const iros = store.list("iros", { assessment_id: args.assessment_id });
  const scored = iros.filter((i) => i.scores);

  if (scored.length === 0) return errorResult("No scored IROs. Score IROs before computing ESRS sequencing.");

  // ESRS topic mapping
  const esrsStandards = {
    E1: "Climate change",
    E2: "Pollution",
    E3: "Water and marine resources",
    E4: "Biodiversity and ecosystems",
    E5: "Resource use and circular economy",
    S1: "Own workforce",
    S2: "Workers in the value chain",
    S3: "Affected communities",
    S4: "Consumers and end-users",
    G1: "Business conduct",
  };

  // Group by topic
  const topicGroups = {};
  for (const iro of scored) {
    const topic = iro.topic;
    if (!topicGroups[topic]) {
      topicGroups[topic] = {
        topic,
        standard_name: esrsStandards[topic] || "Unknown",
        iros: [],
        max_impact: 0,
        max_financial: 0,
        combined_score: 0,
        is_material: false,
      };
    }
    const g = topicGroups[topic];
    const im = iro.scores.impact_materiality;
    const fm = iro.scores.financial_materiality;
    g.iros.push({
      iro_id: iro._id,
      title: iro.title,
      type: iro.type,
      impact_materiality: im,
      financial_materiality: fm,
    });
    g.max_impact = Math.max(g.max_impact, im);
    g.max_financial = Math.max(g.max_financial, fm);
    g.combined_score += im + fm;
    if (im >= 3 || fm >= 3) g.is_material = true;
  }

  // Sequence: material first, sorted by combined score descending
  const groups = Object.values(topicGroups);
  groups.sort((a, b) => {
    if (a.is_material !== b.is_material) return a.is_material ? -1 : 1;
    return b.combined_score - a.combined_score;
  });

  const sequence = groups.map((g, idx) => ({
    sequence_order: idx + 1,
    topic: g.topic,
    standard_name: g.standard_name,
    is_material: g.is_material,
    iro_count: g.iros.length,
    max_impact: g.max_impact,
    max_financial: g.max_financial,
    combined_score: g.combined_score,
    iros: g.iros,
  }));

  const result = {
    assessment_id: args.assessment_id,
    org_id: assessment.org_id,
    year: assessment.year,
    generated_at: now(),
    material_topics: sequence.filter((s) => s.is_material).length,
    total_topics: sequence.length,
    sequence,
  };

  return textResult(result);
}

// --- Snapshot ---

function handleSnapshot(args) {
  if (!args?.assessment_id) return errorResult("Missing required argument: assessment_id");

  const assessment = store.get("assessments", { _id: args.assessment_id });
  if (!assessment) return errorResult(`Assessment not found: ${args.assessment_id}`);

  if (assessment.finalized && args.finalize) {
    return errorResult("409 DMA assessment is finalized");
  }

  const iros = store.list("iros", { assessment_id: args.assessment_id });
  const evidence = store.list("evidence", { assessment_id: args.assessment_id });

  // Finalization gate: every IRO must have at least 1 evidence link
  if (args.finalize) {
    const zeroEvidence = iros.filter((i) => (i.evidence_count || 0) === 0);
    if (zeroEvidence.length > 0) {
      return errorResult(
        `Finalization blocked: ${zeroEvidence.length} IRO(s) have zero evidence links: ${zeroEvidence.map((i) => i._id).join(", ")}`
      );
    }
  }

  // Build snapshot payload
  const snapshotData = {
    assessment,
    iros,
    evidence,
    iro_count: iros.length,
    evidence_count: evidence.length,
  };
  const snapshotJson = JSON.stringify(snapshotData);
  const snapshotSha = sha256Hex(snapshotJson);

  assessment.snapshot_count = (assessment.snapshot_count || 0) + 1;
  const version = assessment.snapshot_count;

  const snapshot = store.set("snapshots", {
    _id: `snap_${uid()}`,
    assessment_id: args.assessment_id,
    version,
    sha256: snapshotSha,
    finalized: !!args.finalize,
    created_at: now(),
    iro_count: iros.length,
    evidence_count: evidence.length,
  });

  if (args.finalize) {
    assessment.finalized = true;
    assessment.status = "finalized";
    assessment.finalized_at = now();
  }
  store.set("assessments", assessment);

  return textResult({
    ok: true,
    snapshot_id: snapshot._id,
    version,
    sha256: snapshotSha,
    finalized: !!args.finalize,
    iro_count: iros.length,
    evidence_count: evidence.length,
  });
}

// --- Snapshot verify ---

function handleSnapshotVerify(args) {
  if (!args?.snapshot_id) return errorResult("Missing required argument: snapshot_id");

  const snapshot = store.get("snapshots", { _id: args.snapshot_id });
  if (!snapshot) return errorResult(`Snapshot not found: ${args.snapshot_id}`);

  const assessment = store.get("assessments", { _id: snapshot.assessment_id });
  if (!assessment) return errorResult(`Assessment not found for snapshot: ${snapshot.assessment_id}`);

  // Recompute the hash using the same method as handleSnapshot
  const iros = store.list("iros", { assessment_id: snapshot.assessment_id });
  const evidence = store.list("evidence", { assessment_id: snapshot.assessment_id });

  const snapshotData = {
    assessment,
    iros,
    evidence,
    iro_count: iros.length,
    evidence_count: evidence.length,
  };
  const recomputedJson = JSON.stringify(snapshotData);
  const recomputedSha = sha256Hex(recomputedJson);

  const storedSha = snapshot.sha256;
  const match = recomputedSha === storedSha;

  const result = {
    snapshot_id: args.snapshot_id,
    assessment_id: snapshot.assessment_id,
    version: snapshot.version,
    finalized: snapshot.finalized,
    stored_sha256: storedSha,
    recomputed_sha256: recomputedSha,
    integrity: match ? "valid" : "tampered",
    verified_at: now(),
  };

  if (!match) {
    result.note = "The assessment data has been modified since this snapshot was taken. The stored SHA-256 no longer matches the current data.";
    result.current_iro_count = iros.length;
    result.snapshot_iro_count = snapshot.iro_count;
    result.current_evidence_count = evidence.length;
    result.snapshot_evidence_count = snapshot.evidence_count;
  }

  return textResult(result);
}

// --- Risk scan ---

function handleRiskScan(args) {
  if (!args?.org_id) return errorResult("Missing required argument: org_id");

  const keywords = args.keywords || [];
  const scanId = `rscan_${uid()}`;
  const timestamp = now();

  // Load baseline signals from curated risk intelligence file
  let baselineSignals = [];
  const baselinePath = path.join(DATA_DIR, "risk-intelligence-baseline.json");
  try {
    const raw = fs.readFileSync(baselinePath, "utf8");
    baselineSignals = JSON.parse(raw);
    if (!Array.isArray(baselineSignals)) baselineSignals = [];
  } catch (_e) {
    // Baseline file not available, proceed with empty
  }

  // Scan stored documents for additional corpus-derived signals
  const storedDocs = store.list("evidence");
  const storedRiskScans = store.list("risk_scans", { org_id: args.org_id });
  const storedIros = store.list("iros");
  const corpusSignals = [];

  // Derive signals from existing IROs (risks and impacts already identified)
  for (const iro of storedIros) {
    if (iro.scores && (iro.type === "risk" || iro.type === "impact")) {
      const im = iro.scores.impact_materiality || 0;
      const fm = iro.scores.financial_materiality || 0;
      if (im >= 3 || fm >= 3) {
        corpusSignals.push({
          channel: "internal_corpus",
          source_name: `IRO: ${iro.title}`,
          jurisdiction: "Internal",
          topic_hint: iro.topic || "G1",
          severity: Math.min(im + 2, 10),
          relevance: 10,
          source_credibility: 7,
          novelty: 3,
          actionability: fm >= 3 ? 8 : 5,
          claim_summary: `Internal assessment identified material ${iro.type}: ${iro.title} (impact=${im}, financial=${fm}).`,
          keywords: [iro.topic?.toLowerCase(), iro.type, iro.title?.toLowerCase()].filter(Boolean),
        });
      }
    }
  }

  // Combine baseline + corpus
  const allSignals = [...baselineSignals, ...corpusSignals];

  // Filter and score by keywords using TF-IDF-inspired relevance
  let signals = allSignals;
  if (keywords.length > 0) {
    const kw = keywords.map((k) => k.toLowerCase());
    const totalDocs = allSignals.length || 1;

    // Compute IDF: log(totalDocs / docsContainingTerm)
    const docFreq = {};
    for (const k of kw) docFreq[k] = 0;
    for (const s of allSignals) {
      const text = [s.claim_summary, s.topic_hint, s.source_name, s.channel, ...(s.keywords || [])]
        .map((x) => String(x).toLowerCase()).join(" ");
      for (const k of kw) {
        if (text.includes(k)) docFreq[k]++;
      }
    }
    const idf = {};
    for (const k of kw) {
      idf[k] = docFreq[k] > 0 ? Math.log(totalDocs / docFreq[k]) + 1 : 0;
    }

    // Score each signal: sum of TF * IDF for each keyword
    const scored = allSignals.map((s) => {
      const text = [s.claim_summary, s.topic_hint, s.source_name, s.channel, ...(s.keywords || [])]
        .map((x) => String(x).toLowerCase()).join(" ");
      const words = text.split(/\s+/);
      const totalWords = words.length || 1;
      let tfidfScore = 0;
      for (const k of kw) {
        const tf = words.filter((w) => w.includes(k)).length / totalWords;
        tfidfScore += tf * (idf[k] || 0);
      }
      return { signal: s, tfidfScore };
    });

    // Filter to signals with any match, sorted by TF-IDF score
    signals = scored
      .filter((s) => s.tfidfScore > 0)
      .sort((a, b) => b.tfidfScore - a.tfidfScore)
      .map((s) => ({ ...s.signal, _tfidf_relevance: Math.round(s.tfidfScore * 1000) / 1000 }));

    // Always return at least some results
    if (signals.length === 0) signals = allSignals.slice(0, 5);
  }

  // Score and rank signals
  const ranked = signals.map((s) => {
    const priority =
      0.3 * s.severity +
      0.25 * s.relevance +
      0.2 * s.source_credibility +
      0.15 * s.novelty +
      0.1 * s.actionability;

    return {
      signal_id: s.signal_id || `sig_${uid()}`,
      channel: s.channel,
      source_name: s.source_name,
      jurisdiction: s.jurisdiction,
      topic_hint: s.topic_hint,
      claim_summary: s.claim_summary,
      scores: {
        severity: s.severity,
        relevance: s.relevance,
        source_credibility: s.source_credibility,
        novelty: s.novelty,
        actionability: s.actionability,
      },
      priority: Math.round(priority * 100) / 100,
      classification: priority >= 7 ? "high" : priority >= 5 ? "medium" : "low",
      disposition: "pending_review",
    };
  });

  ranked.sort((a, b) => b.priority - a.priority);

  // Persist the scan
  const channelsCovered = [...new Set(ranked.map((r) => r.channel))];
  store.set("risk_scans", {
    _id: scanId,
    org_id: args.org_id,
    keywords,
    scanned_at: timestamp,
    signal_count: ranked.length,
    baseline_signal_count: baselineSignals.length,
    corpus_signal_count: corpusSignals.length,
    channels_covered: channelsCovered,
  });

  return textResult({
    scan_id: scanId,
    org_id: args.org_id,
    scanned_at: timestamp,
    keywords,
    signal_count: ranked.length,
    sources: {
      baseline_signals: baselineSignals.length,
      corpus_signals: corpusSignals.length,
      total_before_filter: allSignals.length,
    },
    channels_covered: channelsCovered,
    signals: ranked,
  });
}

// --- Export ---

function handleExport(args) {
  if (!args?.assessment_id) return errorResult("Missing required argument: assessment_id");
  if (!args?.format) return errorResult("Missing required argument: format");
  if (!["json", "evidence_pack", "ixbrl"].includes(args.format)) {
    return errorResult("format must be 'json', 'evidence_pack', or 'ixbrl'");
  }

  const assessment = store.get("assessments", { _id: args.assessment_id });
  if (!assessment) return errorResult(`Assessment not found: ${args.assessment_id}`);

  const iros = store.list("iros", { assessment_id: args.assessment_id });
  const evidence = store.list("evidence", { assessment_id: args.assessment_id });
  const snapshots = store.list("snapshots", { assessment_id: args.assessment_id });

  if (args.format === "json") {
    const exportData = {
      export_format: "json",
      exported_at: now(),
      assessment,
      iros,
      evidence,
      snapshots,
      summary: {
        iro_count: iros.length,
        evidence_count: evidence.length,
        snapshot_count: snapshots.length,
        finalized: assessment.finalized,
      },
    };
    const exportJson = JSON.stringify(exportData);
    exportData.export_sha256 = sha256Hex(exportJson);
    return textResult(exportData);
  }

  if (args.format === "ixbrl") {
    // iXBRL (Inline XBRL) format for CSRD/ESRS compliance
    const materialIros = iros.filter((i) => {
      if (!i.scores) return false;
      return i.scores.impact_materiality >= 3 || i.scores.financial_materiality >= 3;
    });

    const esrsTopics = {
      E1: "Climate change",
      E2: "Pollution",
      E3: "Water and marine resources",
      E4: "Biodiversity and ecosystems",
      E5: "Resource use and circular economy",
      S1: "Own workforce",
      S2: "Workers in the value chain",
      S3: "Affected communities",
      S4: "Consumers and end-users",
      G1: "Business conduct",
    };

    const topicGroups = {};
    for (const iro of materialIros) {
      const topic = iro.topic;
      if (!topicGroups[topic]) {
        topicGroups[topic] = {
          topic,
          standard_name: esrsTopics[topic] || "Unknown",
          iros: [],
          material_count: 0,
        };
      }
      topicGroups[topic].iros.push(iro);
      topicGroups[topic].material_count += 1;
    }

    const latestSnapshot = snapshots.length > 0
      ? snapshots.sort((a, b) => b.version - a.version)[0]
      : null;

    // Generate iXBRL XHTML with embedded XBRL tags
    const ixbrlDoc = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml"
      xmlns:ix="http://www.xbrl.org/2013/inlineXBRL"
      xmlns:esrs="http://xbrl.efrag.org/esrs/2023"
      xmlns:xlink="http://www.w3.org/1999/xlink"
      xml:lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>ESRS Double Materiality Assessment Report - ${assessment.org_id} (${assessment.year})</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; line-height: 1.6; }
    h1 { color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 10px; }
    h2 { color: #34495e; margin-top: 30px; }
    table { border-collapse: collapse; width: 100%; margin: 20px 0; }
    th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
    th { background-color: #3498db; color: white; }
    tr:nth-child(even) { background-color: #f2f2f2; }
    .metadata { background-color: #ecf0f1; padding: 20px; border-radius: 5px; margin: 20px 0; }
    .iro-material { background-color: #e8f5e9; }
    .iro-risk { color: #d32f2f; }
    .iro-opportunity { color: #388e3c; }
    .iro-impact { color: #1976d2; }
  </style>
</head>
<body>
  <h1>European Sustainability Reporting Standards (ESRS)</h1>
  <h2>Double Materiality Assessment Report</h2>

  <div class="metadata">
    <p><strong>Reporting Entity:</strong> <ix:nonNumeric contextRef="ctx_org" name="esrs:ReportingEntityName">${assessment.org_id}</ix:nonNumeric></p>
    <p><strong>Reporting Period:</strong> <ix:nonNumeric contextRef="ctx_period" name="esrs:ReportingPeriod">${assessment.year}</ix:nonNumeric></p>
    <p><strong>Assessment Status:</strong> <ix:nonNumeric contextRef="ctx_assessment" name="esrs:AssessmentStatus">${assessment.status}</ix:nonNumeric></p>
    <p><strong>Finalized:</strong> <ix:nonFraction contextRef="ctx_assessment" name="esrs:AssessmentFinalized" format="ixt:booleanYesNo">${assessment.finalized ? "Yes" : "No"}</ix:nonFraction></p>
    <p><strong>Report Date:</strong> <ix:nonFraction contextRef="ctx_report" name="esrs:ReportDate" format="ixt:dateTime">${now()}</ix:nonFraction></p>
    ${latestSnapshot ? `<p><strong>Snapshot SHA-256:</strong> <ix:nonNumeric contextRef="ctx_snapshot" name="esrs:SnapshotHash">${latestSnapshot.sha256}</ix:nonNumeric></p>` : ""}
  </div>

  <h2>Materiality Assessment Summary</h2>
  <table>
    <tr>
      <th>Metric</th>
      <th>Count</th>
    </tr>
    <tr>
      <td>Total IROs Assessed</td>
      <td><ix:nonFraction contextRef="ctx_summary" name="esrs:TotalIROsAssessed" unitRef="items" decimals="0">${iros.length}</ix:nonFraction></td>
    </tr>
    <tr>
      <td>Material IROs (Double Materiality)</td>
      <td><ix:nonFraction contextRef="ctx_summary" name="esrs:MaterialIROs" unitRef="items" decimals="0">${materialIros.length}</ix:nonFraction></td>
    </tr>
    <tr>
      <td>Evidence Links</td>
      <td><ix:nonFraction contextRef="ctx_summary" name="esrs:EvidenceCount" unitRef="items" decimals="0">${evidence.length}</ix:nonFraction></td>
    </tr>
    <tr>
      <td>ESRS Topics Covered</td>
      <td><ix:nonFraction contextRef="ctx_summary" name="esrs:TopicsCovered" unitRef="items" decimals="0">${Object.keys(topicGroups).length}</ix:nonFraction></td>
    </tr>
  </table>

  <h2>Material ESRS Topics</h2>
${Object.values(topicGroups).map(group => `
  <h3><ix:nonNumeric contextRef="ctx_topic_${group.topic}" name="esrs:TopicCode">${group.topic}</ix:nonNumeric>: ${group.standard_name}</h3>
  <p>Material IROs: <ix:nonFraction contextRef="ctx_topic_${group.topic}" name="esrs:MaterialIROCount" unitRef="items" decimals="0">${group.material_count}</ix:nonFraction></p>
  <table>
    <tr>
      <th>IRO ID</th>
      <th>Type</th>
      <th>Title</th>
      <th>Impact Materiality</th>
      <th>Financial Materiality</th>
      <th>Evidence Count</th>
    </tr>
${group.iros.map(iro => `    <tr class="iro-material">
      <td><ix:nonNumeric contextRef="ctx_iro_${iro._id}" name="esrs:IROIdentifier">${iro._id}</ix:nonNumeric></td>
      <td class="iro-${iro.type}"><ix:nonNumeric contextRef="ctx_iro_${iro._id}" name="esrs:IROType">${iro.type}</ix:nonNumeric></td>
      <td><ix:nonNumeric contextRef="ctx_iro_${iro._id}" name="esrs:IROTitle">${iro.title}</ix:nonNumeric></td>
      <td><ix:nonFraction contextRef="ctx_iro_${iro._id}" name="esrs:ImpactMaterialityScore" unitRef="scale_1_5" decimals="0">${iro.scores.impact_materiality}</ix:nonFraction></td>
      <td><ix:nonFraction contextRef="ctx_iro_${iro._id}" name="esrs:FinancialMaterialityScore" unitRef="scale_1_5" decimals="0">${iro.scores.financial_materiality}</ix:nonFraction></td>
      <td><ix:nonFraction contextRef="ctx_iro_${iro._id}" name="esrs:EvidenceLinksCount" unitRef="items" decimals="0">${iro.evidence_count || 0}</ix:nonFraction></td>
    </tr>
`).join("")}  </table>
`).join("\n")}

  <h2>Assurance Statement</h2>
  <p>This Double Materiality Assessment has been conducted in accordance with ESRS 2 General Disclosures requirements. The assessment follows a structured process of stakeholder engagement, impact identification, and materiality scoring based on both impact materiality (inside-out perspective) and financial materiality (outside-in perspective).</p>
  ${assessment.finalized ? `<p><strong>This assessment has been finalized and locked for audit purposes. The snapshot hash provides cryptographic proof of data integrity.</strong></p>` : `<p><em>This assessment is in draft status and has not yet been finalized.</em></p>`}

  <h2>Methodology</h2>
  <p>Materiality Threshold: IROs with impact materiality ≥3 OR financial materiality ≥3 are considered material.</p>
  <p>Scoring Scale: 1 (low) to 5 (high) for both impact and financial materiality dimensions.</p>
  <p>Evidence Requirements: All material IROs must have at least one stakeholder evidence link (internal or external) before finalization.</p>

  <hr/>
  <p style="text-align: center; color: #7f8c8d; font-size: 0.9em;">
    Generated by CarbonKit Strategy Module | ESRS/CSRD Compliant iXBRL Report
  </p>
</body>
</html>`;

    return textResult({
      export_format: "ixbrl",
      exported_at: now(),
      assessment_id: args.assessment_id,
      org_id: assessment.org_id,
      year: assessment.year,
      material_iros_count: materialIros.length,
      esrs_topics_covered: Object.keys(topicGroups).length,
      ixbrl_document: ixbrlDoc,
      validation_note: "iXBRL document follows ESRS taxonomy structure. Validate with XBRL processor for production use.",
      document_sha256: sha256Hex(ixbrlDoc),
    });
  }

  // evidence_pack format - organized by IRO with ZIP manifest
  const iroEvidenceMap = {};
  for (const iro of iros) {
    const iroEvidence = evidence.filter((e) => e.iro_id === iro._id);
    iroEvidenceMap[iro._id] = {
      iro_id: iro._id,
      title: iro.title,
      type: iro.type,
      topic: iro.topic,
      scores: iro.scores,
      evidence: iroEvidence.map((e) => ({
        evidence_id: e._id,
        source: e.source,
        stakeholder_type: e.stakeholder_type,
        description: e.description,
        captured_at: e.captured_at,
        source_hash: e.source_hash,
      })),
      evidence_count: iroEvidence.length,
      has_internal: iroEvidence.some((e) => e.stakeholder_type === "internal"),
      has_external: iroEvidence.some((e) => e.stakeholder_type === "external"),
    };
  }

  const latestSnapshot = snapshots.length > 0
    ? snapshots.sort((a, b) => b.version - a.version)[0]
    : null;

  // Generate evidence pack manifest (simulates ZIP structure)
  const zipManifest = {
    format: "evidence_pack_zip",
    structure: [
      {
        path: "manifest.json",
        size_bytes: 2048,
        description: "ZIP manifest and integrity metadata",
      },
      {
        path: "assessment.json",
        size_bytes: JSON.stringify(assessment).length,
        description: "Assessment metadata and configuration",
      },
      {
        path: "snapshots.json",
        size_bytes: JSON.stringify(snapshots).length,
        description: "All assessment snapshots with SHA-256 hashes",
      },
      {
        path: "iros/",
        type: "directory",
        description: "IRO details organized by ID",
        children: iros.map((iro) => ({
          path: `iros/${iro._id}.json`,
          size_bytes: JSON.stringify(iro).length,
          description: `IRO: ${iro.title}`,
        })),
      },
      {
        path: "evidence/",
        type: "directory",
        description: "Evidence artifacts organized by IRO",
        children: iros.map((iro) => {
          const iroEvidence = evidence.filter((e) => e.iro_id === iro._id);
          return {
            path: `evidence/${iro._id}/`,
            type: "directory",
            description: `Evidence for ${iro.title}`,
            children: iroEvidence.map((ev) => ({
              path: `evidence/${iro._id}/${ev._id}.json`,
              size_bytes: JSON.stringify(ev).length,
              description: `Evidence from: ${ev.source}`,
            })),
          };
        }),
      },
      {
        path: "audit_trail.json",
        size_bytes: 4096,
        description: "Chronological audit trail of all assessment modifications",
      },
    ],
    total_files: iros.length + evidence.length + 4,
    estimated_size_mb: (
      (JSON.stringify(assessment).length +
        JSON.stringify(snapshots).length +
        JSON.stringify(iros).length +
        JSON.stringify(evidence).length +
        6144) /
      1024 /
      1024
    ).toFixed(2),
  };

  const pack = {
    export_format: "evidence_pack",
    exported_at: now(),
    assessment_id: args.assessment_id,
    org_id: assessment.org_id,
    year: assessment.year,
    status: assessment.status,
    finalized: assessment.finalized,
    latest_snapshot: latestSnapshot
      ? { snapshot_id: latestSnapshot._id, version: latestSnapshot.version, sha256: latestSnapshot.sha256 }
      : null,
    iro_evidence: iroEvidenceMap,
    summary: {
      total_iros: iros.length,
      total_evidence: evidence.length,
      iros_with_evidence: iros.filter((i) => (i.evidence_count || 0) > 0).length,
      iros_without_evidence: iros.filter((i) => (i.evidence_count || 0) === 0).length,
    },
    zip_manifest: zipManifest,
    note: "This is a simulated evidence pack export. In production, this would generate an actual ZIP file with the structure described in zip_manifest.",
  };
  const packJson = JSON.stringify(pack);
  pack.pack_sha256 = sha256Hex(packJson);
  return textResult(pack);
}

// ---------------------------------------------------------------------------
// Request dispatcher
// ---------------------------------------------------------------------------

async function handleRequest(msg) {
  const method = msg?.method;

  if (method === "initialize") {
    const requestedVersion = msg?.params?.protocolVersion;
    const protocolVersion =
      typeof requestedVersion === "string" && requestedVersion.trim().length > 0
        ? requestedVersion.trim()
        : "2024-11-05";

    return {
      protocolVersion,
      serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
      capabilities: {
        tools: { listChanged: false },
      },
    };
  }

  if (method === "tools/list") {
    return { tools: TOOLS };
  }

  if (method === "tools/call") {
    const name = msg?.params?.name;
    const args = msg?.params?.arguments ?? {};

    const handlers = {
      "strategy.health": handleHealth,
      "strategy.sha256": handleSha256,
      "strategy.db.get": handleDbGet,
      "strategy.db.set": handleDbSet,
      "strategy.db.delete": handleDbDelete,
      "strategy.db.list": handleDbList,
      "strategy.db.bulkSet": handleDbBulkSet,
      "strategy.db.count": handleDbCount,
      "strategy.assessment.create": handleAssessmentCreate,
      "strategy.assessment.get": handleAssessmentGet,
      "strategy.iro.list": handleIroList,
      "strategy.iro.create": handleIroCreate,
      "strategy.iro.score": handleIroScore,
      "strategy.evidence.add": handleEvidenceAdd,
      "strategy.materiality_matrix": handleMaterialityMatrix,
      "strategy.esrs_sequence": handleEsrsSequence,
      "strategy.snapshot": handleSnapshot,
      "strategy.snapshot.verify": handleSnapshotVerify,
      "strategy.risk_scan": handleRiskScan,
      "strategy.export": handleExport,
    };

    const handler = handlers[name];
    if (handler) return handler(args);

    return {
      isError: true,
      content: [{ type: "text", text: `Unknown tool: ${String(name)}` }],
    };
  }

  // Optional but safe: treat notifications/unknown methods as method-not-found.
  const err = new Error(`Method not found: ${String(method)}`);
  err.code = -32601;
  throw err;
}

// ---------------------------------------------------------------------------
// LSP framing transport
// ---------------------------------------------------------------------------

function writeMessage(msg) {
  const json = JSON.stringify(msg);
  const byteLen = Buffer.byteLength(json, "utf8");
  process.stdout.write(`Content-Length: ${byteLen}\r\n\r\n${json}`);
}

function jsonRpcResult(id, result) {
  return { jsonrpc: "2.0", id, result };
}

function jsonRpcError(id, code, message, data) {
  const error = { code, message };
  if (data !== undefined) error.data = data;
  return { jsonrpc: "2.0", id: id ?? null, error };
}

let buffer = Buffer.alloc(0);

// In stdio mode we serialize requests via this hook to avoid interleaved frames.
// It is assigned in the transport selection block.
let enqueueMessage = function (msg) {
  Promise.resolve(handleMessage(msg))
    .then((resp) => { if (resp) writeMessage(resp); })
    .catch(() => {});
};

function tryParseMessages() {
  while (buffer.length > 0) {
    let headerEnd = buffer.indexOf("\r\n\r\n");
    let headerSepLen = 4;
    if (headerEnd === -1) {
      headerEnd = buffer.indexOf("\n\n");
      headerSepLen = 2;
    }
    if (headerEnd === -1) return;

    const headerText = buffer.slice(0, headerEnd).toString("utf8");
    const lengthMatch = /content-length\s*:\s*(\d+)/i.exec(headerText);
    if (!lengthMatch) {
      buffer = buffer.slice(headerEnd + headerSepLen);
      continue;
    }

    const bodyLen = Number.parseInt(lengthMatch[1], 10);
    const bodyStart = headerEnd + headerSepLen;
    const bodyEnd = bodyStart + bodyLen;

    if (buffer.length < bodyEnd) return;

    const body = buffer.slice(bodyStart, bodyEnd).toString("utf8");
    buffer = buffer.slice(bodyEnd);

    let msg;
    try {
      msg = JSON.parse(body);
    } catch (e) {
      writeMessage(jsonRpcError(null, -32700, "Parse error", { error: String(e) }));
      continue;
    }
    enqueueMessage(msg);
  }
}

// ─── Transport selection (stdio vs HTTP) ──────────────────────────────────────

async function handleMessage(msg) {
  if (!msg || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") {
    const id = msg && Object.prototype.hasOwnProperty.call(msg, "id") ? msg.id : null;
    return jsonRpcError(id, -32600, "Invalid Request");
  }

  if (!Object.prototype.hasOwnProperty.call(msg, "id")) return null; // notification
  const id = msg.id;

  try {
    const result = await handleRequest(msg);
    return jsonRpcResult(id, result);
  } catch (err) {
    const code = Number.isInteger(err?.code) ? err.code : -32603;
    return jsonRpcError(id, code, err?.message || "Internal error");
  }
}

const transport = (process.env.CARBONKIT_MCP_TRANSPORT || 'stdio').toLowerCase();

if (transport === 'http') {
  const { startHttpTransport } = require('../../shared-services/tools/mcp-http-transport');
  const port = process.env.CARBONKIT_MCP_PORT || process.env.CARBONKIT_STRATEGY_PORT || 8403;
  startHttpTransport(handleMessage, null, port, { serverInfo: { name: SERVER_NAME, version: SERVER_VERSION } });
} else {
  // Serialize request handling to avoid interleaved stdout frames.
  let _queue = Promise.resolve();
  enqueueMessage = function enqueueMessage(msg) {
    _queue = _queue.then(async () => {
      const resp = await handleMessage(msg);
      if (resp) writeMessage(resp);
    }).catch((err) => {
      const id = Object.prototype.hasOwnProperty.call(msg, "id") ? msg.id : null;
      writeMessage(jsonRpcError(id, -32603, err?.message || "Internal error"));
    });
  };

  // stdio mode (default)
  process.stdin.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    tryParseMessages();
  });

  process.stdin.on("error", (e) => {
    console.error("stdin error:", e);
  });

  process.stdin.resume();
}
