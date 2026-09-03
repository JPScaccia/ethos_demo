// lib/ethos/runEthosQuery.ts

import type {
  EthosEvidence,
  EthosIntent,
  EthosQueryRequest,
  EthosQueryResponse,
  EthosSource
} from "../types";

import { ethosConfig, ethosFallbackMessages, ethosSafetyConfig } from "../config";

import { classifyIntent } from "./classifyIntent";
import { retrieveHybrid } from "./hybridRetrieval";
import { buildEvidence } from "./buildEvidence";
import { synthesizeAnswer } from "./synthesize";
import { auditGrounding } from "./auditGrounding";
import { auditClaims } from "./auditClaims";
import { repairAnswer } from "./repairAnswer";
import { cleanAnswer } from "./cleanAnswer";
import { buildSources } from "./buildSources";


/* ============================================================
   ETHOS MASTER QUERY PIPELINE

   This is the single production entry point for an Ethos query.

   Teacher query
        ↓
   Intent classification
        ↓
   Hybrid retrieval
        ↓
   Evidence package
        ↓
   Grounded synthesis
        ↓
   Broad grounding QA
        ↓
   Atomic proposition audit
        ↓
   Repair when necessary
        ↓
   Re-audit
        ↓
   Clean answer
        ↓
   Teacher-facing sources

   IMPORTANT:
   The UI should call this function rather than individual
   retrieval, synthesis, or QA functions.
   ============================================================ */


/* ============================================================
   INTERNAL PIPELINE TYPES
   ============================================================ */

interface PipelineQa {
  groundingPassed: boolean;
  claimAuditPassed: boolean;
  repairAttempted: boolean;
  repairSucceeded: boolean;
  unsupportedPropositions: number;
}


interface PipelineResult {
  answer: string;
  sources: EthosSource[];
  evidence: EthosEvidence[];
  safeToDisplay: boolean;
  qa: PipelineQa;
}


/* ============================================================
   NORMALIZE QUERY
   ============================================================ */

function normalizeQuery(query: string): string {

  return query
    .replace(/\s+/g, " ")
    .trim();
}


/* ============================================================
   VALIDATE REQUEST
   ============================================================ */

function validateRequest(
  request: EthosQueryRequest
): void {

  const query =
    normalizeQuery(request.query);

  if (!query) {
    throw new Error(
      "Ethos requires a non-empty query."
    );
  }

  if (
    request.grade !== undefined &&
    (
      !Number.isInteger(request.grade) ||
      request.grade < 1 ||
      request.grade > 12
    )
  ) {
    throw new Error(
      "Ethos grade must be an integer between 1 and 12."
    );
  }

  if (
    request.intent &&
    !ethosConfig.allowedIntents.includes(
      request.intent
    )
  ) {
    throw new Error(
      `Unsupported Ethos intent: ${request.intent}`
    );
  }
}


/* ============================================================
   SAFE FALLBACK
   ============================================================ */

function buildSafeFallback(
  options: {
    query: string;
    grade: number;
    month: string | null;
    intent: EthosIntent;
    intentConfidence: number;
    sources?: EthosSource[];
    qa?: Partial<PipelineQa>;
  }
): EthosQueryResponse {

  return {
    query: options.query,

    grade: options.grade,

    month: options.month,

    intent: options.intent,

    intentConfidence:
      options.intentConfidence,

    answer:
      ethosFallbackMessages.groundingFailure,

    sources:
      options.sources ?? [],

    safeToDisplay: false,

    qa: {
      groundingPassed:
        options.qa?.groundingPassed ??
        false,

      claimAuditPassed:
        options.qa?.claimAuditPassed ??
        false,

      repairAttempted:
        options.qa?.repairAttempted ??
        false,

      repairSucceeded:
        options.qa?.repairSucceeded ??
        false,

      unsupportedPropositions:
        options.qa?.unsupportedPropositions ??
        0
    }
  } as EthosQueryResponse;
}


