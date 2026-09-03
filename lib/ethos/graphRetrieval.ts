// lib/ethos/graphRetrieval.ts

import { db } from "../db";
import { ethosConfig } from "../config";

import type {
  SemanticAnchor
} from "./semanticRetrieval";


/* ============================================================
   ETHOS GRAPH RETRIEVAL

   Expands the semantic anchors across the frozen Ethos
   knowledge graph.

   Semantic anchors
        ↓
   outgoing + incoming edges
        ↓
   neighboring nodes
        ↓
   graph candidate features

   IMPORTANT:
   This file performs GRAPH EXPANSION.

   It deliberately does NOT invent the final v2.7a graph or
   hybrid scoring formula.

   Those calculations belong in hybridRetrieval.ts and should
   be ported directly from the validated R implementation.
   ============================================================ */


/* ============================================================
   INPUT
   ============================================================ */

export interface GraphRetrievalInput {
  anchors: SemanticAnchor[];

  grade?: number;

  month?: string | null;

  nPerAnchor?: number;
}


/* ============================================================
   RELATIONSHIP DIRECTION
   ============================================================ */

export type GraphDirection =
  | "outgoing"
  | "incoming";


/* ============================================================
   ONE ANCHOR → CANDIDATE CONTRIBUTION
   ============================================================ */

export interface GraphContribution {
  anchor_node_id: string;

  anchor_title: string;

  anchor_rank: number;

  anchor_semantic_similarity: number;

  candidate_node_id: string;

  candidate_title: string;

  candidate_node_type: string;

  edge_id: string;

  relationship_type: string;

  direction: GraphDirection;

  alignment_strength: number;

  edge_grade: number | null;

  edge_month: string | null;

  rationale: string | null;

  assertion_authority: string | null;
}


/* ============================================================
   AGGREGATED GRAPH CANDIDATE
   ============================================================ */

export interface GraphCandidate {
  candidate: string;

  title: string;

  node_type: string;

  anchor_hits: number;

  best_anchor_rank: number;

  max_alignment_strength: number;

  mean_alignment_strength: number;

  max_anchor_semantic: number;

  primary_anchor_graph: string;

  primary_relationship_role: string;

  contributions: GraphContribution[];
}


/* ============================================================
   NORMALIZE N PER ANCHOR
   ============================================================ */

function normalizeNPerAnchor(
  value?: number
): number {

  const n =
    value ??
    ethosConfig.graphResultsPerAnchor;


  if (
    !Number.isInteger(n) ||
    n < 1
  ) {
    throw new Error(
      "graphResultsPerAnchor must be a positive integer."
    );
  }


  return n;
}


/* ============================================================
   GRADE MATCHING

   Edge.grade is nullable.

   A null grade means the relationship is not restricted to
   one specific grade.
   ============================================================ */

function matchesGrade(
  edgeGrade: number | null,
  requestedGrade?: number
): boolean {

  if (
    requestedGrade === undefined
  ) {
    return true;
  }


  return (
    edgeGrade === null ||
    edgeGrade === requestedGrade
  );
}


/* ============================================================
   MONTH MATCHING

   We do NOT hard-filter null month relationships.

   A null edge month represents a relationship that is not
   limited to a specific instructional month.
   ============================================================ */

function matchesMonth(
  edgeMonth: string | null,
  requestedMonth?: string | null
): boolean {

  if (!requestedMonth) {
    return true;
  }


  if (!edgeMonth) {
    return true;
  }


  return (
    edgeMonth.toLowerCase() ===
    requestedMonth.toLowerCase()
  );
}


/* ============================================================
   EXPAND ONE ANCHOR
   ============================================================ */

