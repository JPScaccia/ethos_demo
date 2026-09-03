// tests/retrieval.test.ts

import { describe, expect, it } from "vitest";

import { retrieveHybrid } from "../lib/ethos/hybridRetrieval";

import parityFixture from "./fixtures/retrieval-parity.json";


/* ============================================================
   ETHOS v2.7a RETRIEVAL PARITY

   These tests compare the production TypeScript retrieval
   engine against known-good outputs from the frozen R v2.7a
   implementation.

   IMPORTANT:
   - Do not tune retrieval to make these tests pass.
   - A failure means we should investigate R ↔ TypeScript parity.
   - Candidate ordering is the primary parity requirement.
   - Numeric scores are diagnostic parity requirements.
   ============================================================ */


interface ParityCandidate {
  rank: number;
  candidate: string;

  anchor_hits: number;
  best_anchor_rank: number | null;

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

  contextual_semantic: number | null;
  virtue_context_score: number | null;
  general_score: number | null;
}


interface ParityCase {
  id: string;
  query: string;
  intent: string;
  grade: number;
  month: string | null;
  retrieval_version: string;
  top_n: number;
  candidates: ParityCandidate[];
}


interface ParityFixture {
  metadata: {
    retrieval_version: string;
    embedding_model: string;
    semantic_seed_k: number;
    graph_results_per_anchor: number;
    context_boost: number;
    context_policy: string;
    grade: number;
    generated_at: string;
  };

  cases: ParityCase[];
}


const fixture =
  parityFixture as ParityFixture;


/*
 * Floating-point calculations can differ slightly between
 * R and PostgreSQL/JavaScript.
 *
 * Six decimal places is strict enough to detect meaningful
 * algorithm differences while ignoring insignificant floating
 * point representation noise.
 */

const SCORE_PRECISION = 6;


/* ============================================================
   FIXTURE SANITY
   ============================================================ */

describe("Ethos retrieval parity fixture", () => {

  it("uses the frozen v2.7a configuration", () => {

    expect(
      fixture.metadata.retrieval_version
    ).toBe("v2.7a");


    expect(
      fixture.metadata.embedding_model
    ).toBe("text-embedding-3-small");


    expect(
      fixture.metadata.semantic_seed_k
    ).toBe(5);


    expect(
      fixture.metadata.graph_results_per_anchor
    ).toBe(20);


    expect(
      fixture.metadata.context_boost
    ).toBeCloseTo(
      0.045,
      12
    );


    expect(
      fixture.metadata.context_policy
    ).toBe("context_v0.1");


    expect(
      fixture.metadata.grade
    ).toBe(8);
  });


  it("contains the 10 golden demo cases", () => {

    expect(
      fixture.cases.map(
        testCase =>
          testCase.id
      )
    ).toEqual([
      "Q16",
      "Q02",
      "Q04",
      "Q03",
      "U10",
      "U14",
      "S18",
      "U22",
      "JQ21",
      "NQ17"
    ]);
  });

});


/* ============================================================
   EXACT CANDIDATE ORDER

   This is the most important parity test.
   ============================================================ */

describe("Ethos v2.7a candidate-order parity", () => {

  for (
    const testCase of fixture.cases
  ) {

    it(
      `${testCase.id} reproduces R candidate order`,
      async () => {

        const results =
          await retrieveHybrid({
            query:
              testCase.query,

            intent:
              testCase.intent as any,

            grade:
              testCase.grade,

            month:
              testCase.month,

            n:
              10
          });


        const actualCandidates =
          results.map(
            result =>
              result.candidate
          );


        const expectedCandidates =
          testCase.candidates.map(
            candidate =>
              candidate.candidate
          );


        expect(
          actualCandidates
        ).toEqual(
          expectedCandidates
        );
      }
    );
  }

});


/* ============================================================
   RESULT COUNT PARITY

   Important because some focused intents legitimately return
   fewer than 10 candidates.

   Examples in the frozen fixture:
   - saint: 4
   - scripture: 9
   - teacher_reading: 9
   ============================================================ */

describe("Ethos v2.7a result-count parity", () => {

  for (
    const testCase of fixture.cases
  ) {

    it(
      `${testCase.id} returns ${testCase.top_n} candidates`,
      async () => {

        const results =
          await retrieveHybrid({
            query:
              testCase.query,

            intent:
              testCase.intent as any,

            grade:
              testCase.grade,

            month:
              testCase.month,

            n:
              10
          });


        expect(
          results
        ).toHaveLength(
          testCase.top_n
        );
      }
    );
  }

});


/* ============================================================
   STRUCTURAL SCORE PARITY

   These values do not depend directly on candidate semantic
   similarity and are useful for identifying graph-port errors.
   ============================================================ */

