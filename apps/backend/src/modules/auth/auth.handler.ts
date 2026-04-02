import * as schemaMysql from "../../db/schema.mysql";
import * as schemaSqlite from "../../db/schema.sqlite";

export const createAuthHandler = (db: any) => {
  const isStandalone = process.env.STANDALONE === "true";
  return {
    async getIdentity(_req: unknown) {
      const usersTable = isStandalone ? schemaSqlite.users : schemaMysql.users;
      const result = await db.select().from(usersTable).limit(1);
      if (!result || result.length === 0) {
        return { user: { id: "user-1", email: "seed@tasker", name: "Seed Admin", avatarUrl: "", createdAt: new Date().toISOString() } };
      }
      const u = result[0];
      return { user: { ...u, createdAt: u.createdAt instanceof Date ? u.createdAt.toISOString() : u.createdAt } };
    },
  };
};
