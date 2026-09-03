// lib/types.ts

/**
 * Ethos Production Types
 *
 * Shared TypeScript types for the Ethos application.
 *
 * These interfaces define the stable contracts used by:
 * - database records
 * - retrieval
 * - evidence construction
 * - synthesis
 * - QA / claim auditing
 * - API routes
 * - UI components
 * - regression testing
 *
 * Keep application-wide types here rather than redefining them
 * inside individual modules.
 */


/* ============================================================
   CORE CONTROLLED VOCABULARIES
   ============================================================ */

export type EthosNodeType =
  | "church_document"
  | "catechism_teaching"
  | "catholic_concept"
  | "catholic_standard"
  | "church_history"
  | "catholic_figure"
  | "saint"
  | "scripture"
  | "virtue"
  | "essential_question"
  | "instructional_resource"
  | "academic_topic"
  | "historical_period"
  | "literary_work"
  | "curriculum_unit";


export type EthosRelationshipType =
  | "TEACHES"
  | "REQUIRES_KNOWLEDGE_OF"
  | "EXEMPLIFIES"
  | "DOCTRINALLY_ALIGNS_WITH"
  | "HISTORICALLY_ALIGNS_WITH"
  | "SUPPORTED_BY"
  | "GROUNDED_IN_SCRIPTURE"
  | "EXTENDS"
  | "PROMPTS_INQUIRY_INTO"
  | "STANDARDS_ALIGNS_WITH"
  | "RESPONDS_TO"
  | "CONNECTS_TO"
  | "SAINT_ALIGNS_WITH"
  | "VIRTUE_ALIGNS_WITH"
  | "SCRIPTURE_ALIGNS_WITH"
  | "FAMILY_ALIGNS_WITH"
  | "TEACHER_READING_ALIGNS_WITH";


export type EthosAuthorityLevel =
  | "A1_BIBLICAL"
  | "A2_MAGISTERIAL"
  | "A3_ECCLESIAL_STANDARD"
  | "A4_VETTED_REFERENCE"
  | "A5_LOCAL_RESOURCE"
  | "A6_AI_GENERATED";


export type EthosInstructionalUse =
  | "CORE_INSTRUCTION"
  | "DOCTRINAL_INSTRUCTION"
  | "SCRIPTURE_STUDY"
  | "PRIMARY_SOURCE"
  | "STUDENT_READING"
  | "TEACHER_READING"
  | "SOCRATIC_DISCUSSION"
  | "WRITING_PROMPT"
  | "FAMILY_DISCUSSION"
  | "SIMULATION"
  | "ACTIVITY"
  | "ASSESSMENT"
  | "VIRTUE_FORMATION"
  | "CHURCH_HISTORY"
  | "CROSS_CURRICULAR_CONNECTION"
  | "AI_RETRIEVAL_CONTEXT";


export type EthosGroundingType =
  | "direct"
  | "instructional_synthesis"
  | "unsupported";


export type EthosQAStatus =
  | "PASS"
  | "REVISED"
  | "FAIL";


/* ============================================================
   INTENTS
   ============================================================ */

export type EthosIntent =
  | "general"
  | "doctrine"
  | "scripture"
  | "saint"
  | "virtue"
  | "standards"
  | "activity"
  | "discussion"
  | "family"
  | "teacher_reading"
  | "primary_source"
  | "resource";


export interface EthosIntentClassification {
  intent: EthosIntent;
  confidence: number;
}


/* ============================================================
   CORE KNOWLEDGE GRAPH OBJECTS
   ============================================================ */

export interface EthosNode {
  node_id: string;

  node_type: EthosNodeType;

  title: string;

  description: string | null;

  grade_min: number | null;

  grade_max: number | null;

  ethos_month: string | null;

  authority_level: EthosAuthorityLevel | null;

  /**
   * A node may support multiple instructional uses.
   *
   * In the original R data this may have been stored as
   * a semicolon-separated value. In production we should
   * normalize it to an array.
   */
  instructional_use: EthosInstructionalUse[];

  source_name: string | null;

  source_locator: string | null;

  source_url: string | null;

  provenance_type: string | null;

  review_status: string | null;

  display_ready: boolean;

  notes: string | null;
}


