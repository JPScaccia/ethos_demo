# Ethos

**An intelligent Catholic curricular integration system for Catholic Text**

Ethos helps teachers answer a practical instructional question:

> **Given what I am already teaching, what meaningful Catholic connections belong here, and how can I actually use them?**

Ethos combines semantic search, a structured Catholic curricular knowledge graph, intent-aware retrieval, and grounded generative AI to identify relevant Catholic connections and turn them into teacher-ready instructional guidance.

The current production baseline is **Ethos Retrieval v2.7a**.

---

## What Ethos Is

Ethos is an instructional reasoning layer being developed for integration into **Catholic Text**.

It is not intended to function as a standalone application. The production goal is to make Ethos available within the existing Catholic Text application, for example:

```text
/ethos
```

Catholic Text should continue to provide the surrounding application infrastructure, including:

- authentication;
- user accounts;
- navigation;
- site layout;
- hosting;
- analytics;
- access and subscription rules; and
- application-wide configuration.

Ethos provides the curricular intelligence layer.

Conceptually:

```text
Catholic Text
│
├── Existing authentication
├── Existing accounts
├── Existing navigation
├── Existing access/subscription logic
├── Existing analytics
│
└── /ethos
      │
      ├── Teacher interface
      ├── Intent classification
      ├── Hybrid retrieval
      ├── Evidence construction
      ├── Grounded synthesis
      └── QA / claim auditing
```

---

# Product Principle

Ethos is built around a simple safety and product principle:

> **Ethos can be creative about pedagogy without being creative about Catholic content.**

The system may synthesize, organize, explain, and make instructional connections from retrieved evidence.

It may not invent Catholic claims, sources, saints, Scripture, standards, Church documents, or instructional resources that are absent from the evidence available to it.

---

# How Ethos Works

Ethos separates **retrieval** from **generation**.

Retrieval determines what evidence the system is entitled to use.

Generation determines how that evidence can be organized into a useful response for a teacher.

The intended production pipeline is:

```text
Teacher query
      ↓
Intent classification
      ↓
Semantic retrieval
      ↓
Graph expansion
      ↓
Hybrid ranking
      ↓
Evidence package
      ↓
Grounded synthesis
      ↓
Broad grounding QA
      ↓
Atomic claim audit
      ↓
Repair if necessary
      ↓
Re-audit
      ↓
Clean teacher response
      ↓
Teacher-facing sources
```

This architecture allows Ethos to use generative AI while keeping the structured knowledge base and retrieved evidence in control of substantive Catholic content.

---

# Knowledge Base

The current reference implementation is the validated **Grade 8 Ethos knowledge base**.

It contains:

| Component | Count |
|---|---:|
| Nodes | 375 |
| Edges | 1,476 |
| Embeddings | 375 |
| Embedding dimensions | 1,536 |

The portable reference data is stored in:

```text
data/
├── nodes.json
├── edges.json
└── embeddings.json
```

These files represent the frozen knowledge base used during retrieval validation.

They should not be treated as sample data.

---

# What the Nodes Represent

The knowledge graph contains multiple kinds of curricular and Catholic content.

Current node types include:

```text
church_document
catechism_teaching
catholic_concept
catholic_standard
church_history
catholic_figure
saint
scripture
virtue
essential_question
instructional_resource
academic_topic
historical_period
literary_work
curriculum_unit
```

These allow Ethos to connect ordinary academic instruction with relevant Catholic material.

For example, an academic topic such as industrialization can connect through the graph to concepts such as worker dignity, Church documents, Scripture, saints, virtues, standards, activities, and discussion questions.

---

# Knowledge Graph Relationships

Edges represent meaningful relationships among nodes.

Current controlled relationship types include:

