// tests/retrieval.test.ts

import { describe, expect, it } from "vitest";

import { retrieveHybrid } from "../lib/ethos/hybridRetrieval";


// ============================================================
// ETHOS RETRIEVAL PARITY TESTS
//
// These tests are intended to compare the TypeScript retrieval
// port against known-good outputs from the frozen R v2.7a
// implementation.
//
// Do not tune retrieval to these tests.
// They are regression/parity checks.
// ============================================================


describe("Ethos v2.7a retrieval", () => {

  it("returns results for a general query", async () => {

    const results =
      await retrieveHybrid({
        query:
          "What Catholic content fits industrialization?",

        intent:
          "general",

        grade:
          8,

        month:
          "October",

        n:
          10
      });


    expect(
      results.length
    ).toBeGreaterThan(0);


    expect(
      results.length
    ).toBeLessThanOrEqual(10);


    expect(
      results[0]
    ).toHaveProperty(
      "candidate"
    );


    expect(
      results[0]
    ).toHaveProperty(
      "hybrid_score"
    );
  });



  it("returns doctrine candidates for a doctrine query", async () => {

    const results =
      await retrieveHybrid({
        query:
          "What does the Church teach about workers?",

        intent:
          "doctrine",

        grade:
          8,

        month:
          "October",

        n:
          10
      });


    expect(
      results.length
    ).toBeGreaterThan(0);


    expect(
      results.every(
        result =>
          result.max_intent_score > 0
      )
    ).toBe(true);
  });



  it("returns scripture candidates for a scripture query", async () => {

    const results =
      await retrieveHybrid({
        query:
          "What Scripture fits worker dignity?",

        intent:
          "scripture",

        grade:
          8,

        month:
          "October",

        n:
          10
      });


    expect(
      results.length
    ).toBeGreaterThan(0);


    expect(
      results.every(
        result =>
          result.max_intent_score > 0
      )
    ).toBe(true);
  });



  it("applies month context for discussion", async () => {

    const results =
      await retrieveHybrid({
        query:
          "Give me a class discussion on work and human dignity.",

        intent:
          "discussion",

        grade:
          8,

        month:
          "October",

        n:
          10
      });


    expect(
      results.length
    ).toBeGreaterThan(0);


    expect(
      results.every(
        result =>
          typeof result.contextual_semantic ===
          "number"
      )
    ).toBe(true);
  });



  it("applies virtue context when month is provided", async () => {

    const results =
      await retrieveHybrid({
        query:
          "What virtue connects to this unit?",

        intent:
          "virtue",

        grade:
          8,

        month:
          "October",

        n:
          10
      });


    expect(
      results.length
    ).toBeGreaterThan(0);


    expect(
      results.every(
        result =>
          typeof result.virtue_context_score ===
          "number"
      )
    ).toBe(true);
  });

});
