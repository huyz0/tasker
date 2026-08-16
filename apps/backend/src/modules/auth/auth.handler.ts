import { eq } from "drizzle-orm";
import { ConnectError, Code } from "@connectrpc/connect";
import * as schemaMysql from "../../db/schema.mysql";
import * as schemaSqlite from "../../db/schema.sqlite";
import { requireUser } from "../../lib/authz";
import { hashPassword, verifyPassword, MIN_PASSWORD_LENGTH } from "../../lib/credentials";

export const createAuthHandler = (db: any) => {
  const isStandalone = process.env.STANDALONE === "true";
  const usersTable = isStandalone ? schemaSqlite.users : schemaMysql.users;
  const passwordCredentialsTable = isStandalone ? schemaSqlite.passwordCredentials : schemaMysql.passwordCredentials;

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
  };
};
