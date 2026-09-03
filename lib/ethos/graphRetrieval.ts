// lib/ethos/graphRetrieval.ts

import { db } from "../db";
import { ethosConfig } from "../config";

import type {
  EthosIntent
} from "../types";

import type {
  SemanticAnchor
} from "./semanticRetrieval";


/* ============================================================
   ETHOS GRAPH RETRIEVAL

   Port of the validated R graph logic used by v2.7a.

   This file reproduces:

   - get_two_hop_paths()
   - get_node_authority()
   - rank_graph_results()
   - add_intent_scores()
   - retrieve_by_intent()
   - retrieve_from_anchors()

   IMPORTANT:
   Final cross-candidate hybrid ranking still belongs in
   hybridRetrieval.ts.
   ============================================================ */


/* ============================================================
   TYPES
   ============================================================ */

export interface GraphRetrievalInput {
  anchors: SemanticAnchor[];

  intent: EthosIntent;

  nPerAnchor?: number;
}


export interface GraphResult {
  candidate: string;

  direct_strength: number;

  direct_paths: number;

  two_hop_paths: number;

  strongest_two_hop: number;

  mean_two_hop: number;

  authority_score: number;

  path_bonus: number;

  score: number;

  intent_score: number;

  final_score: number;

  anchor_node: string;

  anchor_rank: number;

  anchor_semantic_score: number;
}


interface EdgeRecord {
  from_node: string;
  to_node: string;
  alignment_strength: number;
}


interface NodeMeta {
  node_id: string;
  node_type: string;
  instructional_use: string[];
  authority_level: string | null;
}


interface CandidateAccumulator {
  directStrengths: number[];
  directPaths: number;
  twoHopStrengths: number[];
}


/* ============================================================
   CONFIG
   ============================================================ */

const MIN_STRENGTH = 1;


/* ============================================================
   AUTHORITY SCORE

   Exact port of get_node_authority()
   ============================================================ */

function scoreAuthority(
  authorityLevel: string | null
): number {

  switch (authorityLevel) {

    case "A1_BIBLICAL":
      return 1;

    case "A2_MAGISTERIAL":
      return 0.9;

    case "A3_ECCLESIAL_STANDARD":
      return 0.8;

    case "A4_VETTED_REFERENCE":
      return 0.65;

    case "A5_LOCAL_RESOURCE":
      return 0.5;

    case "A6_AI_GENERATED":
      return 0.25;

    default:
      return 0;
  }
}


/* ============================================================
   INTENT SCORE

   Exact port of score_intent_match()
   ============================================================ */

export function scoreIntentMatch(
  intent: EthosIntent,
  nodeType: string,
  instructionalUse: string[]
): number {

  const uses =
    instructionalUse ?? [];


  if (
    intent === "saint" &&
    nodeType === "saint"
  ) {
    return 1;
  }


  if (
    intent === "saint" &&
    uses.includes("SAINT_STUDY")
  ) {
    return 0.6;
  }


  if (
    intent === "scripture" &&
    nodeType === "scripture"
  ) {
    return 1;
  }


  if (
    intent === "scripture" &&
    uses.includes("SCRIPTURE_STUDY")
  ) {
    return 0.5;
  }


  if (
    intent === "virtue" &&
    nodeType === "virtue"
  ) {
    return 1;
  }


  if (
    intent === "virtue" &&
    uses.includes("VIRTUE_FORMATION")
  ) {
    return 0.5;
  }


  if (
    intent === "standards" &&
    nodeType === "catholic_standard"
  ) {
    return 1;
  }


  if (
    intent === "activity" &&
    uses.includes("ACTIVITY")
  ) {
    return 1;
  }


  if (
    intent === "activity" &&
    uses.includes("SIMULATION")
  ) {
    return 0.8;
  }


  if (
    intent === "discussion" &&
    nodeType === "essential_question" &&
    uses.includes("SOCRATIC_DISCUSSION")
  ) {
    return 1;
  }


  if (
    intent === "discussion" &&
    uses.includes("SOCRATIC_DISCUSSION")
  ) {
    return 0.5;
  }


  if (
    intent === "family" &&
    (
      nodeType === "essential_question" ||
      nodeType === "instructional_resource"
    ) &&
    uses.includes("FAMILY_DISCUSSION")
  ) {
    return 1;
  }


  if (
    intent === "family" &&
    uses.includes("FAMILY_DISCUSSION")
  ) {
    return 0.4;
  }


  if (
    intent === "primary_source" &&
    uses.includes("PRIMARY_SOURCE")
  ) {
    return 1;
  }


  if (
    intent === "teacher_reading" &&
    uses.includes("TEACHER_READING")
  ) {
    return 1;
  }


  if (
    intent === "doctrine" &&
    (
      nodeType === "church_document" ||
      nodeType === "catechism_teaching"
    )
  ) {
    return 1;
  }


  if (
    intent === "doctrine" &&
    nodeType === "catholic_concept"
  ) {
    return 0.8;
  }


  if (
    intent === "doctrine" &&
    uses.includes("DOCTRINAL_INSTRUCTION")
  ) {
    return 0.5;
  }


  return 0;
}