```text
TEACHES
REQUIRES_KNOWLEDGE_OF
EXEMPLIFIES
DOCTRINALLY_ALIGNS_WITH
HISTORICALLY_ALIGNS_WITH
SUPPORTED_BY
GROUNDED_IN_SCRIPTURE
EXTENDS
PROMPTS_INQUIRY_INTO
STANDARDS_ALIGNS_WITH
RESPONDS_TO
CONNECTS_TO
SAINT_ALIGNS_WITH
VIRTUE_ALIGNS_WITH
SCRIPTURE_ALIGNS_WITH
FAMILY_ALIGNS_WITH
TEACHER_READING_ALIGNS_WITH
```

The retrieval implementation also preserves compatibility with several legacy relationship labels referenced by the validated R scoring logic.

Do not remove legacy scoring behavior without first confirming that the corresponding values are absent from the imported data and rerunning retrieval regression tests.

---

# Authority Levels

Ethos distinguishes different levels of source authority:

```text
A1_BIBLICAL
A2_MAGISTERIAL
A3_ECCLESIAL_STANDARD
A4_VETTED_REFERENCE
A5_LOCAL_RESOURCE
A6_AI_GENERATED
```

Authority contributes to graph retrieval scoring.

The current authority weights are part of the frozen v2.7a retrieval implementation and should not be changed during the production migration.

---

# Retrieval Intents

Ethos supports the following retrieval intents:

```text
general
doctrine
scripture
saint
virtue
standards
activity
discussion
family
teacher_reading
primary_source
resource
```

Intent affects both candidate eligibility and ranking behavior.

For example, a teacher explicitly asking for Scripture should not receive the same ranking behavior as a teacher asking broadly for Catholic connections to an academic topic.

---

# Hybrid Retrieval

Ethos does not rely exclusively on either semantic search or graph search.

Instead, it uses both.

Conceptually:

```text
Teacher question
      ↓
OpenAI query embedding
      ↓
Top semantic anchors
      ↓
Graph expansion from anchors
      ↓
Intent-aware scoring
      ↓
Candidate semantic similarity
      ↓
Hybrid ranking
```

The semantic layer helps Ethos understand the teacher's natural language.

The graph layer helps Ethos identify meaningful relationships that semantic similarity alone may not reveal.

---

# Frozen Retrieval Configuration

The current validated production baseline is:

```text
Retrieval version:          v2.7a
Embedding model:            text-embedding-3-small
Semantic seed K:            5
Graph results per anchor:   20
Context boost:              0.045
Context policy:             context_v0.1
```

The embedding model produces:

```text
1536 dimensions
```

Do not change these values during the initial production migration.

---

# Retrieval Validation

Ethos was initially developed and validated in R.

The R implementation is the **reference implementation**.

The TypeScript implementation in this repository is the **production implementation**.

The immediate migration objective is therefore not simply to produce reasonable search results. It is to reproduce the behavior of the validated R system.

A frozen parity fixture is stored at:

```text
tests/fixtures/retrieval-parity.json
```

The primary regression suite is:

```text
tests/retrieval.test.ts
```

It contains **45 tests** covering ten golden retrieval cases:

```text
Q16
Q02
Q04
Q03
U10
U14
S18
U22
JQ21
NQ17
```

These cases collectively exercise general retrieval, doctrine, Scripture, saints, virtues, standards, activities, discussion, family connections, and teacher preparation.

The suite tests:

- exact candidate ordering;
- result counts;
- graph metrics;
- anchor metrics;
- semantic values;
- hybrid scores; and
- contextual ranking behavior.

Run it with:

```bash
npx vitest run tests/retrieval.test.ts
```

The migration target is:

```text
45 passed
0 failed
```

Until that occurs against a correctly initialized database, the TypeScript retrieval layer should not yet be considered equivalent to the validated R implementation.

---

# Important Validation Rule

Do **not** change:

```text
tests/fixtures/retrieval-parity.json
```

simply to make the TypeScript tests pass.

The fixture contains the expected behavior exported from the validated R reference implementation.

If the PostgreSQL knowledge base has been verified and a parity test still fails, investigate the difference between the TypeScript and R implementations.

