import * as schemaMysql from "../../db/schema.mysql";
import * as schemaSqlite from "../../db/schema.sqlite";
import { eq } from "drizzle-orm";

export const createAgentsHandler = (db: any, nc: any = null) => {
  const isStandalone = process.env.STANDALONE === "true";
  return {
    async createAgentRole(req: any) {
      const roles = isStandalone ? schemaSqlite.agentRoles : schemaMysql.agentRoles;
      const newId = "ar-" + Date.now().toString();
      const payload = {
        id: newId,
        name: req.name,
        systemPrompt: req.systemPrompt,
        capabilities: req.capabilities,
      };

      await db.insert(roles).values(payload);

      return { role: payload };
    },
    async createAgent(req: any) {
      const agents = isStandalone ? schemaSqlite.agents : schemaMysql.agents;
      const newId = "ag-" + Date.now().toString();
      const payload = {
        id: newId,
        orgId: req.orgId,
        agentRoleId: req.agentRoleId,
        name: req.name,
      };

      await db.insert(agents).values(payload);

      if (nc) nc.publish("domain.agent.created", Buffer.from(JSON.stringify(payload)));
      return { agent: payload };
    }
  };
};
