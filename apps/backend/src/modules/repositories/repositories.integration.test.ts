import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "node:crypto";
import { createRepositoriesHandler } from "./repositories.handler";
import * as schemaSqlite from "../../db/schema.sqlite";
import { createContextValues } from "@connectrpc/connect";
import { currentUserIdKey } from "../auth/session";

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

  // Dummy database interface that fakes just enough of each table the
  // handler + authz helpers touch (repositoryLinks, projects, organizationMembers)
  // to exercise the real GitHub API calls without a real DB.
  const mockDb = {
    select: () => ({
      from: (table: any) => ({
        where: () => {
          let rows: any[];
          if (table === schemaSqlite.repositoryLinks) {
            rows = [
              {
                id: `link-${executionId}`,
                projectId: TEST_PROJECT_ID,
                provider: "github",
                remoteName: sandboxRepo,
                // Normally this is encrypted, we mock it to decrypt to our real test token
                accessTokenEncrypted: mockEncrypt(testToken),
              },
            ];
          } else if (table === schemaSqlite.projects) {
            rows = [{ id: TEST_PROJECT_ID, orgId: TEST_ORG_ID }];
          } else if (table === schemaSqlite.organizationMembers) {
            rows = [{ orgId: TEST_ORG_ID, userId: TEST_USER_ID, role: "admin" }];
          } else if (table === schemaSqlite.rolePermissions) {
            // policy.ts's can() resolves the "admin" org-membership role to
            // 'role-admin' and then looks up *its* granted permission keys
            // here - without this, the organizationMembers row above still
            // resolves a role, but that role silently carries zero
            // permissions and every assertCan() call fails PermissionDenied
            // regardless of the caller's real role. Mirrors the real seeded
            // catalog (drizzle-sqlite/0034_seed_system_roles_and_migrate_
            // grants.sql): role-admin holds every *:read/*:write/*:admin
            // permission, so grant just the two this handler's RPCs check.
            rows = [
              { roleId: "role-admin", permissionKey: "repository:read" },
              { roleId: "role-admin", permissionKey: "repository:write" },
            ];
          } else {
            rows = [];
          }
          // authz.ts's getProjectOrgId/getRepositoryLinkOrgId chain a .limit(1)
          // after .where() - support that here so this fixture keeps working
          // as those helpers evolve, instead of just faking the query shape
          // this test happened to need when it was first written.
          return Object.assign(rows, { limit: (_n: number) => rows });
        },
      }),
    }),
  };

  function mockEncrypt(token: string): string {
    const ALGORITHM = "aes-256-gcm";
    const ENCRYPTION_KEY =
      process.env.APP_ENCRYPTION_SECRET || "00000000000000000000000000000000";
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(
      ALGORITHM,
      Buffer.from(ENCRYPTION_KEY, "utf8"),
      iv
    );
    let encrypted = cipher.update(token, "utf8", "hex");
    encrypted += cipher.final("hex");
    const authTag = cipher.getAuthTag().toString("hex");
    return `${iv.toString("hex")}:${authTag}:${encrypted}`;
  }

  beforeAll(async () => {
    // Unique ID for this test run to prevent collision
    executionId = `testrun-${Date.now()}-${crypto.randomUUID().substring(0, 8)}`;
    sandboxRepo = process.env.GITHUB_TEST_REPO || "huyz0/tasker-test-sandbox";
    testToken = process.env.GITHUB_TEST_TOKEN || "";

    if (!testToken) {
      throw new Error("GITHUB_TEST_TOKEN is required for integration tests");
    }

    // Initialize handler with mock DB
    handler = createRepositoriesHandler(mockDb as any);

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

  afterAll(async () => {
    // Teardown: Clean up anything prefixed with executionId in the sandbox repo
    // E.g. close PRs, delete branches
    if (!testToken || !sandboxRepo) return;

    try {
      const response = await fetch(
        `https://api.github.com/repos/${sandboxRepo}/pulls?state=open`,
        {
          headers: {
            Authorization: `Bearer ${testToken}`,
            Accept: "application/vnd.github.v3+json",
            "User-Agent": "Tasker-Agent-Teardown",
          },
        }
      );
      if (response.ok) {
        const prs = await response.json() as any[];
        for (const pr of prs) {
          if (pr.title.includes(executionId)) {
            await fetch(
              `https://api.github.com/repos/${sandboxRepo}/pulls/${pr.number}`,
              {
                method: "PATCH",
                headers: {
                  Authorization: `Bearer ${testToken}`,
                  Accept: "application/vnd.github.v3+json",
                  "User-Agent": "Tasker-Agent-Teardown",
                },
                body: JSON.stringify({ state: "closed" }),
              }
            );
          }
        }
      }

      // Similarly fetch and delete branches if needed...
    } catch (e) {
      console.error("Failed to teardown integration test resources:", e);
    }
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
    // First we create a fake PR in the sandbox using direct API
    const prTitle = `[${executionId}] Dummy PR for Sync Test`;
    const branchName = `branch-${executionId}`;

    // Note: Creating a PR dynamically requires a branch with a commit, which is complex 
    // to do in one API call. Alternatively, we just test that syncPullRequests can 
    // contact GitHub without throwing an error (using our mockDb).
    const req = { projectId: TEST_PROJECT_ID };
    const response = await handler.syncPullRequests(req, ctx);

    expect(response.success).toBe(true);
  });
});