Potential sources of subtle differences include:

- stable ordering of tied semantic results;
- database ordering versus original R row ordering;
- contextual curriculum-unit selection;
- bidirectional graph traversal;
- preservation of multiple two-hop paths;
- floating-point differences; and
- intent-specific ordering.

Correct the implementation rather than redefining the reference result.

---

# Technology Stack

The production implementation uses:

```text
TypeScript / JavaScript
Next.js
PostgreSQL
pgvector
Prisma 7
OpenAI API
Vitest
GitHub
```

R is not required in production.

It remains the historical reference implementation used to establish parity.

---

# PostgreSQL and pgvector

Ethos stores the production knowledge graph in PostgreSQL.

Embeddings are stored using `pgvector`.

The target PostgreSQL database must therefore support:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

Embeddings use:

```text
text-embedding-3-small
1536 dimensions
```

The Prisma schema represents the vector as:

```prisma
Unsupported("vector(1536)")
```

Do not substitute another vector store during initial migration without rerunning retrieval validation.

---

# Environment Variables

Ethos requires at minimum:

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DATABASE"
OPENAI_API_KEY="YOUR_OPENAI_API_KEY"
```

Real credentials must never be committed to GitHub.

The repository's `.env` file should be excluded through `.gitignore`.

## DATABASE_URL

The development repository may contain a placeholder:

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DATABASE"
```

This must be replaced in the actual deployment environment.

Conceptually:

```text
USER       → PostgreSQL username
PASSWORD   → PostgreSQL password
HOST       → PostgreSQL hostname
5432       → PostgreSQL port, if different
DATABASE   → PostgreSQL database name
```

If Catholic Text already supplies a `DATABASE_URL`, Ethos should use the existing application configuration where appropriate.

## OPENAI_API_KEY

Configure the OpenAI key as an environment/deployment secret:

```env
OPENAI_API_KEY="..."
```

Never place the actual key in source code.

---

# Prisma 7

Database configuration is located in:

```text
prisma.config.ts
```

The project uses the Prisma 7 configuration pattern:

```ts
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations"
  },
  datasource: {
    url: env("DATABASE_URL")
  }
});
```

The datasource in:

```text
prisma/schema.prisma
```

should remain:

```prisma
datasource db {
  provider = "postgresql"
}
```

Do not move the database URL back into `schema.prisma`.

---

# PostgreSQL Driver Adapter

Prisma 7 requires a PostgreSQL driver adapter for this configuration.

The project uses:

```text
@prisma/adapter-pg
pg
```

The shared database client is defined in:

```text
lib/db.ts
```

All Ethos modules should use this shared database client.

Do not instantiate unconfigured Prisma clients inside individual retrieval modules.

For example, avoid:

```ts
const prisma = new PrismaClient();
```

Instead, import the shared configured client:

```ts
import { db } from "../db";
```

using the appropriate relative path.

---

# Initial Database Setup

Once a real `DATABASE_URL` is available:

### 1. Generate Prisma Client

```bash
npx prisma generate
```

### 2. Verify pgvector

The database must support:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

### 3. Create the Ethos schema

Use the migration strategy appropriate to the existing Catholic Text application.

The Ethos Prisma schema currently defines models for:

```text
Node
Edge
Embedding
AppConfig
QueryLog
QaLog
Feedback
```

### 4. Import the frozen data

Import:

```text
data/nodes.json
data/edges.json
data/embeddings.json
```

Do not regenerate the embeddings during the initial parity migration.

### 5. Verify the database

Run:

```bash
npx tsx scripts/verifyEthosData.ts
```

The expected counts are:

```text
375 nodes
1,476 edges
375 embeddings
```

The verification should also confirm:

- no orphan edges;
- no missing embedded nodes;
- 1,536-dimensional embeddings;
- correct embedding model;
- no duplicate node IDs; and
- no duplicate edge IDs.

### 6. Run retrieval parity

