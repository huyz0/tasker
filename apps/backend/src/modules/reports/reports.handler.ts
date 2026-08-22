import type { ConnectRouter } from "@connectrpc/connect";
import { ConnectError, Code } from "@connectrpc/connect";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { ReportService } from "shared-contract/gen/ts/tasker/health/v1/health_pb";
import * as schema from "../../db/schema.sqlite";
import { requireUser } from "../../lib/authz";
import { assertCan } from "../../lib/policy";
import { buildReportExceptions } from "./exceptions";

/**
 * M24-T05 - the Reports screen's exception panels, in one call.
 *
 * Where the Dashboard answers "what needs me right now", this answers "how is
 * work performed in this project, and are the agents carrying it?". This file
 * is the thin service layer - registration, authentication, validation and
 * tenancy only; the panel aggregations live in `exceptions.ts`/`scorecard.ts`
 * (and M24-T06's trends will live in a `trends.ts` sibling).
 *
 * `requireUser`, not `requirePrincipal`: an on-the-loop monitoring surface is
 * a human's. Refusing agents outright is also what keeps both methods out of
 * the agent scope map - absence there means denial, and the sweep checks that
 * every method is one or the other.
 */

const GetReportExceptionsSchema = z.object({
  projectId: z.string().min(1, "projectId is required"),
  // Fixed menu, matching the GUI's window selector. Rejected rather than
  // clamped: an unknown window is a caller bug, and silently answering a
  // different question than asked is worse than saying no.
  windowDays: z.union([z.literal(7), z.literal(30), z.literal(90)], {
    errorMap: () => ({ message: "windowDays must be one of 7, 30, 90" }),
  }),
});

export default (router: ConnectRouter, db: any) => {
  const isStandalone = process.env.STANDALONE === "true";

  router.service(ReportService as any, {
    async getReportExceptions(req: any, { values: contextValues }: { values: any }) {
      // Structural agent refusal FIRST - before validation, matching the
      // dashboard, so the scope sweep's minimal request still hits it.
      const userId = requireUser(contextValues);

      // api-standard §3/§8: Zod at the boundary, surfaced as InvalidArgument.
      const parsedResult = GetReportExceptionsSchema.safeParse(req);
      if (!parsedResult.success) {
        throw new ConnectError(
          parsedResult.error.issues[0]?.message ?? "invalid request",
          Code.InvalidArgument,
        );
      }
      const parsed = parsedResult.data;

      // Tenancy resolves through the project's org (security-standard §3): the
      // project is looked up before authorization so an archived/unknown id is
      // NotFound, and assertCan on the *project* scope lets can() climb to the
      // owning organization itself (policy.ts resolves project → org).
      const { projects } = schema;
      const projectRows = await db
        .select()
        .from(projects)
        .where(and(eq(projects.id, parsed.projectId), isNull(projects.deletedAt)))
        .limit(1);
      if (!projectRows || projectRows.length === 0) {
        throw new ConnectError("project not found", Code.NotFound);
      }
      const orgId: string = projectRows[0].orgId;
      await assertCan(db, { kind: "user", userId }, { type: "project", id: parsed.projectId }, "dashboard:read");

      return buildReportExceptions(db, isStandalone, {
        projectId: parsed.projectId,
        orgId,
        windowDays: parsed.windowDays,
      });
    },

    /**
     * M24-T06's RPC. Stubbed so the service registers whole against the
     * generated contract; `requireUser` runs FIRST so the agent-scope sweep's
     * structural denial holds even for the stub.
     */
    async getReportTrends(_req: any, { values: contextValues }: { values: any }) {
      requireUser(contextValues);
      throw new ConnectError("getReportTrends is not implemented yet (M24-T06)", Code.Unimplemented);
    },
  });
};
