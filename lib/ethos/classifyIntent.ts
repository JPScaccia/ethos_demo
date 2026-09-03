// lib/ethos/classifyIntent.ts

import OpenAI from "openai";

import type {
  EthosIntent,
  EthosIntentClassification
} from "../types";

import {
  ethosConfig
} from "../config";


/* ============================================================
   ETHOS INTENT CLASSIFICATION

   Maps a teacher query to one of the controlled Ethos intents.

   Allowed intents:
   - general
   - doctrine
   - scripture
   - saint
   - virtue
   - standards
   - activity
   - discussion
   - family
   - teacher_reading
   - primary_source
   - resource

   IMPORTANT:
   This classifier does not answer the teacher's question.
   It only determines the retrieval intent.
   ============================================================ */


const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});


/* ============================================================
   INPUT TYPE
   ============================================================ */

export interface ClassifyIntentInput {
  query: string;

  grade?: number;

  month?: string | null;
}


/* ============================================================
   RAW MODEL RESPONSE
   ============================================================ */

interface RawIntentResponse {
  intent: string;
  confidence: number;
  rationale?: string;
}


/* ============================================================
   INTENT DEFINITIONS
   ============================================================ */

const INTENT_DESCRIPTIONS: Record<
  EthosIntent,
  string
> = {

  general:
    "Broad request for meaningful Catholic connections to a topic, unit, text, historical period, or instructional context.",

  doctrine:
    "Request for Catholic teaching, doctrine, moral teaching, catechism content, Church teaching, or theological principles.",

  scripture:
    "Request for Scripture, biblical passages, biblical themes, or scriptural connections.",

  saint:
    "Request for a saint or Catholic holy figure who connects meaningfully to the instructional topic.",

  virtue:
    "Request for a Catholic virtue, moral habit, character formation theme, or virtue-based connection.",

  standards:
    "Request for Catholic educational standards, diocesan standards, curriculum standards, or formal learning expectations.",

  activity:
    "Request for a classroom activity, learning experience, exercise, simulation, project, or instructional application.",

  discussion:
    "Request for discussion questions, Socratic prompts, seminar questions, reflection questions, or classroom conversation prompts.",

  family:
    "Request for a family discussion, take-home question, parent connection, home-school connection, or family engagement prompt.",

  teacher_reading:
    "Request for background reading, teacher preparation material, deeper professional reading, or resources intended primarily for the teacher.",

  primary_source:
    "Request for a primary source, original historical document, Church document, encyclical, original text, or source suitable for direct examination.",

  resource:
    "Request for a concrete instructional resource, reading, lesson support, handout, reference, or other usable resource not better classified elsewhere."
};


/* ============================================================
   CLASSIFIER PROMPT
   ============================================================ */

function buildIntentPrompt(
  input: ClassifyIntentInput
): string {

  const gradeText =
    input.grade !== undefined
      ? String(input.grade)
      : "not specified";

  const monthText =
    input.month ?? "not specified";


  const intentGuide =
    ethosConfig.allowedIntents
      .map(
        intent =>
          `${intent}: ${INTENT_DESCRIPTIONS[intent]}`
      )
      .join("\n");


  return `
You are the intent classifier for Ethos, a Catholic curricular integration system.

Your only task is to classify the teacher's request into exactly one allowed retrieval intent.

Do not answer the teacher's question.
Do not recommend content.
Do not invent Catholic material.
Do not classify based only on isolated keywords when the teacher's actual instructional goal indicates a different intent.

ALLOWED INTENTS

${intentGuide}

CLASSIFICATION GUIDANCE

1. Choose the intent that best represents what the teacher wants Ethos to return.

2. If the teacher asks broadly for Catholic connections, integration ideas, or "what fits," use:
general

3. If the teacher explicitly asks what the Church teaches, what Catholic teaching says, or for doctrine/moral teaching, use:
doctrine

4. If the teacher wants a biblical passage or Scripture connection, use:
scripture

5. If the teacher wants a saint, use:
saint

6. If the teacher wants a virtue, use:
virtue

7. If the teacher wants a Catholic standard or curriculum standard, use:
standards

8. If the teacher wants something students can do, use:
activity

9. If the teacher wants something students can discuss, debate, reflect on together, or answer in class, use:
discussion

10. If the teacher wants a take-home or parent/family connection, use:
family

11. If the teacher wants material primarily to help the teacher prepare or understand the subject more deeply, use:
teacher_reading

12. If the teacher specifically wants an original text, historical document, encyclical, Church document, or other primary source, use:
primary_source

13. Use resource when the teacher explicitly wants a usable resource but none of the more specific intents above clearly applies.

14. When a request contains multiple possibilities, choose the intent that most directly corresponds to the requested output.

15. Do not treat the academic subject itself as the intent. For example:
"What Scripture could connect to industrialization?" = scripture
"What activity could connect to industrialization?" = activity
"What Catholic teaching connects to industrialization?" = doctrine
"What Catholic connections fit industrialization?" = general

CONTEXT

Grade: ${gradeText}
Month: ${monthText}

TEACHER QUERY

${input.query}

Return JSON only in this exact structure:

{
  "intent": "one allowed intent",
  "confidence": 0.0,
  "rationale": "brief classification rationale"
}

Confidence must be between 0 and 1.
`.trim();
}