async function expandAnchor(
  anchor: SemanticAnchor,
  grade: number | undefined,
  month: string | null | undefined,
  nPerAnchor: number
): Promise<GraphContribution[]> {

  /*
   * Fetch both directions.
   *
   * Example:
   *
   * TOPIC_INDUSTRIALIZATION
   *     --RESPONDS_TO-->
   * DOC_RERUM_NOVARUM
   *
   * We also want to discover useful relationships when the
   * semantic anchor happens to be on the "to" side of an edge.
   */

  const [
    outgoing,
    incoming
  ] = await Promise.all([

    db.edge.findMany({
      where: {
        from_node:
          anchor.node_id
      },

      include: {
        to: true
      }
    }),

    db.edge.findMany({
      where: {
        to_node:
          anchor.node_id
      },

      include: {
        from: true
      }
    })
  ]);


  /* ----------------------------------------------------------
     OUTGOING CONTRIBUTIONS
     ---------------------------------------------------------- */

  const outgoingContributions:
    GraphContribution[] =
    outgoing
      .filter(
        edge =>
          matchesGrade(
            edge.grade,
            grade
          ) &&
          matchesMonth(
            edge.month,
            month
          )
      )
      .map(
        edge => ({
          anchor_node_id:
            anchor.node_id,

          anchor_title:
            anchor.title,

          anchor_rank:
            anchor.semantic_rank,

          anchor_semantic_similarity:
            anchor.similarity,

          candidate_node_id:
            edge.to.node_id,

          candidate_title:
            edge.to.title,

          candidate_node_type:
            edge.to.node_type,

          edge_id:
            edge.edge_id,

          relationship_type:
            edge.relationship_type,

          direction:
            "outgoing" as const,

          alignment_strength:
            edge.alignment_strength,

          edge_grade:
            edge.grade,

          edge_month:
            edge.month,

          rationale:
            edge.rationale,

          assertion_authority:
            edge.assertion_authority
        })
      );


  /* ----------------------------------------------------------
     INCOMING CONTRIBUTIONS
     ---------------------------------------------------------- */

  const incomingContributions:
    GraphContribution[] =
    incoming
      .filter(
        edge =>
          matchesGrade(
            edge.grade,
            grade
          ) &&
          matchesMonth(
            edge.month,
            month
          )
      )
      .map(
        edge => ({
          anchor_node_id:
            anchor.node_id,

          anchor_title:
            anchor.title,

          anchor_rank:
            anchor.semantic_rank,

          anchor_semantic_similarity:
            anchor.similarity,

          candidate_node_id:
            edge.from.node_id,

          candidate_title:
            edge.from.title,

          candidate_node_type:
            edge.from.node_type,

          edge_id:
            edge.edge_id,

          relationship_type:
            edge.relationship_type,

          direction:
            "incoming" as const,

          alignment_strength:
            edge.alignment_strength,

          edge_grade:
            edge.grade,

          edge_month:
            edge.month,

          rationale:
            edge.rationale,

          assertion_authority:
            edge.assertion_authority
        })
      );


  /* ----------------------------------------------------------
     COMBINE + PRIORITIZE

     This is NOT the final graph score.

     We simply use existing graph metadata to limit expansion
     to nPerAnchor candidates.

     Stronger explicitly curated alignments come first.
     Semantic anchor similarity is used only as a stable
     secondary ordering feature.
     ---------------------------------------------------------- */

  return [
    ...outgoingContributions,
    ...incomingContributions
  ]
    .filter(
      contribution =>
        contribution.candidate_node_id !==
        anchor.node_id
    )
    .sort(
      (a, b) => {

        if (
          b.alignment_strength !==
          a.alignment_strength
        ) {
          return (
            b.alignment_strength -
            a.alignment_strength
          );
        }


        return (
          b.anchor_semantic_similarity -
          a.anchor_semantic_similarity
        );
      }
    )
    .slice(
      0,
      nPerAnchor
    );
}


/* ============================================================
   AGGREGATE CONTRIBUTIONS

   One candidate can be reached from several semantic anchors.

   That information is important to v2.7a.

   For example:

   anchor_hits
   best_anchor_rank
   max_anchor_semantic
   primary_anchor_graph

   are all preserved here.
   ============================================================ */

