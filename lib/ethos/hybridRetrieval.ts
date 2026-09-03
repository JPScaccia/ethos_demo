// lib/ethos/hybridRetrieval.ts

import { Prisma } from "@prisma/client";

import { db } from "../db";
import { ethosConfig } from "../config";

import type {
  EthosIntent
} from "../types";

import {
  retrieveSemanticAnchors
} from "./semanticRetrieval";

import type {
  SemanticAnchor
} from "./semanticRetrieval";

import {
  retrieveFromAnchors,
  scoreIntentMatch
} from "./graphRetrieval";

import { embedQuery } from "./embedQuery";


/* ============================================================
   ETHOS HYBRID RETRIEVAL — v2.7a

   Production port of:

   - generate_hybrid_candidates()
   - generate_hybrid_candidates_v25c()
   - get_candidate_semantic()
   - rank_hybrid_candidates()
   - rank_hybrid_candidates_v25e()
   - retrieve_hybrid_v25e()

   Validated pipeline:

   semantic anchors
        ↓
   graph retrieval
        ↓
   candidate aggregation
        ↓
   anchor candidates
        ↓
   primary relationship role
        ↓
   virtue/month context expansion
        ↓
   candidate semantic similarity
        ↓
   v2.7a hybrid scoring
        ↓
   intent-specific ranking
        ↓
   top N
   ============================================================ */


/* ============================================================
   INPUT
   ============================================================ */

export interface HybridRetrievalInput {
  query: string;

  intent: EthosIntent;

  grade?: number;

  month?: string | null;

  n?: number;

  seedK?: number;

  nPerAnchor?: number;

  contextBoost?: number;
}


/* ============================================================
   CANDIDATE TYPE
   ============================================================ */

export interface HybridCandidate {
  candidate: string;

  anchor_hits: number;

  best_anchor_rank: number;

  max_graph_score: number;

  mean_graph_score: number;

  primary_anchor_graph: number;

  max_intent_score: number;

  max_anchor_semantic: number;

  primary_relationship_role: number;

  context_graph_score: number;

  candidate_semantic: number;

  anchor_hit_score: number;

  anchor_rank_score: number;

  hybrid_score: number;

  contextual_semantic?: number;

  general_score?: number;

  virtue_context_score?: number;
}


/* ============================================================
   INTERNAL TYPES
   ============================================================ */

interface CandidateAggregate {
  candidate: string;

  anchor_hits: number;

  best_anchor_rank: number;

  max_graph_score: number;

  mean_graph_score: number;

  primary_anchor_graph: number;

  max_intent_score: number;

  max_anchor_semantic: number;

  primary_relationship_role: number;

  context_graph_score: number;
}


interface CandidateSemanticRow {
  candidate: string;

  candidate_semantic: number;
}


/* ============================================================
   RELATIONSHIP ROLE SCORE

   Exact port of score_relationship_role().
   ============================================================ */

function scoreRelationshipRole(
  relationshipType: string
): number {

  if (
    [
      "DOCTRINALLY_ALIGNS_WITH",
      "TEACHES",
      "RESPONDS_TO",
      "GROUNDED_IN_SCRIPTURE",
      "INFLUENCED"
    ].includes(
      relationshipType
    )
  ) {
    return 1;
  }


  if (
    [
      "HISTORICALLY_ALIGNS_WITH",
      "EXEMPLIFIES",
      "EXTENDS",
      "PROMPTS_INQUIRY_INTO"
    ].includes(
      relationshipType
    )
  ) {
    return 0.6;
  }


  if (
    [
      "STANDARDS_ALIGNS_WITH",
      "TAUGHT_DURING",
      "TAUGHT_IN",
      "PART_OF"
    ].includes(
      relationshipType
    )
  ) {
    return 0.3;
  }


  return 0.5;
}


/* ============================================================
   PRIMARY RELATIONSHIP SCORES

   R:

   primary_anchor <- anchors$node_id[1]

   then all direct edges touching that anchor are converted to
   candidate relationship-role scores.

   Multiple relationships to the same candidate use max().
   ============================================================ */

