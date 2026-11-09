import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import crypto from "node:crypto";
import { createRepositoriesHandler } from "./repositories.handler";
import * as schemaSqlite from "../../db/schema.sqlite";
import { createContextValues } from "@connectrpc/connect";
import { currentUserIdKey } from "../auth/session";
import { encryptToken } from "../../lib/crypto";
import { setupIntegrationTest, seedOrgWithAdmin, seedProject } from "../../test/setup";

const runIntegration = process.env.TASKER_REAL_INTEGRATION === "1";
const testIf = runIntegration ? describe : describe.skip;

const TEST_USER_ID = "integration-test-user";
const TEST_ORG_ID = "integration-test-org";
const TEST_PROJECT_ID = "dummy-project";

const ctx = (() => {
  const contextValues = createContextValues();
  contextValues.set(currentUserIdKey, TEST_USER_ID);
  return { values: contextValues } as any;
})();

testIf("Real GitHub Integration: Repositories", () => {
  let handler: ReturnType<typeof createRepositoriesHandler>;
  let executionId: string;
  let sandboxRepo: string;
  let testToken: string;
  // listDeployments (repositories.handler.ts:443) cross-validates that
  // `buildId`'s real head commit sha matches the given `commitSha` - a
  // deliberate anti-spoofing check, not something this test can route around
  // with placeholder values like the literal string "main". Resolved in
  // beforeAll from the sandbox repo's own most recent workflow run, so the
  // pair is guaranteed to correspond; null if the sandbox has no runs at all.
  let latestBuildId: string | null = null;
  let latestCommitSha: string | null = null;

  let db: any;
  const originalStandalone = process.env.STANDALONE;

  beforeAll(async () => {
    // Unique ID for this test run to prevent collision
    executionId = `testrun-${Date.now()}-${crypto.randomUUID().substring(0, 8)}`;
    sandboxRepo = process.env.GITHUB_TEST_REPO || "huyz0/tasker-test-sandbox";
    testToken = process.env.GITHUB_TEST_TOKEN || "";

    if (!testToken) {
      throw new Error("GITHUB_TEST_TOKEN is required for integration tests");
    }

    // Keep the provider real and exercise the managed write transaction too.
    ({ db } = await setupIntegrationTest());
    await seedOrgWithAdmin(db, { orgId: TEST_ORG_ID, userId: TEST_USER_ID });
    await seedProject(db, { orgId: TEST_ORG_ID, userId: TEST_USER_ID, templateId: "integration-template", projectId: TEST_PROJECT_ID });
    await db.insert(schemaSqlite.repositoryLinks).values({
      id: `link-${executionId}`, projectId: TEST_PROJECT_ID, provider: "github",
      remoteName: sandboxRepo, accessTokenEncrypted: encryptToken(testToken), createdAt: new Date(),
    });
    handler = createRepositoriesHandler(db);

    // Resolve a real (run id, head sha) pair - see latestBuildId's own
    // comment above for why this can't just be made up.
    try {
      const runsResponse = await fetch(
        `https://api.github.com/repos/${sandboxRepo}/actions/runs?per_page=1`,
        {
          headers: {
            Authorization: `Bearer ${testToken}`,
            Accept: "application/vnd.github.v3+json",
            "User-Agent": "Tasker-Agent-Integration-Test",
          },
        }
      );
      if (runsResponse.ok) {
        const runsData = await runsResponse.json() as any;
        const latestRun = runsData.workflow_runs?.[0];
        if (latestRun) {
          latestBuildId = String(latestRun.id);
          latestCommitSha = latestRun.head_sha;
        }
      }
    } catch (e) {
      console.error("Failed to resolve a real workflow run for the listDeployments check:", e);
    }
  });

  afterAll(() => {
    db?.$client.close();
    if (originalStandalone === undefined) delete process.env.STANDALONE;
    else process.env.STANDALONE = originalStandalone;
  });

  it("should fetch real workflow runs via listBuilds proxy", async () => {
    // We attempt to list builds. The sandbox repo must exist and have at least one workflow run
    // or return an empty array if none exist, but the request itself should succeed.
    const response = await handler.listBuilds({
      repositoryLinkId: `link-${executionId}`,
    }, ctx);

    expect(response).toHaveProperty("builds");
    expect(Array.isArray(response.builds)).toBe(true);

    if (response.builds.length > 0) {
      const build = response.builds[0];
      expect(build).toHaveProperty("id");
      expect(build).toHaveProperty("status");
      expect(build).toHaveProperty("commitSha");
      expect(build).toHaveProperty("createdAt");
    }
  });

  it("should fetch real deployments for the sandbox repo's default branch commit via listDeployments proxy", async () => {
    if (!latestBuildId || !latestCommitSha) {
      // No workflow runs exist in the sandbox repo, so there is no real
      // (buildId, commitSha) pair to test against - listDeployments' own
      // anti-spoofing check would reject any pair this test made up (see
      // latestBuildId's comment above). Nothing meaningful to assert.
      console.warn(
        "No workflow runs found in sandbox repo; skipping listDeployments round-trip check."
      );
      return;
    }

    // The sandbox repo may have zero deployments for this sha - that's fine,
    // we're verifying the real GitHub API round-trip (auth, URL construction,
    // status lookup) succeeds, not that deployments exist.
    const response = await handler.listDeployments({
      buildId: latestBuildId,
      repositoryLinkId: `link-${executionId}`,
      commitSha: latestCommitSha,
    }, ctx);

    expect(response).toHaveProperty("deployments");
    expect(Array.isArray(response.deployments)).toBe(true);

    if (response.deployments.length > 0) {
      const deployment = response.deployments[0];
      expect(deployment).toHaveProperty("id");
      expect(deployment).toHaveProperty("environment");
      expect(deployment).toHaveProperty("status");
      expect(deployment).toHaveProperty("createdAt");
    }
  });

  it("should synchronize real pull requests", async () => {
    // The sandbox is read-only: synchronize its existing PRs into owned SQL.
    const req = { projectId: TEST_PROJECT_ID };
    const response = await handler.syncPullRequests(req, ctx);

    expect(response.success).toBe(true);
    const persisted = await db.select().from(schemaSqlite.remotePullRequests);
    expect(persisted.every((pr: any) => pr.repositoryLinkId === `link-${executionId}`)).toBe(true);
    const firstIds = persisted.map((pr: any) => pr.id).sort();
    expect((await handler.syncPullRequests(req, ctx)).success).toBe(true);
    const repeated = await db.select().from(schemaSqlite.remotePullRequests);
    // New remote PRs may arrive between reads; existing identities stay stable.
    expect(repeated.map((pr: any) => pr.id)).toEqual(expect.arrayContaining(firstIds));
    expect(new Set(repeated.map((pr: any) => pr.remotePrId)).size).toBe(repeated.length);
  });
});
