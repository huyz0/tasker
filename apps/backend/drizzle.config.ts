import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.mysql.ts",
  out: "./drizzle",
  dialect: "mysql",
  dbCredentials: {
    url: "mysql://root:password@127.0.0.1:3306/tasker"
  }
});