async function getPrimaryRelationshipScores(
  primaryAnchor: string
): Promise<Map<string, number>> {

  const edges =
    await db.edge.findMany({
      where: {
        OR: [
          {
            from_node:
              primaryAnchor
          },
          {
            to_node:
              primaryAnchor
          }
        ]
      },

      select: {
        from_node: true,
        to_node: true,
        relationship_type: true
      }
    });


  const scores =
    new Map<string, number>();


  for (const edge of edges) {

    const candidate =
      edge.from_node === primaryAnchor
        ? edge.to_node
        : edge.from_node;


    const relationshipScore =
      scoreRelationshipRole(
        edge.relationship_type
      );


    const existing =
      scores.get(candidate) ?? 0;


    scores.set(
      candidate,
      Math.max(
        existing,
        relationshipScore
      )
    );
  }


  return scores;
}


/* ============================================================
   GENERATE GRAPH CANDIDATES

   Port of graph_candidates inside
   generate_hybrid_candidates().
   ============================================================ */

function aggregateGraphCandidates(
  graphResults: Awaited<
    ReturnType<typeof retrieveFromAnchors>
  >
): Map<string, CandidateAggregate> {

  const grouped =
    new Map<
      string,
      typeof graphResults
    >();


  for (const result of graphResults) {

    const existing =
      grouped.get(
        result.candidate
      );


    if (existing) {

      existing.push(
        result
      );

    } else {

      grouped.set(
        result.candidate,
        [result]
      );
    }
  }


  const candidates =
    new Map<
      string,
      CandidateAggregate
    >();


  for (
    const [
      candidate,
      results
    ] of grouped.entries()
  ) {

    const anchorNodes =
      new Set(
        results.map(
          result =>
            result.anchor_node
        )
      );


    const maxGraphScore =
      Math.max(
        ...results.map(
          result =>
            result.score
        )
      );


    const meanGraphScore =
      results.reduce(
        (
          total,
          result
        ) =>
          total +
          result.score,
        0
      ) /
      results.length;


    const primaryAnchorGraph =
      Math.max(
        ...results.map(
          result =>
            result.anchor_rank === 1
              ? result.score
              : 0
        )
      );


    const maxIntentScore =
      Math.max(
        ...results.map(
          result =>
            result.intent_score
        )
      );


    const maxAnchorSemantic =
      Math.max(
        ...results.map(
          result =>
            result.anchor_semantic_score
        )
      );


    candidates.set(
      candidate,
      {
        candidate,

        anchor_hits:
          anchorNodes.size,

        best_anchor_rank:
          Math.min(
            ...results.map(
              result =>
                result.anchor_rank
            )
          ),

        max_graph_score:
          maxGraphScore,

        mean_graph_score:
          meanGraphScore,

        primary_anchor_graph:
          primaryAnchorGraph,

        max_intent_score:
          maxIntentScore,

        max_anchor_semantic:
          maxAnchorSemantic,

        primary_relationship_role:
          0,

        context_graph_score:
          0
      }
    );
  }


  return candidates;
}


/* ============================================================
   ADD SEMANTIC ANCHORS AS CANDIDATES

   Exact behavior of anchor_candidates.

   Anchors themselves remain eligible even if graph retrieval
   does not return them.
   ============================================================ */

