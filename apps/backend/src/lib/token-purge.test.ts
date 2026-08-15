import { describe, it, expect } from 'bun:test';
import { eq } from 'drizzle-orm';
import { setupIntegrationTest, makeAuthContext } from '../test/setup';
import * as schema from '../db/schema.sqlite';
import { createAgentsHandler } from '../modules/agents/agents.handler';
import { mintToken, resolveAgentToken } from './agentToken';

/**
 * Found during M04-T12's security review, by asking what happens to a
 * credential when the thing it authenticates as stops existing.
 *
 * purgeAgent deletes the agent row. api_tokens.agent_id references it, and
 * resolveAgentToken LEFT JOINs agents to check deletedAt — so with the agent
 * row gone, the join yields NULL, the deleted-agent check does not fire, and
 * the token authenticates as an agent that no longer exists.
 */

async function seedAgentWithToken(db: any) {
  const s = String(Math.random()).slice(2);
  const orgId = `org-${s}`, admin = `admin-${s}`, roleId = `role-${s}`, agentId = `agent-${s}`;
  const now = new Date();
  await db.insert(schema.organizations).values({ id: orgId, name: 'O', slug: orgId, createdAt: now });
  await db.insert(schema.users).values({ id: admin, email: `${admin}@t.test`, createdAt: now });
  await db.insert(schema.organizationMembers).values({ orgId, userId: admin, role: 'admin', joinedAt: now });
  await db.insert(schema.agentRoles).values({ id: roleId, orgId, name: 'R', systemPrompt: 'p', capabilities: '[]', createdAt: now });
  await db.insert(schema.agents).values({ id: agentId, orgId, agentRoleId: roleId, name: 'A', createdAt: now });

  const minted = mintToken();
  const tokenId = `tok-${s}`;
  await db.insert(schema.apiTokens).values({
    id: tokenId, orgId, agentId, name: 'worker',
    tokenPrefix: minted.tokenPrefix, tokenHash: minted.tokenHash,
    scopes: JSON.stringify(['tasks:read']), createdBy: admin, createdAt: now,
    expiresAt: new Date(Date.now() + 30 * 86400000),
  });
  return { orgId, admin, agentId, tokenId, plaintext: minted.plaintext };
}

describe('purging an agent kills its credentials', () => {
  it('a purged agent\'s token no longer authenticates', async () => {
    const { db } = await setupIntegrationTest();
    const { agentId, admin, plaintext } = await seedAgentWithToken(db);
    const handler = createAgentsHandler(db, null);

    expect((await resolveAgentToken(db, plaintext)).principal).not.toBeNull();

    await handler.archiveAgent({ agentId }, makeAuthContext(admin));
    await handler.purgeAgent({ agentId }, makeAuthContext(admin));

    // Without this, the credential outlives the identity it stands for: the
    // agent is gone from every screen and every list, and its token still works.
    const after = await resolveAgentToken(db, plaintext);
    expect(after.principal).toBeNull();
  });

  it('leaves no orphaned token rows behind', async () => {
    const { db } = await setupIntegrationTest();
    const { agentId, admin } = await seedAgentWithToken(db);
    const handler = createAgentsHandler(db, null);

    await handler.archiveAgent({ agentId }, makeAuthContext(admin));
    await handler.purgeAgent({ agentId }, makeAuthContext(admin));

    const rows = await db.select().from(schema.apiTokens).where(eq(schema.apiTokens.agentId, agentId));
    expect(rows).toHaveLength(0);
  });

  it('an archived agent\'s token stops working too, and comes back on restore', async () => {
    const { db } = await setupIntegrationTest();
    const { agentId, admin, plaintext } = await seedAgentWithToken(db);
    const handler = createAgentsHandler(db, null);

    await handler.archiveAgent({ agentId }, makeAuthContext(admin));
    expect((await resolveAgentToken(db, plaintext)).rejection).toBe('agent-deleted');

    // Archive is reversible, so its effect on credentials must be too -
    // otherwise "move to bin, change your mind" silently breaks an integration.
    await handler.restoreAgent({ agentId }, makeAuthContext(admin));
    expect((await resolveAgentToken(db, plaintext)).principal).not.toBeNull();
  });
});