/* ============================================================
   FETCH GRAPH DATA
   ============================================================ */

async function loadGraphData(): Promise<{
  edges: EdgeRecord[];
  nodes: Map<string, NodeMeta>;
}> {

  const [
    edges,
    nodes
  ] = await Promise.all([

    db.edge.findMany({
      where: {
        alignment_strength: {
          gte: MIN_STRENGTH
        }
      },

      select: {
        from_node: true,
        to_node: true,
        alignment_strength: true
      }
    }),

    db.node.findMany({
      select: {
        node_id: true,
        node_type: true,
        instructional_use: true,
        authority_level: true
      }
    })
  ]);


  const nodeMap =
    new Map<string, NodeMeta>();


  for (const node of nodes) {

    nodeMap.set(
      node.node_id,
      {
        node_id:
          node.node_id,

        node_type:
          node.node_type,

        instructional_use:
          node.instructional_use,

        authority_level:
          node.authority_level
      }
    );
  }


  return {
    edges,
    nodes: nodeMap
  };
}


/* ============================================================
   GRAPH ADJACENCY

   The R implementation makes the graph bidirectional:

   bind_rows(
     from_node -> to_node,
     to_node   -> from_node
   )

   We reproduce that exactly.
   ============================================================ */

function buildAdjacency(
  edges: EdgeRecord[]
): Map<
  string,
  Array<{
    to: string;
    strength: number;
  }>
> {

  const adjacency =
    new Map<
      string,
      Array<{
        to: string;
        strength: number;
      }>
    >();


  function addEdge(
    from: string,
    to: string,
    strength: number
  ): void {

    const existing =
      adjacency.get(from);

    if (existing) {

      existing.push({
        to,
        strength
      });

    } else {

      adjacency.set(
        from,
        [{
          to,
          strength
        }]
      );
    }
  }


  for (const edge of edges) {

    addEdge(
      edge.from_node,
      edge.to_node,
      edge.alignment_strength
    );

    addEdge(
      edge.to_node,
      edge.from_node,
      edge.alignment_strength
    );
  }


  return adjacency;
}


/* ============================================================
   RANK GRAPH RESULTS

   Exact formula from rank_graph_results():

   score =
       direct_strength    * .45
     + strongest_two_hop  * .20
     + mean_two_hop       * .10
     + authority_score    * .15
     + path_bonus         * .10

   where:

   direct_strength =
     max(alignment_strength) / 3

   two-hop path strength =
     (strength1 / 3) * (strength2 / 3)

   path_bonus =
     min((direct_paths + two_hop_paths) / 5, 1)
   ============================================================ */

function rankGraphResults(
  nodeId: string,
  adjacency: Map<
    string,
    Array<{
      to: string;
      strength: number;
    }>
  >,
  nodeMap: Map<string, NodeMeta>
): Omit<
  GraphResult,
  | "intent_score"
  | "final_score"
  | "anchor_node"
  | "anchor_rank"
  | "anchor_semantic_score"
>[] {

  const candidates =
    new Map<
      string,
      CandidateAccumulator
    >();


  function getCandidate(
    candidateId: string
  ): CandidateAccumulator {

    const existing =
      candidates.get(
        candidateId
      );


    if (existing) {
      return existing;
    }


    const created:
      CandidateAccumulator = {

      directStrengths: [],

      directPaths: 0,

      twoHopStrengths: []
    };


    candidates.set(
      candidateId,
      created
    );


    return created;
  }


  /* ----------------------------------------------------------
     DIRECT PATHS
     ---------------------------------------------------------- */

  const directEdges =
    adjacency.get(nodeId) ?? [];


  for (
    const edge of directEdges
  ) {

    const candidate =
      getCandidate(
        edge.to
      );


    candidate.directStrengths.push(
      edge.strength
    );

    candidate.directPaths += 1;
  }


  /* ----------------------------------------------------------
     TWO-HOP PATHS

     Exact R behavior:
     - graph is bidirectional
     - many-to-many paths are preserved
     - hop2 == starting node is removed
     - hop1 and hop2 may otherwise repeat through different
       graph paths
     ---------------------------------------------------------- */

  for (
    const firstHop of directEdges
  ) {

    const secondEdges =
      adjacency.get(
        firstHop.to
      ) ?? [];


    for (
      const secondHop of secondEdges
    ) {

      if (
        secondHop.to === nodeId
      ) {
        continue;
      }


      const pathStrength =
        (
          firstHop.strength / 3
        ) *
        (
          secondHop.strength / 3
        );


      const candidate =
        getCandidate(
          secondHop.to
        );


      candidate
        .twoHopStrengths
        .push(
          pathStrength
        );
    }
  }


  /* ----------------------------------------------------------
     CALCULATE SCORES
     ---------------------------------------------------------- */

  const results:
    Omit<
      GraphResult,
      | "intent_score"
      | "final_score"
      | "anchor_node"
      | "anchor_rank"
      | "anchor_semantic_score"
    >[] = [];


  for (
    const [
      candidateId,
      data
    ] of candidates.entries()
  ) {

    if (
      candidateId === nodeId
    ) {
      continue;
    }


    const directStrength =
      data.directStrengths.length > 0
        ? Math.max(
            ...data.directStrengths
          ) / 3
        : 0;


    const directPaths =
      data.directPaths;


    const twoHopPaths =
      data.twoHopStrengths.length;


    const strongestTwoHop =
      twoHopPaths > 0
        ? Math.max(
            ...data.twoHopStrengths
          )
        : 0;


    const meanTwoHop =
      twoHopPaths > 0
        ? data.twoHopStrengths
            .reduce(
              (
                total,
                value
              ) =>
                total + value,
              0
            ) /
          twoHopPaths
        : 0;


    const node =
      nodeMap.get(
        candidateId
      );


    const authorityScore =
      scoreAuthority(
        node?.authority_level ??
        null
      );


    const pathBonus =
      Math.min(
        (
          directPaths +
          twoHopPaths
        ) / 5,
        1
      );


    const score =
      directStrength * 0.45 +
      strongestTwoHop * 0.20 +
      meanTwoHop * 0.10 +
      authorityScore * 0.15 +
      pathBonus * 0.10;


    results.push({
      candidate:
        candidateId,

      direct_strength:
        directStrength,

      direct_paths:
        directPaths,

      two_hop_paths:
        twoHopPaths,

      strongest_two_hop:
        strongestTwoHop,

      mean_two_hop:
        meanTwoHop,

      authority_score:
        authorityScore,

      path_bonus:
        pathBonus,

      score
    });
  }


  return results.sort(
    (a, b) =>
      b.score - a.score
  );
}


