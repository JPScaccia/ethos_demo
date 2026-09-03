// lib/ethos/semanticRetrieval.ts

import { PrismaClient, Prisma } from "@prisma/client";

import { ethosConfig } from "../config";

import { embedQuery } from "./embedQuery";


/* ============================================================
   ETHOS SEMANTIC RETRIEVAL

   Reproduces the semantic anchor stage of the validated
   Ethos retrieval pipeline.

   Teacher query
        ↓
   query embedding
        ↓
   cosine similarity against frozen node embeddings
        ↓
   top semantic anchors

   Current validated configuration:
   - embedding model: text-embedding-3-small
   - dimensions: 1536
   - semanticSeedK: 5

   IMPORTANT:
   This stage returns semantic anchors only.

   Graph expansion and hybrid ranking happen later.
   ============================================================ */


const prisma = new PrismaClient();


/* ============================================================
   TYPES
   ============================================================ */

export interface SemanticRetrievalInput {
  query: string;

  seedK?: number;
}


export interface SemanticAnchor {
  node_id: string;

  title: string;

  node_type: string;

  similarity: number;

  semantic_rank: number;
}


interface SemanticQueryRow {
  node_id: string;

  title: string;

  node_type: string;

  similarity: number;
}


/* ============================================================
   VALIDATE SEED K
   ============================================================ */

function normalizeSeedK(
  seedK?: number
): number {

  const value =
    seedK ??
    ethosConfig.semanticSeedK;


  if (
    !Number.isInteger(value) ||
    value < 1
  ) {
    throw new Error(
      "semanticSeedK must be a positive integer."
    );
  }


  return value;
}


/* ============================================================
   VECTOR SERIALIZATION
   ============================================================ */

function serializeVector(
  embedding: number[]
): string {

  return `[${embedding.join(",")}]`;
}


/* ============================================================
   SEMANTIC RETRIEVAL
   ============================================================ */

export async function retrieveSemanticAnchors(
  input: SemanticRetrievalInput
): Promise<SemanticAnchor[]> {

  const query =
    input.query
      .replace(/\s+/g, " ")
      .trim();


  if (!query) {
    throw new Error(
      "Cannot perform semantic retrieval on an empty query."
    );
  }


  const seedK =
    normalizeSeedK(
      input.seedK
    );


  /* ==========================================================
     1. EMBED QUERY
     ========================================================== */

  const queryEmbedding =
    await embedQuery({
      query
    });


  const vector =
    serializeVector(
      queryEmbedding.embedding
    );


  /* ==========================================================
     2. COSINE SIMILARITY SEARCH
     ==========================================================

     pgvector cosine distance operator:

       <=>

     cosine similarity is therefore:

       1 - cosine_distance

     Higher similarity = better semantic match.
     ========================================================== */

  const rows =
    await prisma.$queryRaw<
      SemanticQueryRow[]
    >(
      Prisma.sql`
        SELECT
          n.node_id,
          n.title,
          n.node_type,
          (
            1 -
            (
              e.embedding
              <=>
              ${vector}::vector
            )
          )::double precision
          AS similarity

        FROM "embeddings" e

        INNER JOIN "nodes" n
          ON n.node_id = e.node_id

        WHERE
          e.embedding_model =
          ${ethosConfig.embeddingModel}

        ORDER BY
          e.embedding
          <=>
          ${vector}::vector
          ASC,
          n.node_id ASC

        LIMIT ${seedK}
      `
    );


  /* ==========================================================
     3. ASSIGN SEMANTIC RANK
     ========================================================== */

  return rows.map(
    (
      row,
      index
    ): SemanticAnchor => ({
      node_id:
        row.node_id,

      title:
        row.title,

      node_type:
        row.node_type,

      similarity:
        Number(
          row.similarity
        ),

      semantic_rank:
        index + 1
    })
  );
}


export default retrieveSemanticAnchors;
