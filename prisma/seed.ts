// prisma/seed.ts

import { PrismaClient, Prisma } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";

const prisma = new PrismaClient();

/* ============================================================
   ETHOS DATABASE SEED

   Loads the frozen Ethos Grade 8 knowledge base into PostgreSQL.

   Expected source files:

   data/nodes.json
   data/edges.json
   data/embeddings.json

   Validated reference:
   - Nodes:       375
   - Edges:       1,476
   - Embeddings:  375
   - Dimensions:  1,536
   - Retrieval:   v2.7a

   IMPORTANT:
   This script imports the validated data.
   It must not modify, enrich, summarize, or regenerate it.
   ============================================================ */


const EXPECTED_NODES = 375;
const EXPECTED_EDGES = 1476;
const EXPECTED_EMBEDDINGS = 375;
const EXPECTED_EMBEDDING_DIMENSIONS = 1536;


/* ============================================================
   TYPES FOR IMPORT FILES
   ============================================================ */

interface NodeImport {
  node_id: string;
  node_type: string;
  title: string;
  description?: string | null;

  grade_min?: number | null;
  grade_max?: number | null;

  ethos_month?: string | null;

  authority_level?: string | null;

  instructional_use: string[];

  source_name?: string | null;
  source_locator?: string | null;
  source_url?: string | null;

  provenance_type?: string | null;
  review_status?: string | null;

  display_ready?: boolean | null;

  notes?: string | null;
}


interface EdgeImport {
  edge_id: string;

  from_node: string;
  relationship_type: string;
  to_node: string;

  alignment_strength: number;

  grade?: number | null;
  month?: string | null;

  rationale?: string | null;
  source_basis?: string | null;

  source_name?: string | null;
  source_locator?: string | null;
  source_url?: string | null;

  assertion_authority?: string | null;
  provenance_type?: string | null;
  review_status?: string | null;
}


interface EmbeddingImport {
  node_id: string;
  embedding: number[];
  embedding_model: string;
}


/* ============================================================
   PATHS
   ============================================================ */

const dataDir = path.join(
  process.cwd(),
  "data"
);

const nodesPath = path.join(
  dataDir,
  "nodes.json"
);

const edgesPath = path.join(
  dataDir,
  "edges.json"
);

const embeddingsPath = path.join(
  dataDir,
  "embeddings.json"
);


/* ============================================================
   FILE LOADER
   ============================================================ */

function readJsonFile<T>(filePath: string): T {

  if (!fs.existsSync(filePath)) {
    throw new Error(
      `Required Ethos data file not found: ${filePath}`
    );
  }

  const raw = fs.readFileSync(
    filePath,
    "utf8"
  );

  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    throw new Error(
      `Could not parse JSON file: ${filePath}\n${String(error)}`
    );
  }
}


/* ============================================================
   LOAD EXPORTS
   ============================================================ */

function loadEthosData() {

  console.log("Reading Ethos export files...");

  const nodes =
    readJsonFile<NodeImport[]>(nodesPath);

  const edges =
    readJsonFile<EdgeImport[]>(edgesPath);

  const embeddings =
    readJsonFile<EmbeddingImport[]>(
      embeddingsPath
    );

  return {
    nodes,
    edges,
    embeddings
  };
}


/* ============================================================
   VALIDATE EXPORT
   ============================================================ */

