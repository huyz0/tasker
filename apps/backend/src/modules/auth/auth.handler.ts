import { eq } from "drizzle-orm";
import * as schemaMysql from "../../db/schema.mysql";
import * as schemaSqlite from "../../db/schema.sqlite";
import { currentUserIdKey } from "./session";

export const createAuthHandler = (db: any) => {
  const isStandalone = process.env.STANDALONE === "true";
  return {
    async getIdentity(_req: unknown, { contextValues }: { contextValues: any }) {
      const usersTable = isStandalone ? schemaSqlite.users : schemaMysql.users;
      const currentUserId = contextValues?.get(currentUserIdKey);

      const result = currentUserId
        ? await db.select().from(usersTable).where(eq(usersTable.id, currentUserId)).limit(1)
        : await db.select().from(usersTable).limit(1);

      if (!result || result.length === 0) {
        return { user: { id: "user-1", email: "seed@tasker", name: "Seed Admin", avatarUrl: "", createdAt: new Date().toISOString() } };
      }
      const u = result[0];
      return { user: { ...u, createdAt: u.createdAt instanceof Date ? u.createdAt.toISOString() : u.createdAt } };
    },
  };
};
