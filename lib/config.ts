
// lib/config.ts

import type {
  EthosConfig,
  EthosIntent
} from "./types";


/* ============================================================
   ETHOS PRODUCTION CONFIGURATION
   ============================================================

   This file is the single source of truth for fixed Ethos
   production parameters.

   IMPORTANT:

   Values labeled VALIDATED were part of the frozen Grade 8
   v2.7a retrieval system or the validated free-text pipeline.

   Values labeled PRODUCTION CONTROL govern application behavior
   but should not be represented as parameters validated by the
   Grade 8 benchmark.

   Do not hard-code these values elsewhere in the application.
   ============================================================ */


/* ============================================================
   ALLOWED INTENTS
   ============================================================ */

export const ETHOS_ALLOWED_INTENTS: EthosIntent[] = [
  "general",
  "doctrine",
  "scripture",
  "saint",
  "virtue",
  "standards",
  "activity",
  "discussion",
  "family",
  "teacher_reading",
  "primary_source",
  "resource"
];


/* ============================================================
   CONTEXT-SENSITIVE INTENTS
   ============================================================

   The frozen v2.7a context policy applied the explicit context
   boost to family and discussion retrieval.
   ============================================================ */

export const ETHOS_CONTEXT_INTENTS: EthosIntent[] = [
  "family",
  "discussion"
];


/* ============================================================
   MAIN CONFIGURATION
   ============================================================ */

export const ethosConfig: EthosConfig = {

  /* ----------------------------------------------------------
     SYSTEM VERSION
     ---------------------------------------------------------- */

  /**
   * VALIDATED
   *
   * Frozen retrieval algorithm used for the Grade 8
   * 213-query validation.
   */
  retrievalVersion: "v2.7a",


  /* ----------------------------------------------------------
     EMBEDDINGS
     ---------------------------------------------------------- */

  /**
   * VALIDATED
   *
   * Embedding model used to generate the frozen Grade 8
   * anchor embeddings.
   */
  embeddingModel: "text-embedding-3-small",


  /* ----------------------------------------------------------
     SEMANTIC RETRIEVAL
     ---------------------------------------------------------- */

  /**
   * VALIDATED
   *
   * Number of semantic seed nodes used as graph anchors.
   */
  semanticSeedK: 5,


  /* ----------------------------------------------------------
     GRAPH RETRIEVAL
     ---------------------------------------------------------- */

  /**
   * VALIDATED
   *
   * Maximum graph results considered per semantic anchor.
   */
  graphResultsPerAnchor: 20,


  /* ----------------------------------------------------------
     CONTEXT
     ---------------------------------------------------------- */

  /**
   * VALIDATED
   *
   * Frozen month/context boost.
   */
  contextBoost: 0.045,

  /**
   * VALIDATED
   *
   * Identifier for the current context policy.
   */
  contextPolicy: "context_v0.1",

  /**
   * VALIDATED
   *
   * Intents receiving explicit context treatment under
   * context_v0.1.
   */
  contextIntents: ETHOS_CONTEXT_INTENTS,


  /* ----------------------------------------------------------
     RESULT COUNTS
     ---------------------------------------------------------- */

  /**
   * VALIDATED
   *
   * Number of ranked results returned by the canonical
   * retrieval function.
   */
  retrievalN: 10,

  /**
   * PRODUCTION PIPELINE
   *
   * Number of top retrieval results supplied to the synthesis
   * layer as evidence.
   */
  evidenceN: 6,


  /* ----------------------------------------------------------
     GRADE
     ---------------------------------------------------------- */

  /**
   * VALIDATED
   *
   * Grade 8 is the first production-supported grade.
   */
  defaultGrade: 8,


  /* ----------------------------------------------------------
     INTENTS
     ---------------------------------------------------------- */

  allowedIntents: ETHOS_ALLOWED_INTENTS,


  /* ----------------------------------------------------------
     MODELS
     ---------------------------------------------------------- */

  /**
   * These identify the models used by the current free-text
   * implementation.
   *
   * Changing a model should be treated as a versioned
   * production change and regression-tested before release.
   */

  intentModel: "gpt-5.4-mini",

  synthesisModel: "gpt-5.4-mini",

  groundingModel: "gpt-5.4-mini",

  claimAuditModel: "gpt-5.4-mini",

  repairModel: "gpt-5.4-mini",


  /* ----------------------------------------------------------
     PROMPT / QA VERSIONS
     ---------------------------------------------------------- */

  intentPromptVersion: "v01",

  synthesisPromptVersion: "v03",

  groundingPromptVersion: "v01",

  claimAuditVersion: "v04",

  repairPromptVersion: "v02",


  /* ----------------------------------------------------------
     INTENT CONFIDENCE
     ---------------------------------------------------------- */

  /**
   * PRODUCTION CONTROL
   *
   * Set to 0 for the initial production port so that we do not
   * introduce a new intent-confidence cutoff that was not part
   * of the validated R behavior.
   *
   * We can establish a meaningful cutoff later from empirical
   * production data.
   */
  minimumIntentConfidence: 0,


  /* ----------------------------------------------------------
     LOGGING
     ---------------------------------------------------------- */

  /**
   * PRODUCTION CONTROL
   *
   * Enables application-level query/QA logging.
   *
   * The logging implementation should still determine which
   * fields are actually retained and for how long.
   */
  loggingEnabled: true
};