function validateEthosData(
  nodes: NodeImport[],
  edges: EdgeImport[],
  embeddings: EmbeddingImport[]
): void {

  console.log("Validating Ethos export...");

  if (nodes.length !== EXPECTED_NODES) {
    throw new Error(
      `Expected ${EXPECTED_NODES} nodes but found ${nodes.length}.`
    );
  }

  if (edges.length !== EXPECTED_EDGES) {
    throw new Error(
      `Expected ${EXPECTED_EDGES} edges but found ${edges.length}.`
    );
  }

  if (
    embeddings.length !==
    EXPECTED_EMBEDDINGS
  ) {
    throw new Error(
      `Expected ${EXPECTED_EMBEDDINGS} embeddings but found ${embeddings.length}.`
    );
  }


  /* ----------------------------------------------------------
     NODE IDS
     ---------------------------------------------------------- */

  const nodeIds =
    nodes.map(node => node.node_id);

  const nodeIdSet =
    new Set(nodeIds);

  if (
    nodeIdSet.size !==
    nodeIds.length
  ) {
    throw new Error(
      "Duplicate node_id values found."
    );
  }


  /* ----------------------------------------------------------
     EDGE IDS
     ---------------------------------------------------------- */

  const edgeIds =
    edges.map(edge => edge.edge_id);

  const edgeIdSet =
    new Set(edgeIds);

  if (
    edgeIdSet.size !==
    edgeIds.length
  ) {
    throw new Error(
      "Duplicate edge_id values found."
    );
  }


  /* ----------------------------------------------------------
     EDGE REFERENCES
     ---------------------------------------------------------- */

  for (const edge of edges) {

    if (!nodeIdSet.has(edge.from_node)) {
      throw new Error(
        `Edge ${edge.edge_id} references missing from_node ${edge.from_node}.`
      );
    }

    if (!nodeIdSet.has(edge.to_node)) {
      throw new Error(
        `Edge ${edge.edge_id} references missing to_node ${edge.to_node}.`
      );
    }
  }


  /* ----------------------------------------------------------
     EMBEDDING IDS
     ---------------------------------------------------------- */

  const embeddingIds =
    embeddings.map(
      embedding => embedding.node_id
    );

  const embeddingIdSet =
    new Set(embeddingIds);

  if (
    embeddingIdSet.size !==
    embeddingIds.length
  ) {
    throw new Error(
      "Duplicate embedding node_id values found."
    );
  }


  /* ----------------------------------------------------------
     EVERY EMBEDDING MUST MATCH A NODE
     ---------------------------------------------------------- */

  for (const embedding of embeddings) {

    if (
      !nodeIdSet.has(
        embedding.node_id
      )
    ) {
      throw new Error(
        `Embedding references missing node ${embedding.node_id}.`
      );
    }
  }


  /* ----------------------------------------------------------
     EVERY NODE MUST HAVE AN EMBEDDING
     ---------------------------------------------------------- */

  for (const node of nodes) {

    if (
      !embeddingIdSet.has(
        node.node_id
      )
    ) {
      throw new Error(
        `Node ${node.node_id} does not have an embedding.`
      );
    }
  }


  /* ----------------------------------------------------------
     EMBEDDING DIMENSIONS
     ---------------------------------------------------------- */

  for (const embedding of embeddings) {

    if (
      embedding.embedding.length !==
      EXPECTED_EMBEDDING_DIMENSIONS
    ) {
      throw new Error(
        `Embedding ${embedding.node_id} has ` +
        `${embedding.embedding.length} dimensions; ` +
        `expected ${EXPECTED_EMBEDDING_DIMENSIONS}.`
      );
    }

    if (
      embedding.embedding.some(
        value =>
          typeof value !== "number" ||
          !Number.isFinite(value)
      )
    ) {
      throw new Error(
        `Embedding ${embedding.node_id} contains invalid numeric values.`
      );
    }
  }


  console.log("Export validation passed.");
}


/* ============================================================
   CLEAR EXISTING ETHOS KNOWLEDGE DATA
   ============================================================

   Order matters because Edge and Embedding reference Node.

   Query logs, QA logs, feedback, and application configuration
   are intentionally NOT deleted.
   ============================================================ */

async function clearKnowledgeBase(): Promise<void> {

  console.log(
    "Clearing existing Ethos knowledge data..."
  );

  await prisma.edge.deleteMany();

  await prisma.embedding.deleteMany();

  await prisma.node.deleteMany();
}


/* ============================================================
   INSERT NODES
   ============================================================ */

async function insertNodes(
  nodes: NodeImport[]
): Promise<void> {

  console.log(
    `Importing ${nodes.length} nodes...`
  );

  await prisma.node.createMany({
    data: nodes.map(node => ({
      node_id:
        node.node_id,

      node_type:
        node.node_type,

      title:
        node.title,

      description:
        node.description ?? null,

      grade_min:
        node.grade_min ?? null,

      grade_max:
        node.grade_max ?? null,

      ethos_month:
        node.ethos_month ?? null,

      authority_level:
        node.authority_level ?? null,

      instructional_use:
        node.instructional_use ?? [],

      source_name:
        node.source_name ?? null,

      source_locator:
        node.source_locator ?? null,

      source_url:
        node.source_url ?? null,

      provenance_type:
        node.provenance_type ?? null,

      review_status:
        node.review_status ?? null,

      display_ready:
        node.display_ready ?? false,

      notes:
        node.notes ?? null
    }))
  });
}


/* ============================================================
   INSERT EDGES
   ============================================================ */