function aggregateContributions(
  contributions: GraphContribution[]
): GraphCandidate[] {

  const grouped =
    new Map<
      string,
      GraphContribution[]
    >();


  for (
    const contribution of contributions
  ) {

    const existing =
      grouped.get(
        contribution.candidate_node_id
      );


    if (existing) {

      existing.push(
        contribution
      );

    } else {

      grouped.set(
        contribution.candidate_node_id,
        [contribution]
      );
    }
  }


  const candidates:
    GraphCandidate[] = [];


  for (
    const [
      candidateId,
      candidateContributions
    ] of grouped.entries()
  ) {

    const first =
      candidateContributions[0];


    /* --------------------------------------------------------
       DISTINCT ANCHOR HITS
       -------------------------------------------------------- */

    const uniqueAnchors =
      new Set(
        candidateContributions.map(
          item =>
            item.anchor_node_id
        )
      );


    /* --------------------------------------------------------
       BEST ANCHOR RANK
       -------------------------------------------------------- */

    const bestAnchorRank =
      Math.min(
        ...candidateContributions.map(
          item =>
            item.anchor_rank
        )
      );


    /* --------------------------------------------------------
       ALIGNMENT STRENGTH
       -------------------------------------------------------- */

    const strengths =
      candidateContributions.map(
        item =>
          item.alignment_strength
      );


    const maxAlignmentStrength =
      Math.max(
        ...strengths
      );


    const meanAlignmentStrength =
      strengths.reduce(
        (
          total,
          value
        ) =>
          total + value,
        0
      ) /
      strengths.length;


    /* --------------------------------------------------------
       MAX ANCHOR SEMANTIC
       -------------------------------------------------------- */

    const maxAnchorSemantic =
      Math.max(
        ...candidateContributions.map(
          item =>
            item.anchor_semantic_similarity
        )
      );


    /* --------------------------------------------------------
       PRIMARY CONTRIBUTION

       This is only identifying the strongest available graph
       relationship for descriptive purposes.

       It is NOT the final v2.7a graph score.
       -------------------------------------------------------- */

    const primary =
      [...candidateContributions]
        .sort(
          (a, b) => {

            if (
              b.alignment_strength !==
              a.alignment_strength
            ) {
              return (
                b.alignment_strength -
                a.alignment_strength
              );
            }


            if (
              a.anchor_rank !==
              b.anchor_rank
            ) {
              return (
                a.anchor_rank -
                b.anchor_rank
              );
            }


            return (
              b.anchor_semantic_similarity -
              a.anchor_semantic_similarity
            );
          }
        )[0];


    candidates.push({
      candidate:
        candidateId,

      title:
        first.candidate_title,

      node_type:
        first.candidate_node_type,

      anchor_hits:
        uniqueAnchors.size,

      best_anchor_rank:
        bestAnchorRank,

      max_alignment_strength:
        maxAlignmentStrength,

      mean_alignment_strength:
        meanAlignmentStrength,

      max_anchor_semantic:
        maxAnchorSemantic,

      primary_anchor_graph:
        primary.anchor_node_id,

      primary_relationship_role:
        primary.relationship_type,

      contributions:
        candidateContributions
    });
  }


  return candidates;
}


/* ============================================================
   GRAPH RETRIEVAL
   ============================================================ */

export async function retrieveGraph(
  input: GraphRetrievalInput
): Promise<GraphCandidate[]> {

  if (
    !input.anchors ||
    input.anchors.length === 0
  ) {
    return [];
  }


  const nPerAnchor =
    normalizeNPerAnchor(
      input.nPerAnchor
    );


  /* ----------------------------------------------------------
     EXPAND ALL SEMANTIC ANCHORS
     ---------------------------------------------------------- */

  const expanded =
    await Promise.all(
      input.anchors.map(
        anchor =>
          expandAnchor(
            anchor,
            input.grade,
            input.month,
            nPerAnchor
          )
      )
    );


  const contributions =
    expanded.flat();


  /* ----------------------------------------------------------
     AGGREGATE CANDIDATES
     ---------------------------------------------------------- */

  const candidates =
    aggregateContributions(
      contributions
    );


  /* ----------------------------------------------------------
     STABLE PRELIMINARY ORDER

     Again: this is not the validated hybrid score.

     This simply makes graph output deterministic and useful
     for debugging before hybrid scoring.
     ---------------------------------------------------------- */

  return candidates.sort(
    (a, b) => {

      if (
        b.anchor_hits !==
        a.anchor_hits
      ) {
        return (
          b.anchor_hits -
          a.anchor_hits
        );
      }


      if (
        b.max_alignment_strength !==
        a.max_alignment_strength
      ) {
        return (
          b.max_alignment_strength -
          a.max_alignment_strength
        );
      }


      if (
        a.best_anchor_rank !==
        b.best_anchor_rank
      ) {
        return (
          a.best_anchor_rank -
          b.best_anchor_rank
        );
      }


      if (
        b.max_anchor_semantic !==
        a.max_anchor_semantic
      ) {
        return (
          b.max_anchor_semantic -
          a.max_anchor_semantic
        );
      }


      return (
        a.candidate.localeCompare(
          b.candidate
        )
      );
    }
  );
}


export default retrieveGraph;