```bash
npx vitest run tests/retrieval.test.ts
```

Target:

```text
45 passed
0 failed
```

---

# Current Handoff State

At the current handoff point, application-side development has progressed through:

```text
Vitest initialization
      ↓
Environment loading
      ↓
OpenAI client initialization
      ↓
Prisma 7 initialization
      ↓
PostgreSQL driver adapter
      ↓
Query embedding
      ↓
Prisma raw SQL construction
      ↓
PostgreSQL connection attempt
```

The current development environment stops at the PostgreSQL connection because Jonathan does not have access to the Catholic Text database credentials.

The current expected error is:

```text
Can't reach database server at HOST
```

This occurs because `HOST` remains a placeholder in the local `DATABASE_URL`.

This is **not currently evidence of a retrieval-algorithm failure**.

The next developer with database access should:

```text
Replace DATABASE_URL
      ↓
Connect PostgreSQL
      ↓
Enable pgvector
      ↓
Create Ethos schema
      ↓
Import frozen knowledge base
      ↓
Verify 375 / 1,476 / 375
      ↓
Run retrieval parity
```

Only after those steps are complete will any remaining test failures represent meaningful TypeScript-versus-R parity differences.

---

# Repository Structure

The intended Ethos feature structure is:

```text
ethos/
├── README.md
├── DEPLOYMENT.md
├── INTEGRATION.md
├── .env.example
│
├── lib/
│   ├── types.ts
│   ├── config.ts
│   ├── db.ts
│   │
│   └── ethos/
│       ├── runEthosQuery.ts
│       ├── classifyIntent.ts
│       ├── embedQuery.ts
│       ├── semanticRetrieval.ts
│       ├── graphRetrieval.ts
│       ├── hybridRetrieval.ts
│       ├── buildEvidence.ts
│       ├── synthesize.ts
│       ├── auditGrounding.ts
│       ├── auditClaims.ts
│       ├── repairAnswer.ts
│       ├── cleanAnswer.ts
│       └── buildSources.ts
│
├── prompts/
│   ├── intent.ts
│   ├── synthesis.ts
│   ├── grounding.ts
│   ├── claimAudit.ts
│   └── repair.ts
│
├── data/
│   ├── nodes.json
│   ├── edges.json
│   └── embeddings.json
│
├── prisma/
│   ├── schema.prisma
│   └── seed.ts
│
├── app/
│   ├── ethos/
│   │   └── page.tsx
│   └── api/
│       └── ethos/
│           └── route.ts
│
├── components/
│   └── ethos/
│       ├── EthosChat.tsx
│       ├── EthosMessage.tsx
│       ├── EthosSources.tsx
│       ├── EthosExamples.tsx
│       └── EthosFeedback.tsx
│
├── scripts/
│   ├── importEthosData.ts
│   └── verifyEthosData.ts
│
└── tests/
    ├── fixtures/
    │   └── retrieval-parity.json
    ├── goldenDemo.test.ts
    ├── retrieval.test.ts
    └── grounding.test.ts
```

Some later-stage files may still be under implementation. Retrieval parity should be completed before downstream components are treated as production-ready.

---

# Core Application Contract

The intended stable server-side entry point is:

```ts
runEthosQuery({
  query,
  grade: 8,
  month: null,
  intent: null
})
```

The response contract is:

```ts
{
  query,
  grade,
  month,
  intent,
  intentConfidence,
  answer,
  sources,
  safeToDisplay,
  qa
}
```

The UI should depend on this contract rather than directly calling individual retrieval, synthesis, or audit modules.

This keeps the internal architecture replaceable without requiring the teacher-facing application to understand retrieval mechanics.

---

# Grounding Rules

The production answer pipeline uses three important categories when evaluating claims.

## Direct

The retrieved evidence directly establishes the proposition.

## Instructional synthesis

Ethos transparently connects something established by the evidence to the teacher's instructional context.

## Unsupported

