import { AuthService } from "shared-contract/gen/ts/tasker/health/v1/health_pb";
import { setupDatabase } from "../../db/db";
import * as schemaMysql from "../../db/schema.mysql";
import * as schemaSqlite from "../../db/schema.sqlite";

const isStandalone = process.env.STANDALONE === "true";
const db = await setupDatabase(isStandalone ? "sqlite" : "mysql");

export const authHandler = {
  async getIdentity(req: any) {
    const usersTable = isStandalone ? schemaSqlite.users : schemaMysql.users;
    const result = await (db as any).select().from(usersTable).limit(1);
    if (!result || result.length === 0) {
       return { user: { id: "user-1", email: "seed@tasker", name: "Seed Admin", avatarUrl: "", createdAt: new Date().toISOString() } };
    }
    const u = result[0];
    return { user: { ...u, createdAt: u.createdAt instanceof Date ? u.createdAt.toISOString() : u.createdAt } };
  }
};
