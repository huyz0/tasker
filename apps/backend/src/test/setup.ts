import { setupDatabase } from "../db/db";

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