Ethos introduces a proposition that neither the retrieved evidence nor a transparent instructional connection establishes.

Unsupported propositions should trigger repair rather than being displayed to the teacher.

After repair, the answer should be audited again.

---

# Teacher-Facing vs. Internal Information

The teacher interface should display useful instructional information such as:

- the answer;
- meaningful Catholic connections;
- instructional suggestions; and
- sources.

It should not expose internal retrieval mechanics such as:

```text
semantic scores
graph scores
hybrid scores
anchor ranks
candidate ranks
internal evidence IDs
E1 / E2 labels
internal QA reasoning
claim-audit diagnostics
```

These are implementation details used to improve reliability.

---

# Development Order

The recommended development sequence is:

```text
1. Configure PostgreSQL
2. Enable pgvector
3. Import frozen knowledge base
4. Verify database integrity
5. Achieve R ↔ TypeScript retrieval parity
6. Freeze TypeScript retrieval v2.7a
7. Complete evidence construction
8. Complete synthesis
9. Complete grounding QA
10. Complete proposition-level claim auditing
11. Complete repair and re-audit
12. Complete teacher-facing sources
13. Complete API route
14. Complete /ethos UI
15. Integrate with Catholic Text authentication/access
16. Run end-to-end golden demo validation
17. Deploy
```

Do not skip Step 5.

A polished interface built on retrieval that has not yet demonstrated parity would make later debugging substantially harder.

---

# Golden Demo

The current golden demonstration sequence is:

```text
Q16 → General Catholic connection
Q02 → Doctrine
Q04 → Scripture
Q03 → Saint
U10 → Virtue
U14 → Standard
S18 → Activity
U22 → Discussion
JQ21 → Family
NQ17 → Teacher preparation
```

Together, these demonstrate the broader Ethos product story:

```text
Topic
  ↓
Doctrine
  ↓
Scripture
  ↓
Saint
  ↓
Virtue
  ↓
Standard
  ↓
Activity
  ↓
Discussion
  ↓
Family
  ↓
Teacher preparation
```

The purpose is not to force teachers through this sequence. It demonstrates that the same underlying knowledge architecture can support multiple instructional needs.

---

# Production Philosophy

Ethos should ultimately make a sophisticated technical system feel simple.

The teacher should not need to know that a response required embeddings, graph traversal, authority weighting, intent scoring, contextual ranking, evidence construction, claim auditing, and repair.

The desired experience is simply:

> **I tell Ethos what I am teaching. Ethos helps me see the Catholic connections that actually belong there and gives me practical ways to use them.**

The technical architecture exists to make that experience reliable.

---

# Status

**Current retrieval baseline:** v2.7a  
**Reference implementation:** R  
**Production implementation:** TypeScript  
**Knowledge base:** Grade 8 reference system  
**Nodes:** 375  
**Edges:** 1,476  
**Embeddings:** 375 × 1,536  
**Embedding model:** `text-embedding-3-small`  
**Current migration boundary:** PostgreSQL access and initialization  
**Next major milestone:** 45/45 retrieval-parity tests passing

---

# Handoff Summary

For the developer continuing from the current repository:

> **Do not begin by rewriting retrieval.**

The application has already reached the database boundary.

The immediate task is to provide a real PostgreSQL connection, enable pgvector, create the Ethos database structures, import and verify the frozen knowledge base, and run the retrieval-parity suite.

The critical sequence is:

```text
Real DATABASE_URL
      ↓
PostgreSQL + pgvector
      ↓
Ethos schema
      ↓
375 nodes
1,476 edges
375 embeddings
      ↓
verifyEthosData.ts
      ↓
retrieval.test.ts
      ↓
45 passed / 0 failed
      ↓
Freeze production retrieval v2.7a
      ↓
Continue the complete Ethos reasoning pipeline
```

Once retrieval parity is established, development can safely proceed into synthesis, grounding, claim auditing, UI integration, and production deployment.
