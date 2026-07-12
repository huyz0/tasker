import { expect, test, describe, beforeAll, mock, afterAll } from "bun:test";
import { setupIntegrationTest, makeAuthContext } from "../../test/setup";
import { createRepositoriesHandler } from "./repositories.handler";
import { createProjectsHandler } from "../projects/projects.handler";
import * as schemaSqlite from "../../db/schema.sqlite";
import { eq } from "drizzle-orm";

describe("Repositories Handler >", () => {
  let db: any;
  let repHandler: any;
  let pHandler: any;
  let ctx1: any;
  let ctx2: any;

  let originalFetch: typeof globalThis.fetch;

  beforeAll(async () => {
    process.env.APP_ENCRYPTION_SECRET = "00000000000000000000000000000000";
    const setup = await setupIntegrationTest();
    db = setup.db;
    repHandler = createRepositoriesHandler(db, setup.nc);
    pHandler = createProjectsHandler(db, setup.nc);
    ctx1 = makeAuthContext("usr-1");
    ctx2 = makeAuthContext("usr-2");

    originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async (url: string | Request | URL, options?: RequestInit) => {
      if (url.toString() === "https://github.com/login/oauth/access_token") {
        const body = JSON.parse(options?.body as string);
        return new Response(JSON.stringify({ access_token: "mock_token_" + body.code }), { status: 200 });
      }
      return originalFetch(url, options);
    }) as unknown as typeof fetch;
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
    mock.restore();
  });

  test("should successfully add a repository link and encrypt its token", async () => {
    // 1. Setup a project
    await db.insert(schemaSqlite.organizations).values({
      id: "org-1",
      name: "T Org",
      slug: "t-org",
      createdAt: new Date(),
    });
    await db.insert(schemaSqlite.users).values({
      id: "usr-1",
      email: "test@tasker.local",
      createdAt: new Date(),
    });
    await db.insert(schemaSqlite.organizationMembers).values({ orgId: "org-1", userId: "usr-1", role: "admin", joinedAt: new Date() });
    await db.insert(schemaSqlite.projectTemplates).values({
      id: "tpl-1",
      orgId: "org-1",
      name: "Software",
      createdAt: new Date(),
    });
    const projResp = await pHandler.createProject({
      orgId: "org-1",
      templateId: "tpl-1",
      name: "Super Secret Product",
      ownerId: "usr-1",
    }, ctx1);
    const projectId = projResp.project.id;

    // 2. Add repository link
    const addResp = await repHandler.addRepositoryLink({
      projectId,
      provider: "github",
      remoteName: "huyz0/tasker",
      oauthCode: "fake-oauth-code-123",
    }, ctx1);

    expect(addResp.link).toBeDefined();
    expect(addResp.link.projectId).toBe(projectId);
    expect(addResp.link.provider).toBe("github");
    expect(addResp.link.remoteName).toBe("huyz0/tasker");
    const linkId = addResp.link.id;

    // 3. Verify it was encrypted in DB (by reading raw DB instead of handler)
    const rawLinks = await db.select().from(schemaSqlite.repositoryLinks).where(eq(schemaSqlite.repositoryLinks.id, linkId));
    expect(rawLinks.length).toBe(1);

    const encryptedTokenStr = rawLinks[0].accessTokenEncrypted;
    expect(encryptedTokenStr).not.toContain("mock_token");
    expect(encryptedTokenStr.split(':').length).toBe(3);

    // Outsider cannot add a link to this project
    await expect(repHandler.addRepositoryLink({
      projectId, provider: "github", remoteName: "x/y", oauthCode: "z",
    }, makeAuthContext("usr-outsider"))).rejects.toThrow();
  });

  test("should mask tokens on list fetching", async () => {
    // 1. Setup
    await db.insert(schemaSqlite.organizations).values({ id: "org-2", name: "T2", slug: "t2-org", createdAt: new Date() });
    await db.insert(schemaSqlite.users).values({ id: "usr-2", email: "test2@tasker.local", createdAt: new Date() });
    await db.insert(schemaSqlite.organizationMembers).values({ orgId: "org-2", userId: "usr-2", role: "admin", joinedAt: new Date() });
    await db.insert(schemaSqlite.projectTemplates).values({ id: "tpl-2", orgId: "org-2", name: "Soft2", createdAt: new Date() });
    const pId = (await pHandler.createProject({ orgId: "org-2", templateId: "tpl-2", name: "P2", ownerId: "usr-2" }, ctx2)).project.id;

    await repHandler.addRepositoryLink({
      projectId: pId,
      provider: "bitbucket",
      remoteName: "huyz0/test2",
      oauthCode: "foo",
    }, ctx2);

    const listResp = await repHandler.listRepositoryLinks({ projectId: pId }, ctx2);
    expect(listResp.links).toBeDefined();
    expect(listResp.links.length).toBe(1);
    expect(listResp.links[0].accessTokenEncrypted).toBeUndefined(); // Crucial security feature

    await expect(repHandler.listRepositoryLinks({ projectId: pId }, makeAuthContext("usr-outsider"))).rejects.toThrow();
  });

  test("should synchronize pull requests from provider", async () => {
    // 1. Setup
    const pId = (await pHandler.createProject({ orgId: "org-2", templateId: "tpl-2", name: "P3", ownerId: "usr-2" }, ctx2)).project.id;

    // Mock the fetch for this specific test
    globalThis.fetch = mock(async (url: string | Request | URL, options?: RequestInit) => {
      if (url.toString() === "https://github.com/login/oauth/access_token") {
        return new Response(JSON.stringify({ access_token: "mock_token" }), { status: 200 });
      }
      if (url.toString().includes("/pulls")) {
        return new Response(JSON.stringify([
          { number: 1, title: "PR 1 TSK-123", state: "open", draft: false, html_url: "http://github/1" },
          { number: 2, title: "PR 2", state: "closed", merged_at: "2023-01-01", html_url: "http://github/2" }
        ]), { status: 200 });
      }
      return new Response("Not found", { status: 404 });
    }) as unknown as typeof fetch;

    await repHandler.addRepositoryLink({
      projectId: pId,
      provider: "github",
      remoteName: "foo/bar",
      oauthCode: "fake-code",
    }, ctx2);

    await repHandler.syncPullRequests({ projectId: pId }, ctx2);

    // Verify
    const prs = await db.select().from(schemaSqlite.remotePullRequests);
    expect(prs.length).toBeGreaterThanOrEqual(2);

    const pr1 = prs.find((p: any) => p.title === "PR 1 TSK-123");
    expect(pr1).toBeDefined();
    expect(pr1.status).toBe("open");

    const pr2 = prs.find((p: any) => p.title === "PR 2");
    expect(pr2).toBeDefined();
    expect(pr2.status).toBe("merged");

    const listResp = await repHandler.listPullRequests({ projectId: pId }, ctx2);
    expect(listResp.pullRequests.length).toBeGreaterThanOrEqual(2);
    expect(listResp.pullRequests.some((p: any) => p.title === "PR 1 TSK-123")).toBe(true);

    await expect(repHandler.listPullRequests({ projectId: pId }, makeAuthContext("usr-outsider"))).rejects.toThrow();
  });

  test("listPullRequests returns an empty list for a project with no linked repositories", async () => {
    const pId = (await pHandler.createProject({ orgId: "org-2", templateId: "tpl-2", name: "P-no-links", ownerId: "usr-2" }, ctx2)).project.id;
    const listResp = await repHandler.listPullRequests({ projectId: pId }, ctx2);
    expect(listResp.pullRequests).toEqual([]);
  });

  test("syncPullRequests does not collide PRs across different repository links with the same remotePrId", async () => {
    const pId = (await pHandler.createProject({ orgId: "org-2", templateId: "tpl-2", name: "P-collision", ownerId: "usr-2" }, ctx2)).project.id;

    globalThis.fetch = mock(async (url: string | Request | URL) => {
      if (url.toString() === "https://github.com/login/oauth/access_token") {
        return new Response(JSON.stringify({ access_token: "mock_token" }), { status: 200 });
      }
      if (url.toString().includes("/repos/foo/repo-a/pulls")) {
        return new Response(JSON.stringify([{ number: 1, title: "Repo A PR#1", state: "open", draft: false, html_url: "u" }]), { status: 200 });
      }
      if (url.toString().includes("/repos/foo/repo-b/pulls")) {
        return new Response(JSON.stringify([{ number: 1, title: "Repo B PR#1", state: "open", draft: false, html_url: "u" }]), { status: 200 });
      }
      return new Response("Not found", { status: 404 });
    }) as unknown as typeof fetch;

    const linkA = (await repHandler.addRepositoryLink({ projectId: pId, provider: "github", remoteName: "foo/repo-a", oauthCode: "a" }, ctx2)).link;
    const linkB = (await repHandler.addRepositoryLink({ projectId: pId, provider: "github", remoteName: "foo/repo-b", oauthCode: "b" }, ctx2)).link;

    await repHandler.syncPullRequests({ projectId: pId }, ctx2);

    const prsForA = await db.select().from(schemaSqlite.remotePullRequests).where(eq(schemaSqlite.remotePullRequests.repositoryLinkId, linkA.id));
    const prsForB = await db.select().from(schemaSqlite.remotePullRequests).where(eq(schemaSqlite.remotePullRequests.repositoryLinkId, linkB.id));

    expect(prsForA.some((p: any) => p.title === "Repo A PR#1")).toBe(true);
    expect(prsForB.some((p: any) => p.title === "Repo B PR#1")).toBe(true);
    // Each link's PR #1 must remain attributed to its own link, not merged into one row.
    expect(prsForA.find((p: any) => p.remotePrId === "1")?.title).toBe("Repo A PR#1");
    expect(prsForB.find((p: any) => p.remotePrId === "1")?.title).toBe("Repo B PR#1");
  });

  test("syncPullRequests reports failure when the provider call fails", async () => {
    const pId = (await pHandler.createProject({ orgId: "org-2", templateId: "tpl-2", name: "P4", ownerId: "usr-2" }, ctx2)).project.id;

    globalThis.fetch = mock(async (url: string | Request | URL) => {
      if (url.toString() === "https://github.com/login/oauth/access_token") {
        return new Response(JSON.stringify({ access_token: "mock_token" }), { status: 200 });
      }
      if (url.toString().includes("/pulls")) {
        return new Response("Service unavailable", { status: 503 });
      }
      return new Response("Not found", { status: 404 });
    }) as unknown as typeof fetch;

    await repHandler.addRepositoryLink({
      projectId: pId,
      provider: "github",
      remoteName: "foo/broken",
      oauthCode: "fake-code",
    }, ctx2);

    const result = await repHandler.syncPullRequests({ projectId: pId }, ctx2);
    expect(result.success).toBe(false);
  });

  test("listBuilds throws instead of silently returning an empty list on provider failure", async () => {
    const pId = (await pHandler.createProject({ orgId: "org-2", templateId: "tpl-2", name: "P5", ownerId: "usr-2" }, ctx2)).project.id;

    globalThis.fetch = mock(async (url: string | Request | URL) => {
      if (url.toString() === "https://github.com/login/oauth/access_token") {
        return new Response(JSON.stringify({ access_token: "mock_token" }), { status: 200 });
      }
      if (url.toString().includes("/actions/runs")) {
        return new Response("Service unavailable", { status: 503 });
      }
      return new Response("Not found", { status: 404 });
    }) as unknown as typeof fetch;

    const link = (await repHandler.addRepositoryLink({
      projectId: pId,
      provider: "github",
      remoteName: "foo/broken-builds",
      oauthCode: "fake-code",
    }, ctx2)).link;

    await expect(repHandler.listBuilds({ repositoryLinkId: link.id }, ctx2)).rejects.toThrow(/GitHub API returned 503/);
    await expect(repHandler.listBuilds({ repositoryLinkId: link.id }, makeAuthContext("usr-outsider"))).rejects.toThrow();
  });

  test("listDeployments fetches real deployments for a commit sha and resolves each one's latest status", async () => {
    const pId = (await pHandler.createProject({ orgId: "org-2", templateId: "tpl-2", name: "P6", ownerId: "usr-2" }, ctx2)).project.id;

    globalThis.fetch = mock(async (url: string | Request | URL) => {
      if (url.toString() === "https://github.com/login/oauth/access_token") {
        return new Response(JSON.stringify({ access_token: "mock_token" }), { status: 200 });
      }
      if (url.toString().includes("/deployments?sha=")) {
        return new Response(JSON.stringify([
          { id: 111, environment: "production", created_at: "2024-01-01T00:00:00Z" },
          { id: 222, environment: "staging", created_at: "2024-01-02T00:00:00Z" },
        ]), { status: 200 });
      }
      if (url.toString().includes("/deployments/111/statuses")) {
        return new Response(JSON.stringify([{ state: "success" }]), { status: 200 });
      }
      if (url.toString().includes("/deployments/222/statuses")) {
        return new Response(JSON.stringify([{ state: "failure" }]), { status: 200 });
      }
      return new Response("Not found", { status: 404 });
    }) as unknown as typeof fetch;

    const link = (await repHandler.addRepositoryLink({
      projectId: pId,
      provider: "github",
      remoteName: "foo/deploy-repo",
      oauthCode: "fake-code",
    }, ctx2)).link;

    const res = await repHandler.listDeployments({
      buildId: "run-123",
      repositoryLinkId: link.id,
      commitSha: "abc123",
    }, ctx2);

    expect(res.deployments).toHaveLength(2);
    const prod = res.deployments.find((d: any) => d.environment === "production");
    expect(prod.status).toBe("SUCCESS");
    expect(prod.buildId).toBe("run-123");
    const staging = res.deployments.find((d: any) => d.environment === "staging");
    expect(staging.status).toBe("FAILURE");

    await expect(
      repHandler.listDeployments({ buildId: "run-123", repositoryLinkId: link.id, commitSha: "abc123" }, makeAuthContext("usr-outsider"))
    ).rejects.toThrow();
  });

  test("listDeployments returns an empty list for a non-github provider without calling out", async () => {
    const pId = (await pHandler.createProject({ orgId: "org-2", templateId: "tpl-2", name: "P7", ownerId: "usr-2" }, ctx2)).project.id;
    const link = (await repHandler.addRepositoryLink({
      projectId: pId,
      provider: "bitbucket",
      remoteName: "foo/bb-repo",
      oauthCode: "fake-code",
    }, ctx2)).link;

    const res = await repHandler.listDeployments({ buildId: "run-1", repositoryLinkId: link.id, commitSha: "sha1" }, ctx2);
    expect(res.deployments).toEqual([]);
  });

  test("listDeployments throws on provider failure instead of returning fabricated data", async () => {
    const pId = (await pHandler.createProject({ orgId: "org-2", templateId: "tpl-2", name: "P8", ownerId: "usr-2" }, ctx2)).project.id;

    globalThis.fetch = mock(async (url: string | Request | URL) => {
      if (url.toString() === "https://github.com/login/oauth/access_token") {
        return new Response(JSON.stringify({ access_token: "mock_token" }), { status: 200 });
      }
      if (url.toString().includes("/deployments?sha=")) {
        return new Response("Service unavailable", { status: 503 });
      }
      return new Response("Not found", { status: 404 });
    }) as unknown as typeof fetch;

    const link = (await repHandler.addRepositoryLink({
      projectId: pId,
      provider: "github",
      remoteName: "foo/broken-deployments",
      oauthCode: "fake-code",
    }, ctx2)).link;

    await expect(
      repHandler.listDeployments({ buildId: "run-1", repositoryLinkId: link.id, commitSha: "sha1" }, ctx2)
    ).rejects.toThrow(/GitHub API returned 503/);
  });
});