async function addAnchorCandidates(
  candidates: Map<
    string,
    CandidateAggregate
  >,
  anchors: SemanticAnchor[],
  intent: EthosIntent
): Promise<void> {

  const nodeIds =
    anchors.map(
      anchor =>
        anchor.node_id
    );


  const nodes =
    await db.node.findMany({
      where: {
        node_id: {
          in: nodeIds
        }
      },

      select: {
        node_id: true,
        node_type: true,
        instructional_use: true
      }
    });


  const nodeMap =
    new Map(
      nodes.map(
        node => [
          node.node_id,
          node
        ]
      )
    );


  for (
    let i = 0;
    i < anchors.length;
    i += 1
  ) {

    const anchor =
      anchors[i];


    const node =
      nodeMap.get(
        anchor.node_id
      );


    const intentScore =
      scoreIntentMatch(
        intent,
        node?.node_type ??
          anchor.node_type,
        node?.instructional_use ??
          []
      );


    const anchorCandidate:
      CandidateAggregate = {

      candidate:
        anchor.node_id,

      anchor_hits:
        1,

      best_anchor_rank:
        i + 1,

      max_graph_score:
        0,

      mean_graph_score:
        0,

      primary_anchor_graph:
        0,

      max_intent_score:
        intentScore,

      max_anchor_semantic:
        anchor.similarity,

      primary_relationship_role:
        0,

      context_graph_score:
        0
    };


    const existing =
      candidates.get(
        anchor.node_id
      );


    if (!existing) {

      candidates.set(
        anchor.node_id,
        anchorCandidate
      );

      continue;
    }


    /*
     * Exact R aggregation behavior:
     *
     * max() for most fields,
     * min() for best_anchor_rank.
     */

    candidates.set(
      anchor.node_id,
      {
        candidate:
          anchor.node_id,

        anchor_hits:
          Math.max(
            existing.anchor_hits,
            anchorCandidate.anchor_hits
          ),

        best_anchor_rank:
          Math.min(
            existing.best_anchor_rank,
            anchorCandidate.best_anchor_rank
          ),

        max_graph_score:
          Math.max(
            existing.max_graph_score,
            anchorCandidate.max_graph_score
          ),

        mean_graph_score:
          Math.max(
            existing.mean_graph_score,
            anchorCandidate.mean_graph_score
          ),

        primary_anchor_graph:
          Math.max(
            existing.primary_anchor_graph,
            anchorCandidate.primary_anchor_graph
          ),

        max_intent_score:
          Math.max(
            existing.max_intent_score,
            anchorCandidate.max_intent_score
          ),

        max_anchor_semantic:
          Math.max(
            existing.max_anchor_semantic,
            anchorCandidate.max_anchor_semantic
          ),

        primary_relationship_role:
          existing.primary_relationship_role,

        context_graph_score:
          existing.context_graph_score
      }
    );
  }
}


/* ============================================================
   APPLY PRIMARY RELATIONSHIP ROLE
   ============================================================ */

function applyPrimaryRelationshipScores(
  candidates: Map<
    string,
    CandidateAggregate
  >,
  relationshipScores: Map<
    string,
    number
  >
): void {

  for (
    const candidate of candidates.values()
  ) {

    candidate.primary_relationship_role =
      relationshipScores.get(
        candidate.candidate
      ) ?? 0;
  }
}


/* ============================================================
   VIRTUE MONTH CONTEXT

   Exact special case from
   generate_hybrid_candidates_v25c().

   When:
     month != null
     intent == virtue

   Ethos takes the FIRST curriculum_unit for that month,
   assigns it semantic score = 1, performs graph retrieval,
   and merges context_graph_score into the normal candidates.
   ============================================================ */