/* ============================================================
   TYPE GUARD
   ============================================================ */

function isEthosIntent(
  value: string
): value is EthosIntent {

  return ethosConfig.allowedIntents.includes(
    value as EthosIntent
  );
}


/* ============================================================
   NORMALIZE CONFIDENCE
   ============================================================ */

function normalizeConfidence(
  value: unknown
): number {

  if (
    typeof value !== "number" ||
    !Number.isFinite(value)
  ) {
    return 0;
  }

  if (value < 0) {
    return 0;
  }

  if (value > 1) {
    return 1;
  }

  return value;
}


/* ============================================================
   FALLBACK CLASSIFIER

   Used only if the model fails to return a valid controlled
   intent.

   This is deliberately conservative and deterministic.
   ============================================================ */

function fallbackIntent(
  query: string
): EthosIntent {

  const q =
    query.toLowerCase();


  if (
    /\b(scripture|bible|biblical|verse|passage)\b/.test(q)
  ) {
    return "scripture";
  }


  if (
    /\b(saint|holy person|holy figure)\b/.test(q)
  ) {
    return "saint";
  }


  if (
    /\b(virtue|virtues)\b/.test(q)
  ) {
    return "virtue";
  }


  if (
    /\b(standard|standards)\b/.test(q)
  ) {
    return "standards";
  }


  if (
    /\b(activity|exercise|simulation|project|students do|students can do)\b/.test(q)
  ) {
    return "activity";
  }


  if (
    /\b(discussion|discuss|debate|socratic|seminar|discussion question|reflection question)\b/.test(q)
  ) {
    return "discussion";
  }


  if (
    /\b(family|parent|parents|home discussion|take home|take-home)\b/.test(q)
  ) {
    return "family";
  }


  if (
    /\b(primary source|original document|original text|encyclical)\b/.test(q)
  ) {
    return "primary_source";
  }


  if (
    /\b(teacher reading|teacher background|background reading|teacher preparation|teacher prep)\b/.test(q)
  ) {
    return "teacher_reading";
  }


  if (
    /\b(church teach|church teaching|catholic teaching|doctrine|catechism|moral teaching)\b/.test(q)
  ) {
    return "doctrine";
  }


  if (
    /\b(resource|handout|lesson resource|reading resource)\b/.test(q)
  ) {
    return "resource";
  }


  return "general";
}


/* ============================================================
   CLASSIFY INTENT
   ============================================================ */

export async function classifyIntent(
  input: ClassifyIntentInput
): Promise<EthosIntentClassification> {

  const query =
    input.query
      .replace(/\s+/g, " ")
      .trim();


  if (!query) {
    throw new Error(
      "Cannot classify an empty Ethos query."
    );
  }


  try {

    const response =
      await openai.chat.completions.create({
        model:
          ethosConfig.intentModel,

        temperature: 0,

        response_format: {
          type: "json_object"
        },

        messages: [
          {
            role: "system",
            content:
              "You classify Ethos teacher queries into a fixed retrieval intent. Return valid JSON only."
          },
          {
            role: "user",
            content:
              buildIntentPrompt({
                ...input,
                query
              })
          }
        ]
      });


    const content =
      response.choices[0]
        ?.message
        ?.content;


    if (!content) {
      throw new Error(
        "Intent classifier returned no content."
      );
    }


    const parsed =
      JSON.parse(
        content
      ) as RawIntentResponse;


    if (
      !parsed.intent ||
      !isEthosIntent(parsed.intent)
    ) {

      const fallback =
        fallbackIntent(query);

      return {
        intent: fallback,
        confidence: 0,
        rationale:
          "The model did not return a valid controlled Ethos intent, so deterministic fallback classification was used."
      };
    }


    return {
      intent:
        parsed.intent,

      confidence:
        normalizeConfidence(
          parsed.confidence
        ),

      rationale:
        parsed.rationale?.trim() ||
        "Classified from the teacher's requested output."
    };


  } catch (error) {

    console.error(
      "Ethos intent classification failed:",
      error
    );


    const fallback =
      fallbackIntent(query);


    return {
      intent:
        fallback,

      confidence: 0,

      rationale:
        "Intent classification service failed, so deterministic fallback classification was used."
    };
  }
}


export default classifyIntent;
