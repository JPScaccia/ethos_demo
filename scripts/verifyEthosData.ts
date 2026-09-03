// scripts/verifyEthosData.ts

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const EXPECTED = {
  nodes: 375,
  edges: 1476,
  embeddings: 375,
  embeddingDimensions: 1536,
  retrievalVersion: "v2.7a",
  dataVersion: "grade8-v01"
};


/* ============================================================
   ETHOS DEPLOYMENT VERIFICATION

   Read-only verification script.

   Checks:
   - database connectivity
   - node count
   - edge count
   - embedding count
   - orphan edges
   - missing embeddings
   - embedding dimensions
   - embedding model consistency

   This script does NOT modify the database.
   ============================================================ */


/* ============================================================
   RESULT TYPES
   ============================================================ */

interface VerificationCheck {
  name: string;
  passed: boolean;
  detail: string;
}


interface VerificationResult {
  valid: boolean;
  checks: VerificationCheck[];
}


/* ============================================================
   HELPER
   ============================================================ */

function addCheck(
  checks: VerificationCheck[],
  name: string,
  passed: boolean,
  detail: string
): void {

  checks.push({
    name,
    passed,
    detail
  });
}


/* ============================================================
   VERIFY
   ============================================================ */

async function verifyEthosData():
  Promise<VerificationResult> {

  const checks: VerificationCheck[] = [];


  /* ----------------------------------------------------------
     DATABASE CONNECTION
     ---------------------------------------------------------- */

  try {

    await prisma.$queryRaw`SELECT 1`;

    addCheck(
      checks,
      "Database connection",
      true,
      "Connected successfully."
    );

  } catch (error) {

    addCheck(
      checks,
      "Database connection",
      false,
      `Connection failed: ${String(error)}`
    );

    return {
      valid: false,
      checks
    };
  }


  /* ----------------------------------------------------------
     COUNTS
     ---------------------------------------------------------- */

  const [
    nodeCount,
    edgeCount,
    embeddingCount
  ] = await Promise.all([
    prisma.node.count(),
    prisma.edge.count(),
    prisma.embedding.count()
  ]);


  addCheck(
    checks,
    "Node count",
    nodeCount === EXPECTED.nodes,
    `${nodeCount} found; expected ${EXPECTED.nodes}.`
  );


  addCheck(
    checks,
    "Edge count",
    edgeCount === EXPECTED.edges,
    `${edgeCount} found; expected ${EXPECTED.edges}.`
  );


  addCheck(
    checks,
    "Embedding count",
    embeddingCount === EXPECTED.embeddings,
    `${embeddingCount} found; expected ${EXPECTED.embeddings}.`
  );


  /* ----------------------------------------------------------
     ORPHAN EDGES
     ---------------------------------------------------------- */

  const orphanEdges =
    await prisma.$queryRaw<
      Array<{
        edge_id: string;
        from_node: string;
        to_node: string;
      }>
    >`
      SELECT
        e.edge_id,
        e.from_node,
        e.to_node
      FROM edges e
      LEFT JOIN nodes nf
        ON nf.node_id = e.from_node
      LEFT JOIN nodes nt
        ON nt.node_id = e.to_node
      WHERE
        nf.node_id IS NULL
        OR nt.node_id IS NULL
    `;


  addCheck(
    checks,
    "Edge references",
    orphanEdges.length === 0,
    orphanEdges.length === 0
      ? "All edges reference valid nodes."
      : `${orphanEdges.length} orphan edges found.`
  );


  /* ----------------------------------------------------------
     MISSING EMBEDDINGS
     ---------------------------------------------------------- */

  const missingEmbeddings =
    await prisma.$queryRaw<
      Array<{
        node_id: string;
      }>
    >`
      SELECT n.node_id
      FROM nodes n
      LEFT JOIN embeddings e
        ON e.node_id = n.node_id
      WHERE e.node_id IS NULL
    `;


  addCheck(
    checks,
    "Embedding coverage",
    missingEmbeddings.length === 0,
    missingEmbeddings.length === 0
      ? "Every node has an embedding."
      : `${missingEmbeddings.length} nodes are missing embeddings.`
  );


  /* ----------------------------------------------------------
     EMBEDDING DIMENSIONS
     ----------------------------------------------------------

     pgvector's vector_dims() function returns the number
     of dimensions stored in a vector.
     ---------------------------------------------------------- */

  const badDimensions =
    await prisma.$queryRaw<
      Array<{
        node_id: string;
        dimensions: number;
      }>
    >`
      SELECT
        node_id,
        vector_dims(embedding)::int AS dimensions
      FROM embeddings
      WHERE
        vector_dims(embedding)
        <> ${EXPECTED.embeddingDimensions}
    `;


  addCheck(
    checks,
    "Embedding dimensions",
    badDimensions.length === 0,
    badDimensions.length === 0
      ? `All embeddings have ${EXPECTED.embeddingDimensions} dimensions.`
      : `${badDimensions.length} embeddings have incorrect dimensions.`
  );


  /* ----------------------------------------------------------
     EMBEDDING MODEL
     ---------------------------------------------------------- */

  const embeddingModels =
    await prisma.embedding.groupBy({
      by: ["embedding_model"],
      _count: {
        embedding_model: true
      }
    });


  const validEmbeddingModel =
    embeddingModels.length === 1 &&
    embeddingModels[0].embedding_model ===
      "text-embedding-3-small";


  const embeddingModelSummary =
    embeddingModels
      .map(
        item =>
          `${item.embedding_model}: ${item._count.embedding_model}`
      )
      .join(", ");


  addCheck(
    checks,
    "Embedding model",
    validEmbeddingModel,
    embeddingModelSummary ||
      "No embedding model records found."
  );


  /* ----------------------------------------------------------
     DUPLICATE CHECKS

     Primary keys already prevent duplicates, but these provide
     explicit deployment diagnostics.
     ---------------------------------------------------------- */

  const duplicateNodeIds =
    await prisma.$queryRaw<
      Array<{
        node_id: string;
        count: bigint;
      }>
    >`
      SELECT
        node_id,
        COUNT(*) AS count
      FROM nodes
      GROUP BY node_id
      HAVING COUNT(*) > 1
    `;


  addCheck(
    checks,
    "Unique node IDs",
    duplicateNodeIds.length === 0,
    duplicateNodeIds.length === 0
      ? "All node IDs are unique."
      : `${duplicateNodeIds.length} duplicate node IDs found.`
  );


  const duplicateEdgeIds =
    await prisma.$queryRaw<
      Array<{
        edge_id: string;
        count: bigint;
      }>
    >`
      SELECT
        edge_id,
        COUNT(*) AS count
      FROM edges
      GROUP BY edge_id
      HAVING COUNT(*) > 1
    `;


  addCheck(
    checks,
    "Unique edge IDs",
    duplicateEdgeIds.length === 0,
    duplicateEdgeIds.length === 0
      ? "All edge IDs are unique."
      : `${duplicateEdgeIds.length} duplicate edge IDs found.`
  );


  /* ----------------------------------------------------------
     OVERALL RESULT
     ---------------------------------------------------------- */

  const valid =
    checks.every(check => check.passed);


  return {
    valid,
    checks
  };
}