/* ============================================================
   RUN QA PIPELINE
   ============================================================ */

async function runQaPipeline(
  answer: string,
  evidence: EthosEvidence[],
  query: string,
  intent: EthosIntent
): Promise<{
  answer: string;
  groundingPassed: boolean;
  claimAuditPassed: boolean;
  unsupportedPropositions: number;
  repairAttempted: boolean;
  repairSucceeded: boolean;
}> {

  /* ----------------------------------------------------------
     BROAD GROUNDING CHECK
     ---------------------------------------------------------- */

  const grounding =
    await auditGrounding({
      query,
      intent,
      answer,
      evidence
    });


  /* ----------------------------------------------------------
     ATOMIC CLAIM / PROPOSITION AUDIT
     ---------------------------------------------------------- */

  const claimAudit =
    await auditClaims({
      query,
      intent,
      answer,
      evidence
    });


  const unsupportedPropositions =
    claimAudit.unsupportedPropositions ??
    0;


  const initialSafe =
    grounding.passed &&
    claimAudit.passed &&
    unsupportedPropositions <=
      ethosSafetyConfig.maxUnsupportedPropositions;


  if (initialSafe) {

    return {
      answer,

      groundingPassed: true,

      claimAuditPassed: true,

      unsupportedPropositions: 0,

      repairAttempted: false,

      repairSucceeded: false
    };
  }


  /* ----------------------------------------------------------
     REPAIR

     Repair consumes proposition-level audit results.

     It does NOT simply regenerate the answer from scratch.
     ---------------------------------------------------------- */

  if (
    ethosSafetyConfig.maxRepairAttempts < 1
  ) {

    return {
      answer,

      groundingPassed:
        grounding.passed,

      claimAuditPassed:
        claimAudit.passed,

      unsupportedPropositions,

      repairAttempted: false,

      repairSucceeded: false
    };
  }


  const repaired =
    await repairAnswer({
      query,
      intent,
      answer,
      evidence,
      grounding,
      claimAudit
    });


  /* ----------------------------------------------------------
     POST-REPAIR AUDIT
     ---------------------------------------------------------- */

  const repairedGrounding =
    await auditGrounding({
      query,
      intent,
      answer: repaired.answer,
      evidence
    });


  const repairedClaimAudit =
    await auditClaims({
      query,
      intent,
      answer: repaired.answer,
      evidence
    });


  const repairedUnsupported =
    repairedClaimAudit
      .unsupportedPropositions ?? 0;


  const repairSucceeded =
    repairedGrounding.passed &&
    repairedClaimAudit.passed &&
    repairedUnsupported <=
      ethosSafetyConfig.maxUnsupportedPropositions;


  return {
    answer: repaired.answer,

    groundingPassed:
      repairedGrounding.passed,

    claimAuditPassed:
      repairedClaimAudit.passed,

    unsupportedPropositions:
      repairedUnsupported,

    repairAttempted: true,

    repairSucceeded
  };
}


/* ============================================================
   RUN ETHOS QUERY
   ============================================================ */

