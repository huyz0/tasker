import { expect, test, describe, beforeAll } from "bun:test";
import { Code } from "@connectrpc/connect";
import { createContextValues } from "@connectrpc/connect";
import { setupIntegrationTest, makeAuthContext, seedOrgWithAdmin, seedUser, seedProject } from "../../test/setup";
import * as schema from "../../db/schema.sqlite";
import { currentPrincipalKey, type Principal } from "../auth/session";
import { createMemoryHandler } from "./memory.handler";

const makeAgentContext = (principal: Principal) => {
  const values = createContextValues();
  values.set(currentPrincipalKey, principal);
  return { values } as any;
};

describe("Memory Handler Integration Logic", () => {
  let db: any;
  let handler: any;
  let ctx: any;
  let memberCtx: any;
  let viewerCtx: any;

  const orgId = "org-memory-test";
  const adminUserId = "user-memory-admin";
  const memberUserId = "user-memory-member";
  const viewerUserId = "user-memory-viewer";
  const templateId = "tmpl-memory-test";
  const projectId = "proj-memory-test";
  const teamId = "team-memory-test";
  const agentRoleId = "arole-memory-test";
  const agentId = "agent-memory-test";

  const agentCtx = (scopes: string[]) => makeAgentContext({ kind: "agent", agentId, orgId, tokenId: "tok-memory-test", scopes });

  beforeAll(async () => {
    const setup = await setupIntegrationTest();
    db = setup.db;
    handler = createMemoryHandler(db, setup.nc);

    await seedOrgWithAdmin(db, { orgId, userId: adminUserId });
    await seedProject(db, { orgId, userId: adminUserId, templateId, projectId });
    await db.insert(schema.teams).values({ id: teamId, orgId, name: "T", createdAt: new Date() });

    await seedUser(db, memberUserId);
    await db.insert(schema.organizationMembers).values({ orgId, userId: memberUserId, role: "member", joinedAt: new Date() });
    await seedUser(db, viewerUserId);
    await db.insert(schema.organizationMembers).values({ orgId, userId: viewerUserId, role: "viewer", joinedAt: new Date() });

    await db.insert(schema.agentRoles).values({ id: agentRoleId, orgId, name: "R", systemPrompt: "p", capabilities: "[]", createdAt: new Date() });
    await db.insert(schema.agents).values({ id: agentId, orgId, agentRoleId, name: "A", createdAt: new Date() });

    ctx = makeAuthContext(adminUserId);
    memberCtx = makeAuthContext(memberUserId);
    viewerCtx = makeAuthContext(viewerUserId);
  });

  test("recordBelief records a project-scoped belief with user provenance", async () => {
    const res: any = await handler.recordBelief({ orgId, scopeType: "project", scopeId: projectId, statement: "Prefer bun over npm" }, ctx);
    expect(res.belief.statement).toBe("Prefer bun over npm");
    expect(res.belief.scopeType).toBe("project");
    expect(res.belief.scopeId).toBe(projectId);
    expect(res.belief.sourceKind).toBe("user");
    expect(res.belief.sourceUserId).toBe(adminUserId);
    expect(res.belief.sourceAgentId).toBeUndefined();
    expect(res.belief.confidence).toBe("medium");
    expect(res.belief.status).toBe("active");
    expect(res.belief.embedding).toEqual([]);
    expect(typeof res.belief.createdAt).toBe("string");
  });

  test("recordBelief derives agent provenance from the token, not the request body", async () => {
    const res: any = await handler.recordBelief(
      { orgId, scopeType: "project", scopeId: projectId, statement: "Agent-recorded fact" },
      agentCtx(["memory:write"]),
    );
    expect(res.belief.sourceKind).toBe("agent");
    expect(res.belief.sourceAgentId).toBe(agentId);
    expect(res.belief.sourceUserId).toBeUndefined();
  });

  test("recordBelief rejects an orgId that doesn't match scopeId's resolved organization", async () => {
    await expect(
      handler.recordBelief({ orgId: "org-wrong", scopeType: "project", scopeId: projectId, statement: "x" }, ctx),
    ).rejects.toMatchObject({ code: Code.InvalidArgument });
  });

  test("recordBelief denies a viewer (memory:read only)", async () => {
    await expect(
      handler.recordBelief({ orgId, scopeType: "project", scopeId: projectId, statement: "x" }, viewerCtx),
    ).rejects.toMatchObject({ code: Code.PermissionDenied });
  });

  test("recordBelief denies an agent token missing memory:write", async () => {
    await expect(
      handler.recordBelief({ orgId, scopeType: "project", scopeId: projectId, statement: "x" }, agentCtx(["memory:read"])),
    ).rejects.toMatchObject({ code: Code.PermissionDenied });
  });

  test("team-scoped belief does not climb to the org - an org admin with no team standing is denied", async () => {
    // `can()`'s ancestor-climbing (lib/policy.ts) only adds project->org and
    // org->ancestor-org edges, deliberately not team->org - the same user
    // whose org 'admin' role reaches every project in this suite's other
    // tests has no standing at team scope at all without a team-scoped (or
    // team-membership-derived) grant of their own.
    await expect(
      handler.recordBelief({ orgId, scopeType: "team", scopeId: teamId, statement: "team fact" }, ctx),
    ).rejects.toMatchObject({ code: Code.PermissionDenied });
  });

  test("team-scoped belief succeeds for a user holding a direct team-scoped grant", async () => {
    const teamMemberUserId = "user-memory-team-member";
    await seedUser(db, teamMemberUserId);
    await db.insert(schema.grants).values({
      id: "grant-memory-team-test",
      subjectType: "user",
      subjectId: teamMemberUserId,
      scopeType: "team",
      scopeId: teamId,
      roleId: "role-member",
      createdAt: new Date(),
    });
    const res: any = await handler.recordBelief(
      { orgId, scopeType: "team", scopeId: teamId, statement: "team fact" },
      makeAuthContext(teamMemberUserId),
    );
    expect(res.belief.scopeType).toBe("team");
    expect(res.belief.scopeId).toBe(teamId);
  });

  test("getBelief returns a belief a viewer can read", async () => {
    const created: any = await handler.recordBelief({ orgId, scopeType: "project", scopeId: projectId, statement: "Readable" }, ctx);
    const res: any = await handler.getBelief({ id: created.belief.id }, viewerCtx);
    expect(res.belief.id).toBe(created.belief.id);
  });

  test("getBelief on a nonexistent id throws NotFound", async () => {
    await expect(handler.getBelief({ id: "blf-nope" }, ctx)).rejects.toMatchObject({ code: Code.NotFound });
  });

  test("listBeliefs filters by status and confidence", async () => {
    await handler.recordBelief({ orgId, scopeType: "project", scopeId: projectId, statement: "High conf", confidence: "high" }, ctx);
    const res: any = await handler.listBeliefs({ scopeType: "project", scopeId: projectId, confidence: "high" }, ctx);
    expect(res.beliefs.length).toBeGreaterThan(0);
    expect(res.beliefs.every((b: any) => b.confidence === "high")).toBe(true);
  });

  test("updateBelief updates only the fields the caller provided", async () => {
    const created: any = await handler.recordBelief(
      { orgId, scopeType: "project", scopeId: projectId, statement: "original statement", confidence: "low" },
      ctx,
    );
    const res: any = await handler.updateBelief({ id: created.belief.id, confidence: "high" }, ctx);
    expect(res.belief.statement).toBe("original statement");
    expect(res.belief.confidence).toBe("high");
  });

  test("searchBeliefs finds a matching statement and excludes superseded results by default", async () => {
    const created: any = await handler.recordBelief(
      { orgId, scopeType: "project", scopeId: projectId, statement: "zephyr-unique-marker one" },
      ctx,
    );
    const found: any = await handler.searchBeliefs({ scopeType: "project", scopeId: projectId, query: "zephyr-unique-marker" }, ctx);
    expect(found.beliefs.some((b: any) => b.id === created.belief.id)).toBe(true);

    const superseded: any = await handler.supersedeBelief(
      { id: created.belief.id, statement: "zephyr-unique-marker two, corrected" },
      ctx,
    );
    expect(superseded.belief.supersedesBeliefId).toBe(created.belief.id);

    const afterSupersede: any = await handler.searchBeliefs({ scopeType: "project", scopeId: projectId, query: "zephyr-unique-marker" }, ctx);
    expect(afterSupersede.beliefs.some((b: any) => b.id === created.belief.id)).toBe(false);
    expect(afterSupersede.beliefs.some((b: any) => b.id === superseded.belief.id)).toBe(true);

    const oldBelief: any = await handler.getBelief({ id: created.belief.id }, ctx);
    expect(oldBelief.belief.status).toBe("superseded");
  });

  test("searchBeliefs returns a specific status when explicitly requested", async () => {
    const created: any = await handler.recordBelief({ orgId, scopeType: "project", scopeId: projectId, statement: "xenon-marker-term" }, ctx);
    await handler.supersedeBelief({ id: created.belief.id, statement: "xenon-marker-term updated" }, ctx);
    const supersededOnly: any = await handler.searchBeliefs(
      { scopeType: "project", scopeId: projectId, query: "xenon-marker-term", status: "superseded" },
      ctx,
    );
    expect(supersededOnly.beliefs.some((b: any) => b.id === created.belief.id)).toBe(true);
  });

  test("searchBeliefs returns no results for a query with no matchable tokens", async () => {
    const res: any = await handler.searchBeliefs({ scopeType: "project", scopeId: projectId, query: "???" }, ctx);
    expect(res.beliefs).toEqual([]);
  });

  test("promoteBelief moves a belief to a wider scope and records an audit entry", async () => {
    const created: any = await handler.recordBelief({ orgId, scopeType: "project", scopeId: projectId, statement: "promote me" }, ctx);
    const res: any = await handler.promoteBelief(
      { id: created.belief.id, toScopeType: "organization", toScopeId: orgId, note: "widely useful" },
      ctx,
    );
    expect(res.belief.scopeType).toBe("organization");
    expect(res.belief.scopeId).toBe(orgId);
    expect(res.belief.promotedFromScopeType).toBe("project");
    expect(res.belief.promotedFromScopeId).toBe(projectId);
    expect(res.belief.promotedBy).toBe(adminUserId);
    expect(res.promotion.fromScopeType).toBe("project");
    expect(res.promotion.toScopeType).toBe("organization");
    expect(res.promotion.note).toBe("widely useful");

    const promotions: any = await handler.listBeliefPromotions({ beliefId: created.belief.id }, ctx);
    expect(promotions.promotions.length).toBe(1);
    expect(promotions.promotions[0].id).toBe(res.promotion.id);
  });

  test("promoteBelief denies a member (holds memory:write but not memory:admin)", async () => {
    const created: any = await handler.recordBelief({ orgId, scopeType: "project", scopeId: projectId, statement: "cannot promote" }, ctx);
    await expect(
      handler.promoteBelief({ id: created.belief.id, toScopeType: "organization", toScopeId: orgId }, memberCtx),
    ).rejects.toMatchObject({ code: Code.PermissionDenied });
  });

  test("promoteBelief refuses an agent token categorically - memory:admin has no token form", async () => {
    const created: any = await handler.recordBelief({ orgId, scopeType: "project", scopeId: projectId, statement: "agent cannot promote" }, ctx);
    await expect(
      handler.promoteBelief(
        { id: created.belief.id, toScopeType: "organization", toScopeId: orgId },
        agentCtx(["memory:read", "memory:write"]),
      ),
    ).rejects.toMatchObject({ code: Code.PermissionDenied });
  });

  test("relateBeliefs links two beliefs; listBeliefRelations sees it from either side; unrelateBeliefs removes it", async () => {
    const a: any = await handler.recordBelief({ orgId, scopeType: "project", scopeId: projectId, statement: "belief A" }, ctx);
    const b: any = await handler.recordBelief({ orgId, scopeType: "project", scopeId: projectId, statement: "belief B" }, ctx);
    const rel: any = await handler.relateBeliefs({ beliefAId: a.belief.id, beliefBId: b.belief.id, relationType: "supports" }, ctx);
    expect(rel.relation.relationType).toBe("supports");

    const fromA: any = await handler.listBeliefRelations({ beliefId: a.belief.id }, ctx);
    expect(fromA.relations.some((r: any) => r.id === rel.relation.id)).toBe(true);
    const fromB: any = await handler.listBeliefRelations({ beliefId: b.belief.id }, ctx);
    expect(fromB.relations.some((r: any) => r.id === rel.relation.id)).toBe(true);

    await handler.unrelateBeliefs({ relationId: rel.relation.id }, ctx);
    const afterUnrelate: any = await handler.listBeliefRelations({ beliefId: a.belief.id }, ctx);
    expect(afterUnrelate.relations.some((r: any) => r.id === rel.relation.id)).toBe(false);
  });

  test("relateBeliefs rejects relating a belief to itself", async () => {
    const a: any = await handler.recordBelief({ orgId, scopeType: "project", scopeId: projectId, statement: "self" }, ctx);
    await expect(
      handler.relateBeliefs({ beliefAId: a.belief.id, beliefBId: a.belief.id, relationType: "relates_to" }, ctx),
    ).rejects.toMatchObject({ code: Code.InvalidArgument });
  });

  test("archiveBelief then restoreBelief round-trips", async () => {
    const created: any = await handler.recordBelief({ orgId, scopeType: "project", scopeId: projectId, statement: "archivable" }, ctx);
    await handler.archiveBelief({ id: created.belief.id }, ctx);
    const archived: any = await handler.getBelief({ id: created.belief.id }, ctx);
    expect(archived.belief.deletedAt).toBeTruthy();

    await handler.restoreBelief({ id: created.belief.id }, ctx);
    const restored: any = await handler.getBelief({ id: created.belief.id }, ctx);
    expect(restored.belief.deletedAt).toBeUndefined();
  });

  test("archiveBelief denies a member (holds memory:write but not memory:admin)", async () => {
    const created: any = await handler.recordBelief({ orgId, scopeType: "project", scopeId: projectId, statement: "member cannot archive" }, ctx);
    await expect(handler.archiveBelief({ id: created.belief.id }, memberCtx)).rejects.toMatchObject({ code: Code.PermissionDenied });
  });

  test("archiveBelief refuses an agent token categorically, regardless of scopes held", async () => {
    const created: any = await handler.recordBelief({ orgId, scopeType: "project", scopeId: projectId, statement: "agent cannot archive" }, ctx);
    await expect(
      handler.archiveBelief({ id: created.belief.id }, agentCtx(["memory:read", "memory:write"])),
    ).rejects.toMatchObject({ code: Code.PermissionDenied });
  });

  test("purgeBelief requires the belief be archived first", async () => {
    const created: any = await handler.recordBelief({ orgId, scopeType: "project", scopeId: projectId, statement: "not yet archived" }, ctx);
    await expect(handler.purgeBelief({ id: created.belief.id }, ctx)).rejects.toMatchObject({ code: Code.FailedPrecondition });
  });

  test("purgeBelief clears dangling supersedesBeliefId/relations/promotions before removing the row", async () => {
    const original: any = await handler.recordBelief({ orgId, scopeType: "project", scopeId: projectId, statement: "will be purged" }, ctx);
    const superseding: any = await handler.supersedeBelief({ id: original.belief.id, statement: "supersedes the purged one" }, ctx);
    const other: any = await handler.recordBelief({ orgId, scopeType: "project", scopeId: projectId, statement: "related to the purged one" }, ctx);
    const rel: any = await handler.relateBeliefs({ beliefAId: original.belief.id, beliefBId: other.belief.id, relationType: "relates_to" }, ctx);
    await handler.promoteBelief({ id: original.belief.id, toScopeType: "organization", toScopeId: orgId }, ctx);

    await handler.archiveBelief({ id: original.belief.id }, ctx);
    await handler.purgeBelief({ id: original.belief.id }, ctx);

    await expect(handler.getBelief({ id: original.belief.id }, ctx)).rejects.toMatchObject({ code: Code.NotFound });
    await expect(handler.listBeliefPromotions({ beliefId: original.belief.id }, ctx)).rejects.toMatchObject({ code: Code.NotFound });

    // The belief that superseded it must not be left pointing at a purged id.
    const supersedingAfter: any = await handler.getBelief({ id: superseding.belief.id }, ctx);
    expect(supersedingAfter.belief.supersedesBeliefId).toBeUndefined();

    // Its relation must not survive it either.
    const relationsAfter: any = await handler.listBeliefRelations({ beliefId: other.belief.id }, ctx);
    expect(relationsAfter.relations.some((r: any) => r.id === rel.relation.id)).toBe(false);
  });
});