/* ============================================================
   SAFETY / FALLBACK CONFIGURATION
   ============================================================

   These controls describe production pipeline behavior rather
   than retrieval-model validation parameters.
   ============================================================ */

export const ethosSafetyConfig = {

  /**
   * A final answer may contain zero unsupported propositions.
   */
  maxUnsupportedPropositions: 0,

  /**
   * Attempt one repair before falling back.
   *
   * Avoid unlimited LLM repair loops.
   */
  maxRepairAttempts: 1,

  /**
   * Run the atomic claim audit on every synthesized answer.
   */
  requireClaimAudit: true,

  /**
   * Re-run the atomic audit after a repair.
   */
  requirePostRepairAudit: true,

  /**
   * Never display an answer that fails final grounding QA.
   */
  blockUnsafeAnswers: true,

  /**
   * If final QA fails, return a safe fallback rather than the
   * unsupported generated answer.
   */
  useSafeFallback: true,

  /**
   * Do not expose retrieval scores, graph scores, evidence IDs,
   * QA reasoning, or other internal engine details to teachers.
   */
  exposeInternalDiagnostics: false

} as const;


/* ============================================================
   FALLBACK MESSAGES
   ============================================================ */

export const ethosFallbackMessages = {

  groundingFailure:
    "Ethos found relevant material, but could not produce a sufficiently grounded answer from the available evidence. Try asking the question in a more specific way.",

  noEvidence:
    "Ethos could not find enough relevant material in the current curriculum database to answer this question reliably.",

  retrievalFailure:
    "Ethos was unable to complete the search. Please try again.",

  systemError:
    "Ethos encountered an unexpected problem. Please try again."

} as const;


/* ============================================================
   LOGGING CONTROLS
   ============================================================ */

export const ethosLoggingConfig = {

  /**
   * Master application logging switch.
   */
  enabled: ethosConfig.loggingEnabled,

  /**
   * Log basic query metadata.
   */
  logQueries: true,

  /**
   * Log retrieval results for debugging and evaluation.
   */
  logRetrieval: true,

  /**
   * Log QA outcomes.
   */
  logQA: true,

  /**
   * Log teacher feedback.
   */
  logFeedback: true,

  /**
   * Do not log embeddings.
   *
   * They are large and unnecessary for normal diagnostics.
   */
  logEmbeddings: false,

  /**
   * Do not log API keys, authorization headers, database
   * credentials, or other application secrets.
   */
  logSecrets: false

} as const;


/* ============================================================
   VERSION INFORMATION
   ============================================================ */

export const ethosVersion = {

  appVersion: "0.1.0",

  dataVersion: "grade8-v01",

  retrievalVersion: ethosConfig.retrievalVersion,

  contextPolicy: ethosConfig.contextPolicy,

  intentPromptVersion: ethosConfig.intentPromptVersion,

  synthesisPromptVersion: ethosConfig.synthesisPromptVersion,

  groundingPromptVersion: ethosConfig.groundingPromptVersion,

  claimAuditVersion: ethosConfig.claimAuditVersion,

  repairPromptVersion: ethosConfig.repairPromptVersion

} as const;