/* ============================================================
   OUTPUT
   ============================================================ */

function printResult(
  result: VerificationResult
): void {

  console.log("");
  console.log(
    "========================================"
  );

  console.log(
    "ETHOS DATA VERIFICATION"
  );

  console.log(
    "========================================"
  );

  console.log(
    `Retrieval version: ${EXPECTED.retrievalVersion}`
  );

  console.log(
    `Data version:      ${EXPECTED.dataVersion}`
  );

  console.log("");


  for (const check of result.checks) {

    const symbol =
      check.passed ? "✓" : "✗";

    console.log(
      `${symbol} ${check.name}`
    );

    console.log(
      `  ${check.detail}`
    );
  }


  console.log("");
  console.log(
    "========================================"
  );


  if (result.valid) {

    console.log(
      "ETHOS DATA VALID"
    );

  } else {

    console.log(
      "ETHOS DATA INVALID"
    );
  }


  console.log(
    "========================================"
  );

  console.log("");
}


/* ============================================================
   MAIN
   ============================================================ */

async function main(): Promise<void> {

  const result =
    await verifyEthosData();

  printResult(result);

  if (!result.valid) {
    process.exitCode = 1;
  }
}


/* ============================================================
   EXECUTE
   ============================================================ */

main()
  .catch(error => {

    console.error("");
    console.error(
      "ETHOS VERIFICATION FAILED"
    );

    console.error(error);

    process.exitCode = 1;
  })
  .finally(async () => {

    await prisma.$disconnect();

  });
