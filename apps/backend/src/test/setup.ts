import { createContextValues } from "@connectrpc/connect";
import { setupDatabase } from "../db/db";
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

export class MockNatsPublishSpy {
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