async function applyVirtueMonthContext(
  candidates: Map<
    string,
    CandidateAggregate
  >,
  intent: EthosIntent,
  month: string | null,
  nPerAnchor: number
): Promise<void> {

  if (
    !month ||
    intent !== "virtue"
  ) {
    return;
  }


  const contextNode =
    await db.node.findFirst({
      where: {
        node_type:
          "curriculum_unit",

        ethos_month:
          month
      },

      select: {
        node_id: true,
        title: true,
        node_type: true
      }
    });


  if (!contextNode) {
    return;
  }


  /*
   * R context_anchor:
   *
   * node_id
   * semantic_score = 1
   */

  const contextAnchor:
    SemanticAnchor = {

    node_id:
      contextNode.node_id,

    title:
      contextNode.title,

    node_type:
      contextNode.node_type,

    similarity:
      1,

    semantic_rank:
      1
  };


  const contextResults =
    await retrieveFromAnchors({
      anchors:
        [contextAnchor],

      intent,

      nPerAnchor
    });


  const grouped =
    new Map<
      string,
      typeof contextResults
    >();


  for (
    const result of contextResults
  ) {

    const existing =
      grouped.get(
        result.candidate
      );


    if (existing) {

      existing.push(
        result
      );

    } else {

      grouped.set(
        result.candidate,
        [result]
      );
    }
  }


  const candidateIds =
    [...grouped.keys()];


  if (
    candidateIds.length === 0
  ) {
    return;
  }


  const nodes =
    await db.node.findMany({
      where: {
        node_id: {
          in:
            candidateIds
        }
      },

      select: {
        node_id: true,
        node_type: true,
        instructional_use: true
      }
    });


  const nodeMap =
    new Map(
      nodes.map(
        node => [
          node.node_id,
          node
        ]
      )
    );


  for (
    const [
      candidateId,
      results
    ] of grouped.entries()
  ) {

    const contextGraphScore =
      Math.max(
        ...results.map(
          result =>
            result.score
        )
      );


    const node =
      nodeMap.get(
        candidateId
      );


    const maxIntentScore =
      scoreIntentMatch(
        intent,
        node?.node_type ?? "",
        node?.instructional_use ?? []
      );


    /*
     * R creates a context candidate with:
     *
     * anchor_hits = 0
     * best_anchor_rank = Inf
     * max_graph_score = 0
     * mean_graph_score = 0
     * primary_anchor_graph = 0
     * max_anchor_semantic = 0
     * primary_relationship_role = 0
     */

    const existing =
      candidates.get(
        candidateId
      );


    if (!existing) {

      candidates.set(
        candidateId,
        {
          candidate:
            candidateId,

          anchor_hits:
            0,

          best_anchor_rank:
            Number.POSITIVE_INFINITY,

          max_graph_score:
            0,

          mean_graph_score:
            0,

          primary_anchor_graph:
            0,

          max_intent_score:
            maxIntentScore,

          max_anchor_semantic:
            0,

          primary_relationship_role:
            0,

          context_graph_score:
            contextGraphScore
        }
      );

      continue;
    }


    candidates.set(
      candidateId,
      {
        candidate:
          candidateId,

        anchor_hits:
          Math.max(
            existing.anchor_hits,
            0
          ),

        best_anchor_rank:
          Math.min(
            existing.best_anchor_rank,
            Number.POSITIVE_INFINITY
          ),

        max_graph_score:
          Math.max(
            existing.max_graph_score,
            0
          ),

        mean_graph_score:
          Math.max(
            existing.mean_graph_score,
            0
          ),

        primary_anchor_graph:
          Math.max(
            existing.primary_anchor_graph,
            0
          ),

        max_intent_score:
          Math.max(
            existing.max_intent_score,
            maxIntentScore
          ),

        max_anchor_semantic:
          Math.max(
            existing.max_anchor_semantic,
            0
          ),

        primary_relationship_role:
          Math.max(
            existing.primary_relationship_role,
            0
          ),

        context_graph_score:
          Math.max(
            existing.context_graph_score,
            contextGraphScore
          )
      }
    );
  }
}


/* ============================================================
   CANDIDATE SEMANTIC SIMILARITY

   Port of get_candidate_semantic().

   R computes a fresh query embedding and then cosine
   similarity against the candidate embeddings.

   pgvector's <=> operator returns cosine distance, so:

     similarity = 1 - cosine distance
   ============================================================ */

async function getCandidateSemantic(
  query: string,
  candidateIds: string[]
): Promise<Map<string, number>> {

  if (
    candidateIds.length === 0
  ) {
    return new Map();
  }


  const queryEmbedding =
    await embedQuery({
      query
    });


  const vector =
    `[${queryEmbedding.embedding.join(",")}]`;


  const rows =
    await db.$queryRaw<
      CandidateSemanticRow[]
    >(
      Prisma.sql`
        SELECT
          e.node_id AS candidate,

          (
            1 -
            (
              e.embedding
              <=>
              ${vector}::vector
            )
          )::double precision
          AS candidate_semantic

        FROM "embeddings" e

        WHERE
          e.node_id IN (
            ${Prisma.join(candidateIds)}
          )
      `
    );


  return new Map(
    rows.map(
      row => [
        row.candidate,
        Number(
          row.candidate_semantic
        )
      ]
    )
  );
}


/* ============================================================
   BASE HYBRID SCORE — v2.7a

   Exact formula:

   anchor_hit_score =
     anchor_hits / max(anchor_hits)

   anchor_rank_score =
     finite(best_anchor_rank)
       ? 1 / best_anchor_rank
       : 0

   hybrid_score =
       max_graph_score       * .40
     + mean_graph_score      * .15
     + max_anchor_semantic   * .20
     + anchor_hit_score      * .10
     + anchor_rank_score     * .15
   ============================================================ */

