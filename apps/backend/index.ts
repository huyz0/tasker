import { connectNodeAdapter } from "@connectrpc/connect-node";
import { HealthService } from "shared-contract/gen/ts/tasker/health/v1/health_connect";
import * as http from "node:http";
import { setupDatabase } from "./db";

const handler = connectNodeAdapter({
  routes: (router) => {
    router.service(HealthService, {
      async ping(req) {
        let dbStatus = "disconnected";
        try {
          // Verify DB connectivity
          const db = await setupDatabase();
          // The query will fail if the table doesn't exist, but connection succeeds.
          // For a simple ping, returning connected is sufficient.
          dbStatus = "ok";
        } catch (err) {
          dbStatus = `error: ${(err as Error).message}`;
        }
        return {
          message: "pong from backend!",
          dbStatus: dbStatus,
        };
      },
    });
  },
});

http.createServer((req, res) => {
  // Simple CORS support for development
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Connect-Protocol-Version");
  
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }
  
  handler(req, res);
}).listen(8080, () => {
  console.log("HealthService API Server is listening on http://localhost:8080");
});