export async function runEthosQuery(
  request: EthosQueryRequest
): Promise<EthosQueryResponse> {

  const startedAt =
    Date.now();


  validateRequest(request);


  const query =
    normalizeQuery(request.query);


  const grade =
    request.grade ??
    ethosConfig.defaultGrade;


  const month =
    request.month ?? null;


  /* ==========================================================
     1. INTENT
     ========================================================== */

  let intent: EthosIntent;

  let intentConfidence: number;


  if (request.intent) {

    intent = request.intent;

    intentConfidence = 1;

  } else {

    const classification =
      await classifyIntent({
        query,
        grade,
        month
      });


    intent =
      classification.intent;

    intentConfidence =
      classification.confidence;
  }


  /* ==========================================================
     2. HYBRID RETRIEVAL
     ========================================================== */

  let retrieval;

  try {

    retrieval =
      await retrieveHybrid({
        query,
        intent,
        grade,
        month,
        n: ethosConfig.retrievalN
      });

  } catch (error) {

    console.error(
      "Ethos retrieval failed:",
      error
    );

    return {
      query,
      grade,
      month,
      intent,
      intentConfidence,

      answer:
        ethosFallbackMessages.retrievalFailure,

      sources: [],

      safeToDisplay: false,

      qa: {
        groundingPassed: false,
        claimAuditPassed: false,
        repairAttempted: false,
        repairSucceeded: false,
        unsupportedPropositions: 0
      }
    } as EthosQueryResponse;
  }


  /* ==========================================================
     3. EVIDENCE PACKAGE
     ========================================================== */

  const evidence =
    await buildEvidence({
      query,
      intent,
      grade,
      month,
      retrieval,
      n: ethosConfig.evidenceN
    });


  if (evidence.length === 0) {

    return {
      query,
      grade,
      month,
      intent,
      intentConfidence,

      answer:
        ethosFallbackMessages.noEvidence,

      sources: [],

      safeToDisplay: false,

      qa: {
        groundingPassed: false,
        claimAuditPassed: false,
        repairAttempted: false,
        repairSucceeded: false,
        unsupportedPropositions: 0
      }
    } as EthosQueryResponse;
  }


  /* ==========================================================
     4. SYNTHESIS
     ========================================================== */

  const synthesis =
    await synthesizeAnswer({
      query,
      grade,
      month,
      intent,
      evidence
    });


  /* ==========================================================
     5. QA + REPAIR
     ========================================================== */

  const qa =
    await runQaPipeline(
      synthesis.answer,
      evidence,
      query,
      intent
    );


  const safeToDisplay =
    qa.groundingPassed &&
    qa.claimAuditPassed &&
    qa.unsupportedPropositions <=
      ethosSafetyConfig.maxUnsupportedPropositions;


  /* ==========================================================
     6. SOURCES

     Convert internal evidence into teacher-facing sources.

     Retrieval ranks, scores, candidate IDs, and E1/E2 labels
     must not be exposed here.
     ========================================================== */

  const sources =
    buildSources(evidence);


  /* ==========================================================
     7. BLOCK UNSAFE OUTPUT
     ========================================================== */

  if (
    ethosSafetyConfig.blockUnsafeAnswers &&
    !safeToDisplay
  ) {

    return buildSafeFallback({
      query,
      grade,
      month,
      intent,
      intentConfidence,
      sources,
      qa: {
        groundingPassed:
          qa.groundingPassed,

        claimAuditPassed:
          qa.claimAuditPassed,

        repairAttempted:
          qa.repairAttempted,

        repairSucceeded:
          qa.repairSucceeded,

        unsupportedPropositions:
          qa.unsupportedPropositions
      }
    });
  }


  /* ==========================================================
     8. CLEAN TEACHER-FACING ANSWER
     ========================================================== */

  const cleanedAnswer =
    cleanAnswer(qa.answer);


  /* ==========================================================
     9. FINAL RESPONSE
     ========================================================== */

  const latencyMs =
    Date.now() - startedAt;


  if (
    process.env.NODE_ENV ===
    "development"
  ) {

    console.log(
      `Ethos query completed in ${latencyMs} ms`
    );
  }


  return {
    query,
    grade,
    month,

    intent,
    intentConfidence,

    answer:
      cleanedAnswer,

    sources,

    safeToDisplay: true,

    qa: {
      groundingPassed:
        qa.groundingPassed,

      claimAuditPassed:
        qa.claimAuditPassed,

      repairAttempted:
        qa.repairAttempted,

      repairSucceeded:
        qa.repairSucceeded,

      unsupportedPropositions:
        qa.unsupportedPropositions
    }
  } as EthosQueryResponse;
}


export default runEthosQuery;
