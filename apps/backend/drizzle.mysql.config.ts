import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./schema.mysql.ts",
  out: "./migrations/mysql",
  dialect: "mysql",
  dbCredentials: { url: "mysql://root:password@127.0.0.1:3306/tasker" }
});
