import { expect, test, describe, beforeAll, mock, afterAll } from "bun:test";
import { setupIntegrationTest } from "../../test/setup";
import { createRepositoriesHandler } from "./repositories.handler";
import { createProjectsHandler } from "../projects/projects.handler";
import * as schemaSqlite from "../../db/schema.sqlite";
import { eq } from "drizzle-orm";

describe("Repositories Handler >", () => {
  let db: any;
  let repHandler: any;
  let pHandler: any;

  let originalFetch: typeof globalThis.fetch;

  beforeAll(async () => {
    process.env.APP_ENCRYPTION_SECRET = "00000000000000000000000000000000";
    const setup = await setupIntegrationTest();
    db = setup.db;
    repHandler = createRepositoriesHandler(db, setup.nc);
    pHandler = createProjectsHandler(db, setup.nc);
    
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
    });
    const projectId = projResp.project.id;

    // 2. Add repository link
    const addResp = await repHandler.addRepositoryLink({
      projectId,
      provider: "github",
      remoteName: "huyz0/tasker",
      oauthCode: "fake-oauth-code-123",
    });

    expect(addResp.link).toBeDefined();
    expect(addResp.link.projectId).toBe(projectId);
    expect(addResp.link.provider).toBe("github");
    expect(addResp.link.remoteName).toBe("huyz0/tasker");
    const linkId = addResp.link.id;

    // 3. Verify it was encrypted in DB (by reading raw DB instead of handler)
    const rawLinks = await db.select().from(schemaSqlite.repositoryLinks).where(eq(schemaSqlite.repositoryLinks.id, linkId));
    expect(rawLinks.length).toBe(1);
    
    // The raw token is "mock_token_fake-oauth-code-123", but we should NOT see that in the database field.
    const encryptedTokenStr = rawLinks[0].accessTokenEncrypted;
    expect(encryptedTokenStr).not.toContain("mock_token");
    
    // We expect the AES string to be composed of "iv:authtag:cipher"
    expect(encryptedTokenStr.split(':').length).toBe(3);
  });
  
  test("should mask tokens on list fetching", async () => {
    // 1. Setup
    await db.insert(schemaSqlite.organizations).values({ id: "org-2", name: "T2", slug: "t2-org", createdAt: new Date() });
    await db.insert(schemaSqlite.users).values({ id: "usr-2", email: "test2@tasker.local", createdAt: new Date() });
    await db.insert(schemaSqlite.projectTemplates).values({ id: "tpl-2", orgId: "org-2", name: "Soft2", createdAt: new Date() });
    const pId = (await pHandler.createProject({ orgId: "org-2", templateId: "tpl-2", name: "P2", ownerId: "usr-2" })).project.id;
    
    await repHandler.addRepositoryLink({
      projectId: pId,
      provider: "bitbucket",
      remoteName: "huyz0/test2",
      oauthCode: "foo",
    });

    const listResp = await repHandler.listRepositoryLinks({ projectId: pId });
    expect(listResp.links).toBeDefined();
    expect(listResp.links.length).toBe(1);
    expect(listResp.links[0].accessTokenEncrypted).toBeUndefined(); // Crucial security feature
  });
});
