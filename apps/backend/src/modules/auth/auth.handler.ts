import { eq } from "drizzle-orm";
import { ConnectError, Code } from "@connectrpc/connect";
import * as schemaMysql from "../../db/schema.mysql";
import * as schemaSqlite from "../../db/schema.sqlite";
import { requireUserId } from "../../lib/authz";

export const createAuthHandler = (db: any) => {
  const isStandalone = process.env.STANDALONE === "true";
  return {
    async getIdentity(_req: unknown, { values: contextValues }: { values: any }) {
      const currentUserId = requireUserId(contextValues);
      const usersTable = isStandalone ? schemaSqlite.users : schemaMysql.users;

      const result = await db.select().from(usersTable).where(eq(usersTable.id, currentUserId)).limit(1);
      if (!result || result.length === 0) {
        throw new ConnectError("user not found", Code.NotFound);
      }
      const u = result[0];
      return { user: { ...u, createdAt: u.createdAt instanceof Date ? u.createdAt.toISOString() : u.createdAt } };
    },
  };
};