/* ============================================================
   RETRIEVE BY INTENT

   Exact port of retrieve_by_intent():

   final_score = score + intent_score * .2

   IMPORTANT:
   R calculates final_score but does NOT use it downstream as
   the graph score. We preserve it for parity/debugging only.
   ============================================================ */

function retrieveByIntent(
  nodeId: string,
  intent: EthosIntent,
  n: number,
  adjacency: Map<
    string,
    Array<{
      to: string;
      strength: number;
    }>
  >,
  nodeMap: Map<string, NodeMeta>
): Omit<
  GraphResult,
  | "anchor_node"
  | "anchor_rank"
  | "anchor_semantic_score"
>[] {

  const results =
    rankGraphResults(
      nodeId,
      adjacency,
      nodeMap
    );


  if (
    results.length === 0
  ) {
    return [];
  }


  const scored =
    results.map(
      result => {

        const node =
          nodeMap.get(
            result.candidate
          );


        const intentScore =
          scoreIntentMatch(
            intent,
            node?.node_type ?? "",
            node?.instructional_use ?? []
          );


        return {
          ...result,

          intent_score:
            intentScore,

          final_score:
            result.score +
            intentScore * 0.2
        };
      }
    );


  if (
    intent === "general"
  ) {

    return scored
      .sort(
        (a, b) =>
          b.score - a.score
      )
      .slice(
        0,
        n
      );
  }


  return scored
    .sort(
      (a, b) => {

        const aMatch =
          a.intent_score > 0
            ? 1
            : 0;

        const bMatch =
          b.intent_score > 0
            ? 1
            : 0;


        if (
          bMatch !== aMatch
        ) {
          return (
            bMatch -
            aMatch
          );
        }


        if (
          b.intent_score !==
          a.intent_score
        ) {
          return (
            b.intent_score -
            a.intent_score
          );
        }


        return (
          b.score -
          a.score
        );
      }
    )
    .slice(
      0,
      n
    );
}


/* ============================================================
   RETRIEVE FROM ANCHORS

   Exact conceptual port of retrieve_from_anchors().
   ============================================================ */

export async function retrieveFromAnchors(
  input: GraphRetrievalInput
): Promise<GraphResult[]> {

  if (
    !input.anchors ||
    input.anchors.length === 0
  ) {
    return [];
  }


  const nPerAnchor =
    input.nPerAnchor ??
    ethosConfig.graphResultsPerAnchor;


  if (
    !Number.isInteger(
      nPerAnchor
    ) ||
    nPerAnchor < 1
  ) {
    throw new Error(
      "graphResultsPerAnchor must be a positive integer."
    );
  }


  const {
    edges,
    nodes
  } =
    await loadGraphData();


  const adjacency =
    buildAdjacency(
      edges
    );


  const allResults:
    GraphResult[] = [];


  for (
    let i = 0;
    i < input.anchors.length;
    i += 1
  ) {

    const anchor =
      input.anchors[i];


    const graphResults =
      retrieveByIntent(
        anchor.node_id,
        input.intent,
        nPerAnchor,
        adjacency,
        nodes
      );


    for (
      const result of graphResults
    ) {

      allResults.push({
        ...result,

        anchor_node:
          anchor.node_id,

        anchor_rank:
          i + 1,

        anchor_semantic_score:
          anchor.similarity
      });
    }
  }


  return allResults;
}


/* ============================================================
   DEFAULT EXPORT
   ============================================================ */

export default retrieveFromAnchors;