describe("Ethos v2.7a structural-score parity", () => {

  for (
    const testCase of fixture.cases
  ) {

    it(
      `${testCase.id} reproduces graph and anchor metrics`,
      async () => {

        const results =
          await retrieveHybrid({
            query:
              testCase.query,

            intent:
              testCase.intent as any,

            grade:
              testCase.grade,

            month:
              testCase.month,

            n:
              10
          });


        for (
          let i = 0;
          i < results.length;
          i += 1
        ) {

          const actual =
            results[i];

          const expected =
            testCase.candidates[i];


          expect(
            actual.candidate
          ).toBe(
            expected.candidate
          );


          expect(
            actual.anchor_hits
          ).toBe(
            expected.anchor_hits
          );


          if (
            expected.best_anchor_rank !==
            null
          ) {

            expect(
              actual.best_anchor_rank
            ).toBe(
              expected.best_anchor_rank
            );
          }


          expect(
            actual.max_graph_score
          ).toBeCloseTo(
            expected.max_graph_score,
            SCORE_PRECISION
          );


          expect(
            actual.mean_graph_score
          ).toBeCloseTo(
            expected.mean_graph_score,
            SCORE_PRECISION
          );


          expect(
            actual.primary_anchor_graph
          ).toBeCloseTo(
            expected.primary_anchor_graph,
            SCORE_PRECISION
          );


          expect(
            actual.max_intent_score
          ).toBeCloseTo(
            expected.max_intent_score,
            SCORE_PRECISION
          );


          expect(
            actual.primary_relationship_role
          ).toBeCloseTo(
            expected.primary_relationship_role,
            SCORE_PRECISION
          );


          expect(
            actual.context_graph_score
          ).toBeCloseTo(
            expected.context_graph_score,
            SCORE_PRECISION
          );
        }
      }
    );
  }

});


/* ============================================================
   FULL NUMERIC PARITY

   These checks include embedding-derived values.

   If candidate ordering and structural scores pass but these
   fail slightly, inspect pgvector/OpenAI numeric differences
   before changing retrieval logic.
   ============================================================ */

describe("Ethos v2.7a numeric parity", () => {

  for (
    const testCase of fixture.cases
  ) {

    it(
      `${testCase.id} reproduces hybrid scores`,
      async () => {

        const results =
          await retrieveHybrid({
            query:
              testCase.query,

            intent:
              testCase.intent as any,

            grade:
              testCase.grade,

            month:
              testCase.month,

            n:
              10
          });


        for (
          let i = 0;
          i < results.length;
          i += 1
        ) {

          const actual =
            results[i];

          const expected =
            testCase.candidates[i];


          expect(
            actual.max_anchor_semantic
          ).toBeCloseTo(
            expected.max_anchor_semantic,
            SCORE_PRECISION
          );


          expect(
            actual.candidate_semantic
          ).toBeCloseTo(
            expected.candidate_semantic,
            SCORE_PRECISION
          );


          expect(
            actual.anchor_hit_score
          ).toBeCloseTo(
            expected.anchor_hit_score,
            SCORE_PRECISION
          );


          expect(
            actual.anchor_rank_score
          ).toBeCloseTo(
            expected.anchor_rank_score,
            SCORE_PRECISION
          );


          expect(
            actual.hybrid_score
          ).toBeCloseTo(
            expected.hybrid_score,
            SCORE_PRECISION
          );
        }
      }
    );
  }

});


/* ============================================================
   CONTEXT-SPECIFIC PARITY
   ============================================================ */

describe("Ethos v2.7a contextual ranking parity", () => {

  it("reproduces October virtue context", async () => {

    const testCase =
      fixture.cases.find(
        item =>
          item.id === "U10"
      );


    expect(
      testCase
    ).toBeDefined();


    const results =
      await retrieveHybrid({
        query:
          testCase!.query,

        intent:
          "virtue",

        grade:
          testCase!.grade,

        month:
          testCase!.month,

        n:
          10
      });


    for (
      let i = 0;
      i < results.length;
      i += 1
    ) {

      const expected =
        testCase!.candidates[i];


      expect(
        expected.virtue_context_score
      ).not.toBeNull();


      expect(
        results[i].virtue_context_score
      ).toBeCloseTo(
        expected.virtue_context_score!,
        SCORE_PRECISION
      );
    }
  });


  for (
    const caseId of [
      "U22",
      "JQ21"
    ]
  ) {

    it(
      `${caseId} reproduces contextual semantic ranking`,
      async () => {

        const testCase =
          fixture.cases.find(
            item =>
              item.id === caseId
          );


        expect(
          testCase
        ).toBeDefined();


        const results =
          await retrieveHybrid({
            query:
              testCase!.query,

            intent:
              testCase!.intent as any,

            grade:
              testCase!.grade,

            month:
              testCase!.month,

            n:
              10
          });


        for (
          let i = 0;
          i < results.length;
          i += 1
        ) {

          const expected =
            testCase!.candidates[i];


          expect(
            expected.contextual_semantic
          ).not.toBeNull();


          expect(
            results[i].contextual_semantic
          ).toBeCloseTo(
            expected.contextual_semantic!,
            SCORE_PRECISION
          );
        }
      }
    );
  }

});