export interface EthosEdge {
  edge_id: string;

  from_node: string;

  relationship_type: EthosRelationshipType;

  to_node: string;

  /**
   * 1 = weak
   * 2 = moderate
   * 3 = strong
   */
  alignment_strength: 1 | 2 | 3;

  grade: number | null;

  month: string | null;

  rationale: string | null;

  source_basis: string | null;

  source_name: string | null;

  source_locator: string | null;

  source_url: string | null;

  assertion_authority: string | null;

  provenance_type: string | null;

  review_status: string | null;
}


export interface EthosEmbedding {
  node_id: string;

  embedding: number[];

  embedding_model: string;

  /**
   * Optional because historical exported embeddings may not
   * currently contain timestamps.
   */
  created_at?: string;
}


/* ============================================================
   CONFIGURATION
   ============================================================ */

export interface EthosConfig {
  retrievalVersion: string;

  embeddingModel: string;

  semanticSeedK: number;

  graphResultsPerAnchor: number;

  contextBoost: number;

  retrievalN: number;

  evidenceN: number;

  defaultGrade: number;

  allowedIntents: EthosIntent[];

  intentModel: string;

  synthesisModel: string;

  groundingModel?: string;

  claimAuditModel: string;

  repairModel?: string;

  intentPromptVersion: string;

  synthesisPromptVersion: string;

  groundingPromptVersion?: string;

  claimAuditVersion: string;

  repairPromptVersion?: string;

  /**
   * If classification confidence falls below this value,
   * the system may fall back to general intent or another
   * safe handling path.
   */
  minimumIntentConfidence: number;

  /**
   * Current context policy identifier.
   * Example: "context_v0.1"
   */
  contextPolicy: string;

  /**
   * Intents for which month/context boosting should be
   * applied more strongly.
   */
  contextIntents: EthosIntent[];

  /**
   * Whether application-level query logging is enabled.
   */
  loggingEnabled: boolean;
}


/* ============================================================
   RETRIEVAL / EVIDENCE OBJECTS
   ============================================================ */

export interface EthosEvidence {
  /**
   * Temporary evidence identifier used during synthesis.
   *
   * Example:
   * E1
   * E2
   *
   * This must NEVER appear in the final teacher-facing answer.
   */
  evidence_id: string;

  rank: number;

  candidate: string;

  title: string;

  node_type: EthosNodeType;

  description: string | null;

  instructional_use: EthosInstructionalUse[];

  source_name: string | null;

  source_locator: string | null;

  source_url: string | null;

  /**
   * Retrieval metrics are useful internally but should
   * not be exposed in the teacher UI.
   */
  anchor_hits?: number;

  best_anchor_rank?: number | null;

  max_graph_score?: number | null;

  mean_graph_score?: number | null;

  max_intent_score?: number | null;

  max_anchor_semantic?: number | null;

  context_graph_score?: number | null;

  candidate_semantic?: number | null;

  anchor_hit_score?: number | null;

  anchor_rank_score?: number | null;

  hybrid_score?: number | null;

  contextual_semantic?: number | null;

  general_score?: number | null;
}


/* ============================================================
   TEACHER-FACING SOURCES
   ============================================================ */

export interface EthosSource {
  nodeId: string;

  title: string;

  type: EthosNodeType;

  description: string | null;

  sourceName: string | null;

  sourceLocator: string | null;

  sourceUrl: string | null;
}


/* ============================================================
   CLAIM AUDITING
   ============================================================ */

export interface EthosClaim {
  /**
   * Full sentence or factual claim extracted from an answer.
   */
  claim: string;

  /**
   * Section in which the claim appeared.
   *
   * Example:
   * "Direct Answer"
   * "Why It Fits"
   */
  section: string;

  /**
   * Temporary evidence IDs cited by the synthesis model.
   *
   * Example:
   * ["E1", "E3"]
   */
  evidence_ids: string[];
}


export interface EthosPropositionAudit {
  proposition: string;

  grounding_type: EthosGroundingType;

  reason: string;
}


export interface EthosClaimAudit {
  claim: string;

  section: string;

  evidence_ids: string[];

  /**
   * TRUE only when every proposition is either:
   * - direct
   * - instructional_synthesis
   */
  supported: boolean;