async function insertEdges(
  edges: EdgeImport[]
): Promise<void> {

  console.log(
    `Importing ${edges.length} edges...`
  );

  await prisma.edge.createMany({
    data: edges.map(edge => ({
      edge_id:
        edge.edge_id,

      from_node:
        edge.from_node,

      relationship_type:
        edge.relationship_type,

      to_node:
        edge.to_node,

      alignment_strength:
        edge.alignment_strength,

      grade:
        edge.grade ?? null,

      month:
        edge.month ?? null,

      rationale:
        edge.rationale ?? null,

      source_basis:
        edge.source_basis ?? null,

      source_name:
        edge.source_name ?? null,

      source_locator:
        edge.source_locator ?? null,

      source_url:
        edge.source_url ?? null,

      assertion_authority:
        edge.assertion_authority ?? null,

      provenance_type:
        edge.provenance_type ?? null,

      review_status:
        edge.review_status ?? null
    }))
  });
}


/* ============================================================
   INSERT EMBEDDINGS
   ============================================================

   Prisma treats pgvector as an Unsupported field, so these
   inserts use parameterized raw SQL.

   Never construct the vector SQL from user input.
   These vectors come only from the frozen R export.
   ============================================================ */

async function insertEmbeddings(
  embeddings: EmbeddingImport[]
): Promise<void> {

  console.log(
    `Importing ${embeddings.length} embeddings...`
  );

  let imported = 0;

  for (const item of embeddings) {

    const vector =
      `[${item.embedding.join(",")}]`;

    await prisma.$executeRaw(
      Prisma.sql`
        INSERT INTO "embeddings"
          (
            "node_id",
            "embedding",
            "embedding_model",
            "created_at"
          )
        VALUES
          (
            ${item.node_id},
            ${vector}::vector,
            ${item.embedding_model},
            NOW()
          )
      `
    );

    imported++;

    if (
      imported % 50 === 0 ||
      imported === embeddings.length
    ) {
      console.log(
        `Embeddings: ${imported}/${embeddings.length}`
      );
    }
  }
}


/* ============================================================
   VERIFY DATABASE AFTER IMPORT
   ============================================================ */

async function verifyDatabase(): Promise<void> {

  console.log(
    "Verifying seeded database..."
  );

  const [
    nodeCount,
    edgeCount,
    embeddingCount
  ] = await Promise.all([
    prisma.node.count(),
    prisma.edge.count(),
    prisma.embedding.count()
  ]);

  if (
    nodeCount !==
    EXPECTED_NODES
  ) {
    throw new Error(
      `Database contains ${nodeCount} nodes; expected ${EXPECTED_NODES}.`
    );
  }

  if (
    edgeCount !==
    EXPECTED_EDGES
  ) {
    throw new Error(
      `Database contains ${edgeCount} edges; expected ${EXPECTED_EDGES}.`
    );
  }

  if (
    embeddingCount !==
    EXPECTED_EMBEDDINGS
  ) {
    throw new Error(
      `Database contains ${embeddingCount} embeddings; expected ${EXPECTED_EMBEDDINGS}.`
    );
  }

  console.log("");
  console.log(
    "========================================"
  );
  console.log(
    "ETHOS DATABASE SEED COMPLETE"
  );
  console.log(
    "========================================"
  );

  console.log(
    `Nodes:       ${nodeCount}/${EXPECTED_NODES} ✓`
  );

  console.log(
    `Edges:       ${edgeCount}/${EXPECTED_EDGES} ✓`
  );

  console.log(
    `Embeddings:  ${embeddingCount}/${EXPECTED_EMBEDDINGS} ✓`
  );

  console.log(
    `Dimensions:  ${EXPECTED_EMBEDDING_DIMENSIONS} ✓`
  );

  console.log(
    "Retrieval:   v2.7a"
  );

  console.log(
    "Data:        grade8-v01"
  );

  console.log("");
  console.log(
    "ETHOS KNOWLEDGE BASE VALID"
  );
  console.log(
    "========================================"
  );
}


/* ============================================================
   MAIN
   ============================================================ */

async function main(): Promise<void> {

  console.log("");
  console.log(
    "Starting Ethos database seed..."
  );
  console.log("");

  const {
    nodes,
    edges,
    embeddings
  } = loadEthosData();

  validateEthosData(
    nodes,
    edges,
    embeddings
  );

  await clearKnowledgeBase();

  await insertNodes(nodes);

  await insertEdges(edges);

  await insertEmbeddings(
    embeddings
  );

  await verifyDatabase();
}


/* ============================================================
   EXECUTE
   ============================================================ */

main()
  .catch(error => {

    console.error("");
    console.error(
      "ETHOS DATABASE SEED FAILED"
    );

    console.error(error);

    process.exitCode = 1;
  })
  .finally(async () => {

    await prisma.$disconnect();

  });
