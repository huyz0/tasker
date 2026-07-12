import { expect, test, describe, beforeAll, mock, afterAll } from "bun:test";
import { setupIntegrationTest, makeAuthContext } from "../../test/setup";
import { createRepositoriesHandler } from "./repositories.handler";
import { createProjectsHandler } from "../projects/projects.handler";
import { createTaskManagementHandler } from "../tasks/tasks.handler";
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
      if (url.toString() === "https://bitbucket.org/site/oauth2/access_token") {
        const body = new URLSearchParams(options?.body as string);
        return new Response(JSON.stringify({ access_token: "mock_bb_token_" + body.get("code") }), { status: 200 });
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

  test("syncPullRequests links a PR to a task when the title references its displayId", async () => {
    const pId = (await pHandler.createProject({ orgId: "org-2", templateId: "tpl-2", name: "PR Linking", ownerId: "usr-2" }, ctx2)).project.id;
    const taskHandler = createTaskManagementHandler(db, null);
    const task = (await taskHandler.createTask({ projectId: pId, title: "Fix the login bug" }, ctx2)).task;

    globalThis.fetch = mock(async (url: string | Request | URL) => {
      if (url.toString() === "https://github.com/login/oauth/access_token") {
        return new Response(JSON.stringify({ access_token: "mock_token" }), { status: 200 });
      }
      if (url.toString().includes("/pulls")) {
        return new Response(JSON.stringify([
          { number: 1, title: `${task.displayId}: fix the login bug`, state: "open", draft: false, html_url: "http://github/1" },
          { number: 2, title: "Unrelated PR with no task reference", state: "open", draft: false, html_url: "http://github/2" },
        ]), { status: 200 });
      }
      return new Response("Not found", { status: 404 });
    }) as unknown as typeof fetch;

    await repHandler.addRepositoryLink({ projectId: pId, provider: "github", remoteName: "foo/pr-linking", oauthCode: "fake-code" }, ctx2);
    await repHandler.syncPullRequests({ projectId: pId }, ctx2);

    const listResp = await repHandler.listPullRequests({ projectId: pId }, ctx2);
    const linkedPr = listResp.pullRequests.find((p: any) => p.title.includes(task.displayId));
    expect(linkedPr.taskId).toBe(task.id);

    const unrelatedPr = listResp.pullRequests.find((p: any) => p.title === "Unrelated PR with no task reference");
    expect(unrelatedPr.taskId).toBeFalsy();
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

  test("listBuilds maps GitHub workflow runs to normalized build statuses", async () => {
    const pId = (await pHandler.createProject({ orgId: "org-2", templateId: "tpl-2", name: "P-gh-builds", ownerId: "usr-2" }, ctx2)).project.id;

    globalThis.fetch = mock(async (url: string | Request | URL) => {
      if (url.toString() === "https://github.com/login/oauth/access_token") {
        return new Response(JSON.stringify({ access_token: "mock_token" }), { status: 200 });
      }
      if (url.toString().includes("/actions/runs")) {
        return new Response(JSON.stringify({
          workflow_runs: [
            { id: 1, status: "completed", conclusion: "success", head_sha: "sha-1", created_at: "2024-01-01T00:00:00Z" },
            { id: 2, status: "completed", conclusion: "failure", head_sha: "sha-2", created_at: "2024-01-02T00:00:00Z" },
            { id: 3, status: "in_progress", head_sha: "sha-3", created_at: "2024-01-03T00:00:00Z" },
          ],
        }), { status: 200 });
      }
      return new Response("Not found", { status: 404 });
    }) as unknown as typeof fetch;

    const link = (await repHandler.addRepositoryLink({
      projectId: pId,
      provider: "github",
      remoteName: "foo/gh-builds",
      oauthCode: "fake-code",
    }, ctx2)).link;

    const res = await repHandler.listBuilds({ repositoryLinkId: link.id }, ctx2);
    expect(res.builds).toHaveLength(3);
    expect(res.builds.find((b: any) => b.id === "1").status).toBe("SUCCESS");
    expect(res.builds.find((b: any) => b.id === "2").status).toBe("FAILURE");
    expect(res.builds.find((b: any) => b.id === "3").status).toBe("PENDING");
    expect(res.builds.every((b: any) => b.repositoryLinkId === link.id)).toBe(true);
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

  test("listDeployments returns an empty list for an unsupported provider without calling out", async () => {
    const pId = (await pHandler.createProject({ orgId: "org-2", templateId: "tpl-2", name: "P7", ownerId: "usr-2" }, ctx2)).project.id;
    await db.insert(schemaSqlite.repositoryLinks).values({
      id: "replink-unsupported-provider",
      projectId: pId,
      provider: "unsupported-provider",
      remoteName: "foo/bb-repo",
      accessTokenEncrypted: "irrelevant",
      createdAt: new Date(),
    });

    const res = await repHandler.listDeployments({ buildId: "run-1", repositoryLinkId: "replink-unsupported-provider", commitSha: "sha1" }, ctx2);
    expect(res.deployments).toEqual([]);
  });

  test("syncPullRequests, listBuilds, and listDeployments work against Bitbucket Cloud's API", async () => {
    const pId = (await pHandler.createProject({ orgId: "org-2", templateId: "tpl-2", name: "P-bitbucket", ownerId: "usr-2" }, ctx2)).project.id;

    globalThis.fetch = mock(async (url: string | Request | URL, options?: RequestInit) => {
      const u = url.toString();
      if (u === "https://bitbucket.org/site/oauth2/access_token") {
        return new Response(JSON.stringify({ access_token: "mock_bb_token" }), { status: 200 });
      }
      if (u.includes("/pullrequests?")) {
        return new Response(JSON.stringify({
          values: [
            { id: 1, title: "BB PR Open", state: "OPEN", draft: false, links: { html: { href: "http://bb/1" } } },
            { id: 2, title: "BB PR Merged", state: "MERGED", links: { html: { href: "http://bb/2" } } },
          ],
        }), { status: 200 });
      }
      if (u.includes("/pipelines/")) {
        return new Response(JSON.stringify({
          values: [
            { uuid: "{pipe-1}", state: { name: "COMPLETED", result: { name: "SUCCESSFUL" } }, target: { commit: { hash: "sha-bb-1" } }, created_on: "2024-01-01T00:00:00Z" },
            { uuid: "{pipe-2}", state: { name: "IN_PROGRESS" }, target: { commit: { hash: "sha-bb-2" } }, created_on: "2024-01-02T00:00:00Z" },
          ],
        }), { status: 200 });
      }
      if (u.includes("/deployments/")) {
        return new Response(JSON.stringify({
          values: [
            { uuid: "{dep-1}", environment: { name: "production" }, state: { name: "COMPLETED", status: "SUCCESSFUL" }, deployable: { commit: { hash: "sha-bb-match" } }, created_on: "2024-02-01T00:00:00Z" },
            { uuid: "{dep-2}", environment: { name: "staging" }, state: { name: "COMPLETED", status: "SUCCESSFUL" }, deployable: { commit: { hash: "sha-bb-other" } }, created_on: "2024-02-02T00:00:00Z" },
          ],
        }), { status: 200 });
      }
      return new Response("Not found", { status: 404 });
    }) as unknown as typeof fetch;

    const link = (await repHandler.addRepositoryLink({
      projectId: pId,
      provider: "bitbucket",
      remoteName: "foo/bb-full",
      oauthCode: "fake-code",
    }, ctx2)).link;

    await repHandler.syncPullRequests({ projectId: pId }, ctx2);
    const prsResp = await repHandler.listPullRequests({ projectId: pId }, ctx2);
    expect(prsResp.pullRequests.some((p: any) => p.title === "BB PR Open" && p.status === "open")).toBe(true);
    expect(prsResp.pullRequests.some((p: any) => p.title === "BB PR Merged" && p.status === "merged")).toBe(true);

    const buildsResp = await repHandler.listBuilds({ repositoryLinkId: link.id }, ctx2);
    expect(buildsResp.builds).toHaveLength(2);
    expect(buildsResp.builds.find((b: any) => b.id === "pipe-1").status).toBe("SUCCESS");
    expect(buildsResp.builds.find((b: any) => b.id === "pipe-2").status).toBe("PENDING");

    // Only the deployment whose commit matches commitSha should be returned.
    const deploymentsResp = await repHandler.listDeployments({ buildId: "pipe-1", repositoryLinkId: link.id, commitSha: "sha-bb-match" }, ctx2);
    expect(deploymentsResp.deployments).toHaveLength(1);
    expect(deploymentsResp.deployments[0].environment).toBe("production");
    expect(deploymentsResp.deployments[0].status).toBe("SUCCESS");
    expect(deploymentsResp.deployments[0].buildId).toBe("pipe-1");
  });

  test("Bitbucket direct-token links (Atlassian API tokens) authenticate with Basic auth instead of Bearer", async () => {
    const pId = (await pHandler.createProject({ orgId: "org-2", templateId: "tpl-2", name: "P-bb-apitoken", ownerId: "usr-2" }, ctx2)).project.id;

    const captured: { authHeader: string | null } = { authHeader: null };
    globalThis.fetch = mock(async (url: string | Request | URL, options?: RequestInit) => {
      const u = url.toString();
      if (u.includes("/pullrequests?")) {
        captured.authHeader = (options?.headers as Record<string, string>)?.Authorization ?? null;
        return new Response(JSON.stringify({ values: [] }), { status: 200 });
      }
      return new Response("Not found", { status: 404 });
    }) as unknown as typeof fetch;

    // No oauthCode - this is the direct-token flow, which requires apiToken + email.
    const link = (await repHandler.addRepositoryLink({
      projectId: pId,
      provider: "bitbucket",
      remoteName: "foo/bb-apitoken",
      apiToken: "ATATT-fake-api-token",
      email: "user@example.com",
    }, ctx2)).link;
    expect(link.authEmail).toBe("user@example.com");

    // The stored token must be the raw apiToken, not something exchanged via OAuth.
    const rawLink = (await db.select().from(schemaSqlite.repositoryLinks).where(eq(schemaSqlite.repositoryLinks.id, link.id)))[0];
    const ALGORITHM = "aes-256-gcm";
    const [ivHex, authTagHex, encryptedHex] = rawLink.accessTokenEncrypted.split(":");
    const crypto = await import("node:crypto");
    const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from("00000000000000000000000000000000", "utf8"), Buffer.from(ivHex, "hex"));
    decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
    const decrypted = decipher.update(encryptedHex, "hex", "utf8") + decipher.final("utf8");
    expect(decrypted).toBe("ATATT-fake-api-token");

    await repHandler.syncPullRequests({ projectId: pId }, ctx2);
    expect(captured.authHeader).toBe(`Basic ${Buffer.from("user@example.com:ATATT-fake-api-token").toString("base64")}`);

    // Rejecting invalid combinations: apiToken without email, or a non-Bitbucket provider.
    await expect(repHandler.addRepositoryLink({
      projectId: pId, provider: "bitbucket", remoteName: "foo/bad", apiToken: "tok",
    }, ctx2)).rejects.toThrow();
    await expect(repHandler.addRepositoryLink({
      projectId: pId, provider: "github", remoteName: "foo/bad", apiToken: "tok", email: "a@b.com",
    }, ctx2)).rejects.toThrow();
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