  propositions: EthosPropositionAudit[];
}


/* ============================================================
   QA RESULT
   ============================================================ */

export interface EthosQAResult {
  /**
   * Final pipeline status.
   */
  status: EthosQAStatus;

  /**
   * Broad-grounding issues discovered before atomic auditing.
   */
  issues: string[];

  /**
   * Number of unsupported claims before repair.
   */
  initialFailed: number;

  /**
   * Number of unsupported claims after repair and re-audit.
   */
  finalFailed: number;

  /**
   * Whether the repair layer was invoked.
   */
  repairAttempted: boolean;

  /**
   * Full atomic audit results.
   *
   * Intended primarily for logging/admin use.
   */
  claimAudits: EthosClaimAudit[];

  /**
   * Final safety decision.
   */
  safeToDisplay: boolean;
}


/* ============================================================
   QUERY API
   ============================================================ */

export interface EthosQueryRequest {
  query: string;

  /**
   * Grade defaults to ethosConfig.defaultGrade.
   */
  grade?: number;

  /**
   * Optional instructional month.
   *
   * Examples:
   * "October"
   * "November"
   */
  month?: string | null;

  /**
   * Optional forced intent.
   *
   * When omitted, Ethos classifies intent automatically.
   */
  intent?: EthosIntent | null;
}


export interface EthosQueryResponse {
  query: string;

  grade: number;

  month: string | null;

  intent: EthosIntent;

  intentConfidence: number;

  /**
   * Final cleaned teacher-facing response.
   *
   * No E1 / E2 evidence identifiers should remain here.
   */
  answer: string;

  sources: EthosSource[];

  safeToDisplay: boolean;

  qa: EthosQAResult;

  /**
   * Optional identifier for logging and teacher feedback.
   */
  queryId?: string;

  /**
   * Optional total processing time.
   */
  latencyMs?: number;
}


/* ============================================================
   GOLDEN DEMO / REGRESSION TESTS
   ============================================================ */

export interface GoldenDemoCase {
  query_id: string;

  demo_order: number;

  query: string;

  intent: EthosIntent;

  month: string | null;

  /**
   * Node IDs that should be recovered by retrieval.
   */
  expected_candidates: string[];

  /**
   * Optional node IDs expected very near the top.
   */
  expected_top_candidates?: string[];

  /**
   * Whether the case is expected to produce a safe answer.
   */
  expected_safe_to_display: boolean;

  notes?: string | null;
}


/* ============================================================
   VALIDATION CASE
   ============================================================ */

export interface ValidationCase {
  query_id: string;

  query: string;

  intent: EthosIntent;

  month: string | null;

  grade: number;

  /**
   * Required / gold node IDs.
   */
  must_retrieve: string[];

  /**
   * Optional acceptable supporting node IDs.
   */
  relevant_nodes?: string[];

  /**
   * Optional expected invalid or bad nodes.
   */
  bad_nodes?: string[];

  recall_at_5?: number;

  recall_at_10?: number;

  precision_at_5?: number;

  relevant_coverage_at_5?: number;

  reciprocal_rank?: number;

  bad_top_5?: number;
}


/* ============================================================
   QUERY LOGGING
   ============================================================ */

export interface QueryLog {
  queryId: string;

  timestamp: string;

  query: string;

  grade: number;

  month: string | null;

  intent: EthosIntent;

  intentConfidence: number;

  safeToDisplay: boolean;

  initialFailed: number;

  finalFailed: number;

  latencyMs: number | null;

  retrievalVersion: string;

  synthesisPromptVersion: string;

  claimAuditVersion: string;

  /**
   * Optional session identifier.
   *
   * Avoid storing personally identifiable teacher information
   * unless we deliberately decide to support user accounts later.
   */
  sessionId?: string | null;
}


/* ============================================================
   TEACHER FEEDBACK
   ============================================================ */

export type EthosFeedbackRating =
  | "helpful"
  | "not_helpful";


export interface FeedbackRecord {
  feedbackId: string;

  queryId: string;

  timestamp: string;

  rating: EthosFeedbackRating;

  comment?: string | null;

  /**
   * Optional anonymous session reference.
   */
  sessionId?: string | null;
}
