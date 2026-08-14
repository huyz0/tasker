import { createContextValues } from "@connectrpc/connect";
import { setupDatabase } from "../db/db";
import * as schema from "../db/schema.sqlite";
import { currentUserIdKey } from "../modules/auth/session";

/**
 * Builds a HandlerContext-shaped object carrying an authenticated user id, for
 * calling handlers directly in tests. Real ConnectRPC HandlerContext exposes
 * this as `.values` (not `.contextValues` - that name only exists on the
 * interceptor-side request object), so this must match `.values` too.
 */
export const makeAuthContext = (userId: string | null) => {
  const contextValues = createContextValues();
  contextValues.set(currentUserIdKey, userId);
  return { values: contextValues } as any;
};

class MockNatsPublishSpy {
  public publishedMessages: { subject: string; data: any }[] = [];

  publish(subject: string, data: any) {
    this.publishedMessages.push({
      subject,
      data: JSON.parse(data.toString())
    });
  }

  clear() {
    this.publishedMessages = [];
  }
}

export const setupIntegrationTest = async () => {
  process.env.STANDALONE = "true";

  const rawDb = await setupDatabase("sqlite", ":memory:");
  const db = rawDb as any;
  const nc = new MockNatsPublishSpy();

  return { db, nc };
};

/**
 * Fixture seeding for integration tests.
 *
 * These replace the `try { …inserts… } catch {}` blocks the tests used to
 * open with. Swallowing the error there meant a fixture that stopped working -
 * a renamed column, a constraint the seed no longer satisfies - produced a
 * test asserting against an empty database, and surfaced either as a green
 * test proving nothing or as a failure several assertions away from its cause.
 * Every helper below fails immediately and names the fixture that broke.
 */
async function fixture<T>(what: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (err) {
    throw new Error(`test fixture "${what}" failed: ${(err as Error).message}`, { cause: err });
  }
}

export const seedUser = (db: any, userId: string, overrides: Record<string, any> = {}) =>
  fixture(`user ${userId}`, () =>
    db.insert(schema.users).values({
      id: userId,
      email: `${userId}@test.local`,
      createdAt: new Date(),
      ...overrides,
    })
  );

/**
 * The usual starting point: an organization, a user, and that user as its
 * admin - what almost every handler test needs before it can call anything.
 */
export const seedOrgWithAdmin = async (
  db: any,
  { orgId, userId, name = `Org ${orgId}`, slug = orgId }: { orgId: string; userId: string; name?: string; slug?: string }
) => {
  await fixture(`organization ${orgId}`, () =>
    db.insert(schema.organizations).values({ id: orgId, name, slug, createdAt: new Date() })
  );
  await seedUser(db, userId);
  await fixture(`membership ${userId} -> ${orgId}`, () =>
    db.insert(schema.organizationMembers).values({ orgId, userId, role: "admin", joinedAt: new Date() })
  );
  return { orgId, userId };
};

export const seedProject = async (
  db: any,
  { orgId, userId, templateId, projectId, name = `Project ${projectId}` }:
    { orgId: string; userId: string; templateId: string; projectId: string; name?: string }
) => {
  await fixture(`project template ${templateId}`, () =>
    db.insert(schema.projectTemplates).values({ id: templateId, orgId, name: `Template ${templateId}`, createdAt: new Date() })
  );
  await fixture(`project ${projectId}`, () =>
    db.insert(schema.projects).values({ id: projectId, orgId, templateId, ownerId: userId, name, createdAt: new Date() })
  );
  return { templateId, projectId };
};