function calculateHybridScores(
  candidates: CandidateAggregate[],
  semanticScores: Map<
    string,
    number
  >
): HybridCandidate[] {

  const maxAnchorHits =
    candidates.length > 0
      ? Math.max(
          ...candidates.map(
            candidate =>
              candidate.anchor_hits
          )
        )
      : 0;


  return candidates.map(
    candidate => {

      /*
       * R replace_na(candidate_semantic, 0)
       */

      const candidateSemantic =
        semanticScores.get(
          candidate.candidate
        ) ?? 0;


      /*
       * Normally max(anchor_hits) > 0 because semantic anchors
       * are included as candidates.
       *
       * This guard prevents division by zero without changing
       * normal validated behavior.
       */

      const anchorHitScore =
        maxAnchorHits > 0
          ? candidate.anchor_hits /
            maxAnchorHits
          : 0;


      const anchorRankScore =
        Number.isFinite(
          candidate.best_anchor_rank
        )
          ? 1 /
            candidate.best_anchor_rank
          : 0;


      const hybridScore =
        candidate.max_graph_score *
          0.40 +

        candidate.mean_graph_score *
          0.15 +

        candidate.max_anchor_semantic *
          0.20 +

        anchorHitScore *
          0.10 +

        anchorRankScore *
          0.15;


      return {
        ...candidate,

        candidate_semantic:
          candidateSemantic,

        anchor_hit_score:
          anchorHitScore,

        anchor_rank_score:
          anchorRankScore,

        hybrid_score:
          hybridScore
      };
    }
  );
}


/* ============================================================
   SORT HELPERS
   ============================================================ */

function descending(
  a: number,
  b: number
): number {

  return b - a;
}


/* ============================================================
   FINAL v2.7a RANKING

   Exact intent-specific behavior from:

   rank_hybrid_candidates()
   rank_hybrid_candidates_v25e()
   ============================================================ */

