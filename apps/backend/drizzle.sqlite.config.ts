import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./schema.sqlite.ts",
  out: "./migrations/sqlite",
  dialect: "sqlite",
  dbCredentials: { url: ".sqlite" }
});
