import { eq } from "drizzle-orm";
import * as schemaMysql from "../db/schema.mysql";
import * as schemaSqlite from "../db/schema.sqlite";

function revokedSessionsTable() {
  return process.env.STANDALONE === "true" ? schemaSqlite.revokedSessions : schemaMysql.revokedSessions;
}

export async function revokeSession(db: any, jti: string, userId: string): Promise<void> {
  const table = revokedSessionsTable();
  try {
    await db.insert(table).values({ jti, userId, revokedAt: new Date() });
  } catch {
    // Already revoked (duplicate jti) - revoking twice is a no-op, not an error.
  }
}

export async function isSessionRevoked(db: any, jti: string): Promise<boolean> {
  const table = revokedSessionsTable();
  const rows = await db.select().from(table).where(eq((table as any).jti, jti)).limit(1);
  return rows.length > 0;
}