async function rankHybridCandidates(
  candidates: HybridCandidate[],
  intent: EthosIntent,
  month: string | null,
  contextBoost: number
): Promise<HybridCandidate[]> {

  /* ----------------------------------------------------------
     SPECIAL VIRTUE + MONTH BRANCH

     v2.7a intercepts this BEFORE rank_hybrid_candidates().
     ---------------------------------------------------------- */

  if (
    intent === "virtue" &&
    month
  ) {

    return candidates
      .filter(
        candidate =>
          candidate.max_intent_score >
          0
      )
      .map(
        candidate => ({
          ...candidate,

          virtue_context_score:
            candidate.hybrid_score +
            candidate.context_graph_score *
            candidate.candidate_semantic
        })
      )
      .sort(
        (a, b) => {

          if (
            b.max_intent_score !==
            a.max_intent_score
          ) {
            return descending(
              a.max_intent_score,
              b.max_intent_score
            );
          }


          if (
            b.virtue_context_score! !==
            a.virtue_context_score!
          ) {
            return descending(
              a.virtue_context_score!,
              b.virtue_context_score!
            );
          }


          return descending(
            a.candidate_semantic,
            b.candidate_semantic
          );
        }
      );
  }


  /* ----------------------------------------------------------
     FAMILY / DISCUSSION MONTH CONTEXT

     contextual_semantic =
       candidate_semantic +
       context_boost * month_match

     month_match is TRUE only when:
       candidate ethos_month is non-null
       AND equals requested month.
     ---------------------------------------------------------- */

  if (
    month &&
    (
      intent === "family" ||
      intent === "discussion"
    )
  ) {

    const candidateIds =
      candidates.map(
        candidate =>
          candidate.candidate
      );


    const nodes =
      await db.node.findMany({
        where: {
          node_id: {
            in:
              candidateIds
          }
        },

        select: {
          node_id: true,
          ethos_month: true
        }
      });


    const monthMap =
      new Map(
        nodes.map(
          node => [
            node.node_id,
            node.ethos_month
          ]
        )
      );


    candidates =
      candidates.map(
        candidate => {

          const candidateMonth =
            monthMap.get(
              candidate.candidate
            );


          const monthMatch =
            candidateMonth !== null &&
            candidateMonth !== undefined &&
            candidateMonth === month;


          return {
            ...candidate,

            contextual_semantic:
              candidate.candidate_semantic +
              (
                monthMatch
                  ? contextBoost
                  : 0
              )
          };
        }
      );

  } else {

    candidates =
      candidates.map(
        candidate => ({
          ...candidate,

          contextual_semantic:
            candidate.candidate_semantic
        })
      );
  }


  /* ----------------------------------------------------------
     STANDARDS / VIRTUE
     ---------------------------------------------------------- */

  if (
    intent === "standards" ||
    intent === "virtue"
  ) {

    return candidates
      .filter(
        candidate =>
          candidate.max_intent_score >
          0
      )
      .sort(
        (a, b) => {

          if (
            b.max_intent_score !==
            a.max_intent_score
          ) {
            return descending(
              a.max_intent_score,
              b.max_intent_score
            );
          }


          if (
            b.hybrid_score !==
            a.hybrid_score
          ) {
            return descending(
              a.hybrid_score,
              b.hybrid_score
            );
          }


          return descending(
            a.candidate_semantic,
            b.candidate_semantic
          );
        }
      );
  }


  /* ----------------------------------------------------------
     SAINT / SCRIPTURE
     ---------------------------------------------------------- */

  if (
    intent === "saint" ||
    intent === "scripture"
  ) {

    return candidates
      .filter(
        candidate =>
          candidate.max_intent_score >
          0
      )
      .sort(
        (a, b) => {

          if (
            b.max_intent_score !==
            a.max_intent_score
          ) {
            return descending(
              a.max_intent_score,
              b.max_intent_score
            );
          }


          if (
            b.candidate_semantic !==
            a.candidate_semantic
          ) {
            return descending(
              a.candidate_semantic,
              b.candidate_semantic
            );
          }


          return descending(
            a.hybrid_score,
            b.hybrid_score
          );
        }
      );
  }


  /* ----------------------------------------------------------
     DOCTRINE
     ---------------------------------------------------------- */

  if (
    intent === "doctrine"
  ) {

    return candidates
      .filter(
        candidate =>
          candidate.max_intent_score >
          0
      )
      .sort(
        (a, b) => {

          if (
            b.hybrid_score !==
            a.hybrid_score
          ) {
            return descending(
              a.hybrid_score,
              b.hybrid_score
            );
          }


          return descending(
            a.candidate_semantic,
            b.candidate_semantic
          );
        }
      );
  }


  /* ----------------------------------------------------------
     FAMILY / DISCUSSION
     ---------------------------------------------------------- */

  if (
    intent === "family" ||
    intent === "discussion"
  ) {

    return candidates
      .filter(
        candidate =>
          candidate.max_intent_score >
          0
      )
      .sort(
        (a, b) => {

          const aContext =
            a.contextual_semantic ??
            a.candidate_semantic;

          const bContext =
            b.contextual_semantic ??
            b.candidate_semantic;


          if (
            bContext !==
            aContext
          ) {
            return descending(
              aContext,
              bContext
            );
          }


          return descending(
            a.hybrid_score,
            b.hybrid_score
          );
        }
      );
  }


  /* ----------------------------------------------------------
     TEACHER READING
     ---------------------------------------------------------- */

  if (
    intent === "teacher_reading"
  ) {

    return candidates
      .filter(
        candidate =>
          candidate.max_intent_score >
          0
      )
      .sort(
        (a, b) => {

          if (
            b.candidate_semantic !==
            a.candidate_semantic
          ) {
            return descending(
              a.candidate_semantic,
              b.candidate_semantic
            );
          }


          return descending(
            a.hybrid_score,
            b.hybrid_score
          );
        }
      );
  }


  /* ----------------------------------------------------------
     ACTIVITY
     ---------------------------------------------------------- */

  if (
    intent === "activity"
  ) {

    return candidates
      .filter(
        candidate =>
          candidate.max_intent_score >
          0
      )
      .sort(
        (a, b) =>
          descending(
            a.hybrid_score,
            b.hybrid_score
          )
      );
  }


  /* ----------------------------------------------------------
     PRIMARY SOURCE
     ---------------------------------------------------------- */

  if (
    intent === "primary_source"
  ) {

    return candidates
      .filter(
        candidate =>
          candidate.max_intent_score >
          0
      )
      .sort(
        (a, b) => {

          if (
            b.hybrid_score !==
            a.hybrid_score
          ) {
            return descending(
              a.hybrid_score,
              b.hybrid_score
            );
          }


          return descending(
            a.candidate_semantic,
            b.candidate_semantic
          );
        }
      );
  }


  /* ----------------------------------------------------------
     GENERAL / RESOURCE / OTHER

     Exact general_score:

       hybrid_score              * .70
       primary_anchor_graph      * .20
       primary_relationship_role * .10

     Note that R's final else branch applies to "general" and
     any intent without an explicit branch, including resource.
     ---------------------------------------------------------- */

  return candidates
    .map(
      candidate => ({
        ...candidate,

        general_score:
          candidate.hybrid_score *
            0.70 +

          candidate.primary_anchor_graph *
            0.20 +

          candidate.primary_relationship_role *
            0.10
      })
    )
    .sort(
      (a, b) =>
        descending(
          a.general_score ?? 0,
          b.general_score ?? 0
        )
    );
}


