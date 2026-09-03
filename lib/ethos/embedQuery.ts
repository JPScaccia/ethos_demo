// lib/ethos/embedQuery.ts

import OpenAI from "openai";

import { ethosConfig } from "../config";


/* ============================================================
   ETHOS QUERY EMBEDDING

   Converts a teacher query into the same embedding space used
   by the frozen Ethos node embeddings.

   Current validated embedding model:
   text-embedding-3-small

   Expected dimensions:
   1536

   IMPORTANT:
   Retrieval parity depends on using the same embedding model
   and dimensionality as the R reference implementation.
   ============================================================ */


const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});


const EXPECTED_EMBEDDING_DIMENSIONS = 1536;


/* ============================================================
   INPUT / OUTPUT TYPES
   ============================================================ */

export interface EmbedQueryInput {
  query: string;
}


export interface EmbedQueryResult {
  query: string;
  embedding: number[];
  embeddingModel: string;
  dimensions: number;
}


/* ============================================================
   NORMALIZE QUERY
   ============================================================ */

function normalizeQuery(
  query: string
): string {

  return query
    .replace(/\s+/g, " ")
    .trim();
}


/* ============================================================
   VALIDATE EMBEDDING
   ============================================================ */

function validateEmbedding(
  embedding: number[]
): void {

  if (
    embedding.length !==
    EXPECTED_EMBEDDING_DIMENSIONS
  ) {
    throw new Error(
      `Ethos query embedding has ${embedding.length} dimensions; ` +
      `expected ${EXPECTED_EMBEDDING_DIMENSIONS}.`
    );
  }


  const invalidValue =
    embedding.some(
      value =>
        typeof value !== "number" ||
        !Number.isFinite(value)
    );


  if (invalidValue) {
    throw new Error(
      "Ethos query embedding contains invalid numeric values."
    );
  }
}


/* ============================================================
   EMBED QUERY
   ============================================================ */

export async function embedQuery(
  input: EmbedQueryInput
): Promise<EmbedQueryResult> {

  const query =
    normalizeQuery(input.query);


  if (!query) {
    throw new Error(
      "Cannot embed an empty Ethos query."
    );
  }


  if (!process.env.OPENAI_API_KEY) {
    throw new Error(
      "OPENAI_API_KEY is not configured."
    );
  }


  try {

    const response =
      await openai.embeddings.create({
        model:
          ethosConfig.embeddingModel,

        input:
          query,

        encoding_format:
          "float"
      });


    const embedding =
      response.data[0]?.embedding;


    if (!embedding) {
      throw new Error(
        "OpenAI returned no embedding."
      );
    }


    validateEmbedding(
      embedding
    );


    return {
      query,

      embedding,

      embeddingModel:
        ethosConfig.embeddingModel,

      dimensions:
        embedding.length
    };


  } catch (error) {

    console.error(
      "Ethos query embedding failed:",
      error
    );


    if (error instanceof Error) {
      throw new Error(
        `Could not generate Ethos query embedding: ${error.message}`
      );
    }


    throw new Error(
      "Could not generate Ethos query embedding."
    );
  }
}


export default embedQuery;
