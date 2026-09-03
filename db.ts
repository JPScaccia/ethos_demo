// lib/db.ts

import { PrismaClient, Prisma } from "@prisma/client";


/* ============================================================
   ETHOS DATABASE CLIENT
   ============================================================

   Provides a single shared Prisma client for the application.

   IMPORTANT:
   Do not create a new PrismaClient inside individual API routes
   or retrieval functions. Import `db` from this module instead.

   This singleton pattern prevents excessive database connections
   during Next.js development hot reloads and helps keep database
   access consistent throughout the application.
   ============================================================ */


const globalForPrisma = globalThis as unknown as {
  ethosPrisma?: PrismaClient;
};


export const db =
  globalForPrisma.ethosPrisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["warn", "error"]
        : ["error"]
  });


if (process.env.NODE_ENV !== "production") {
  globalForPrisma.ethosPrisma = db;
}


/* ============================================================
   DATABASE ERROR
   ============================================================ */

export class EthosDatabaseError extends Error {
  public readonly code?: string;

  public readonly cause?: unknown;

  constructor(
    message: string,
    options?: {
      code?: string;
      cause?: unknown;
    }
  ) {
    super(message);

    this.name = "EthosDatabaseError";
    this.code = options?.code;
    this.cause = options?.cause;
  }
}


/* ============================================================
   ERROR NORMALIZATION
   ============================================================ */

export function normalizeDatabaseError(
  error: unknown
): EthosDatabaseError {

  if (
    error instanceof
    Prisma.PrismaClientKnownRequestError
  ) {
    return new EthosDatabaseError(
      "Ethos database request failed.",
      {
        code: error.code,
        cause: error
      }
    );
  }

  if (
    error instanceof
    Prisma.PrismaClientInitializationError
  ) {
    return new EthosDatabaseError(
      "Ethos could not connect to the database.",
      {
        code: error.errorCode ?? undefined,
        cause: error
      }
    );
  }

  if (error instanceof Error) {
    return new EthosDatabaseError(
      error.message,
      {
        cause: error
      }
    );
  }

  return new EthosDatabaseError(
    "An unknown Ethos database error occurred.",
    {
      cause: error
    }
  );
}


/* ============================================================
   SAFE DATABASE OPERATION WRAPPER
   ============================================================ */

export async function withDatabase<T>(
  operation: () => Promise<T>
): Promise<T> {

  try {
    return await operation();
  } catch (error) {
    throw normalizeDatabaseError(error);
  }
}


/* ============================================================
   HEALTH CHECK
   ============================================================ */

export async function checkDatabaseConnection(): Promise<boolean> {

  try {
    await db.$queryRaw`SELECT 1`;

    return true;
  } catch (error) {
    console.error(
      "Ethos database health check failed:",
      normalizeDatabaseError(error)
    );

    return false;
  }
}


/* ============================================================
   DATABASE COUNTS
   ============================================================ */

export interface EthosDatabaseCounts {
  nodes: number;
  edges: number;
  embeddings: number;
}


export async function getDatabaseCounts():
  Promise<EthosDatabaseCounts> {

  return withDatabase(async () => {

    const [
      nodes,
      edges,
      embeddings
    ] = await Promise.all([
      db.node.count(),
      db.edge.count(),
      db.embedding.count()
    ]);

    return {
      nodes,
      edges,
      embeddings
    };
  });
}


/* ============================================================
   DATABASE VERIFICATION
   ============================================================ */

export interface EthosDatabaseVerification {
  connected: boolean;

  nodes: number;

  edges: number;

  embeddings: number;

  expectedNodes: number;

  expectedEdges: number;

  expectedEmbeddings: number;

  valid: boolean;
}


export async function verifyEthosDatabase():
  Promise<EthosDatabaseVerification> {

  const connected =
    await checkDatabaseConnection();

  if (!connected) {
    return {
      connected: false,
      nodes: 0,
      edges: 0,
      embeddings: 0,
      expectedNodes: 375,
      expectedEdges: 1476,
      expectedEmbeddings: 375,
      valid: false
    };
  }

  const counts =
    await getDatabaseCounts();

  const valid =
    counts.nodes === 375 &&
    counts.edges === 1476 &&
    counts.embeddings === 375;

  return {
    connected: true,

    ...counts,

    expectedNodes: 375,
    expectedEdges: 1476,
    expectedEmbeddings: 375,

    valid
  };
}


/* ============================================================
   SHUTDOWN

   Do not call this after individual web requests.

   It is intended for:
   - scripts
   - tests
   - controlled process shutdown
   ============================================================ */

export async function disconnectDatabase():
  Promise<void> {

  try {
    await db.$disconnect();
  } catch (error) {
    console.error(
      "Error disconnecting Ethos database:",
      normalizeDatabaseError(error)
    );
  }
}