/* ============================================================
   RETRIEVE HYBRID

   Production equivalent of retrieve_hybrid_v25e().
   ============================================================ */

export async function retrieveHybrid(
  input: HybridRetrievalInput
): Promise<HybridCandidate[]> {

  const query =
    input.query
      .replace(/\s+/g, " ")
      .trim();


  if (!query) {
    throw new Error(
      "Cannot perform Ethos hybrid retrieval on an empty query."
    );
  }


  const n =
    input.n ??
    ethosConfig.retrievalN;


  const seedK =
    input.seedK ??
    ethosConfig.semanticSeedK;


  const nPerAnchor =
    input.nPerAnchor ??
    ethosConfig.graphResultsPerAnchor;


  const contextBoost =
    input.contextBoost ??
    ethosConfig.contextBoost;


  const month =
    input.month ?? null;


  /* ==========================================================
     1. SEMANTIC ANCHORS

     retrieve_semantic_anchors()
     ========================================================== */

  const anchors =
    await retrieveSemanticAnchors({
      query,
      seedK
    });


  if (
    anchors.length === 0
  ) {
    return [];
  }


  /* ==========================================================
     2. PRIMARY RELATIONSHIP ROLE
     ========================================================== */

  const primaryRelationshipScores =
    await getPrimaryRelationshipScores(
      anchors[0].node_id
    );


  /* ==========================================================
     3. GRAPH RETRIEVAL

     retrieve_from_anchors()
     ========================================================== */

  const graphResults =
    await retrieveFromAnchors({
      anchors,
      intent:
        input.intent,
      nPerAnchor
    });


  /* ==========================================================
     4. GRAPH CANDIDATE AGGREGATION
     ========================================================== */

  const candidateMap =
    aggregateGraphCandidates(
      graphResults
    );


  /* ==========================================================
     5. INCLUDE SEMANTIC ANCHORS THEMSELVES
     ========================================================== */

  await addAnchorCandidates(
    candidateMap,
    anchors,
    input.intent
  );


  /* ==========================================================
     6. PRIMARY RELATIONSHIP ROLE
     ========================================================== */

  applyPrimaryRelationshipScores(
    candidateMap,
    primaryRelationshipScores
  );


  /* ==========================================================
     7. VIRTUE MONTH CONTEXT

     generate_hybrid_candidates_v25c()
     ========================================================== */

  await applyVirtueMonthContext(
    candidateMap,
    input.intent,
    month,
    nPerAnchor
  );


  /* ==========================================================
     8. CANDIDATE SEMANTIC

     get_candidate_semantic()
     ========================================================== */

  const candidates =
    [...candidateMap.values()];


  const semanticScores =
    await getCandidateSemantic(
      query,
      candidates.map(
        candidate =>
          candidate.candidate
      )
    );


  /* ==========================================================
     9. BASE HYBRID SCORES
     ========================================================== */

  const scoredCandidates =
    calculateHybridScores(
      candidates,
      semanticScores
    );


  /* ==========================================================
     10. INTENT-SPECIFIC RANKING
     ========================================================== */

  const ranked =
    await rankHybridCandidates(
      scoredCandidates,
      input.intent,
      month,
      contextBoost
    );


  /* ==========================================================
     11. R slice_head(..., n = n)
     ========================================================== */

  return ranked.slice(
    0,
    n
  );
}


export default retrieveHybrid;
