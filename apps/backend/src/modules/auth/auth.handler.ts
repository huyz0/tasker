import { eq, and } from "drizzle-orm";
import { ConnectError, Code } from "@connectrpc/connect";
import * as schemaMysql from "../../db/schema.mysql";
import * as schemaSqlite from "../../db/schema.sqlite";
import { requireUser, countActiveSignInMethods, assertNotLastSignInMethod } from "../../lib/authz";
import { hashPassword, verifyPassword, MIN_PASSWORD_LENGTH } from "../../lib/credentials";

export const createAuthHandler = (db: any) => {
  const isStandalone = process.env.STANDALONE === "true";
  const usersTable = isStandalone ? schemaSqlite.users : schemaMysql.users;
  const passwordCredentialsTable = isStandalone ? schemaSqlite.passwordCredentials : schemaMysql.passwordCredentials;
  const linkedIdentitiesTable = isStandalone ? schemaSqlite.linkedIdentities : schemaMysql.linkedIdentities;

  return {
    async getIdentity(_req: unknown, { values: contextValues }: { values: any }) {
      const currentUserId = requireUser(contextValues);

      const result = await db.select().from(usersTable).where(eq(usersTable.id, currentUserId)).limit(1);
      if (!result || result.length === 0) {
        throw new ConnectError("user not found", Code.NotFound);
      }
      const u = result[0];
      return { user: { ...u, createdAt: u.createdAt instanceof Date ? u.createdAt.toISOString() : u.createdAt } };
    },

    /**
     * Sets or replaces the caller's own local password (M13-T06). Requires
     * `currentPassword` and verifies it when a credential already exists -
     * an account adding a password for the first time (previously
     * Google-only) has nothing to prove yet, so the field is ignored there.
     * ADR-0012 §5's last-sign-in-method invariant doesn't apply: this only
     * ever adds or replaces a credential, never removes the only one.
     */
    async setPassword(req: { currentPassword?: string; newPassword: string }, { values: contextValues }: { values: any }) {
      const currentUserId = requireUser(contextValues);

      if (!req.newPassword || req.newPassword.length < MIN_PASSWORD_LENGTH) {
        throw new ConnectError(`newPassword must be at least ${MIN_PASSWORD_LENGTH} characters`, Code.InvalidArgument);
      }

      const existing = await db.select().from(passwordCredentialsTable)
        .where(eq((passwordCredentialsTable as any).userId, currentUserId)).limit(1);

      if (existing.length > 0) {
        const ok = req.currentPassword && await verifyPassword(req.currentPassword, existing[0].passwordHash);
        if (!ok) {
          throw new ConnectError("currentPassword is missing or incorrect", Code.PermissionDenied);
        }
      }

      const passwordHash = await hashPassword(req.newPassword);
      const now = new Date();
      if (existing.length > 0) {
        await db.update(passwordCredentialsTable)
          .set({ passwordHash, updatedAt: now, failedAttempts: 0, lockedUntil: null, mustChangePassword: false })
          .where(eq((passwordCredentialsTable as any).userId, currentUserId));
      } else {
        await db.insert(passwordCredentialsTable).values({
          userId: currentUserId, passwordHash, updatedAt: now, failedAttempts: 0, lockedUntil: null, mustChangePassword: false,
        });
      }

      return { success: true };
    },

    /** Every provider identity linked to the caller's own account (M13-T08). */
    async listLinkedIdentities(_req: unknown, { values: contextValues }: { values: any }) {
      const currentUserId = requireUser(contextValues);
      const rows = await db.select().from(linkedIdentitiesTable)
        .where(eq((linkedIdentitiesTable as any).userId, currentUserId));
      return {
        identities: rows.map((r: any) => ({
          provider: r.provider,
          linkedAt: r.linkedAt instanceof Date ? r.linkedAt.toISOString() : r.linkedAt,
        })),
      };
    },

    /**
     * Removes a linked provider identity from the caller's own account
     * (M13-T08). Refused if this is the account's last sign-in method
     * (ADR-0012 §5) - checked by counting what remains *after* this row is
     * gone, not merely how many exist now, so the guard cannot be
     * off-by-one against its own removal.
     */
    async unlinkIdentity(req: { provider: string }, { values: contextValues }: { values: any }) {
      const currentUserId = requireUser(contextValues);
      if (!req.provider) {
        throw new ConnectError("provider is required", Code.InvalidArgument);
      }

      const existing = await db.select().from(linkedIdentitiesTable)
        .where(and(eq((linkedIdentitiesTable as any).userId, currentUserId), eq((linkedIdentitiesTable as any).provider, req.provider)))
        .limit(1);
      if (existing.length === 0) {
        throw new ConnectError(`no linked ${req.provider} identity on this account`, Code.NotFound);
      }

      const totalMethods = await countActiveSignInMethods(db, currentUserId);
      assertNotLastSignInMethod(totalMethods - 1);

      await db.delete(linkedIdentitiesTable)
        .where(and(eq((linkedIdentitiesTable as any).userId, currentUserId), eq((linkedIdentitiesTable as any).provider, req.provider)));
      return { success: true };
    },
  };
};
