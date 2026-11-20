import { describe, expect, it } from "vitest";
import { Repository } from "./database.ts";

describe("Repository feedback ingestion", () => {
  it("deduplicates retries by idempotency key and queues one record", () => {
    const repository = new Repository(":memory:");
    const input = {
      idempotencyKey: "09df8629-11cf-4216-b86b-62a0bc120f9e",
      conversationId: "conversation-1",
      responseId: null,
      responseTimestamp: new Date().toISOString(),
      userFeedback: "The answer restated my point.",
      expectedBehavior: "Challenge the weak assumption.",
      includeExcerpt: true,
    };
    const first = repository.createFeedback(input);
    const second = repository.createFeedback(input);

    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(second.record.id).toBe(first.record.id);
    expect(repository.listFeedback()).toHaveLength(1);
    expect(repository.claimNextJob()?.feedbackId).toBe(first.record.id);
    expect(repository.claimNextJob()).toBeNull();
  });

  it("deletes a feedback record and its queued job", () => {
    const repository = new Repository(":memory:");
    const { record } = repository.createFeedback({
      idempotencyKey: crypto.randomUUID(),
      conversationId: "conversation-delete",
      responseId: null,
      responseTimestamp: null,
      userFeedback: "Remove this record.",
      expectedBehavior: null,
      includeExcerpt: false,
    });

    expect(repository.deleteFeedback(record.id)).toBe(true);
    expect(repository.getFeedback(record.id)).toBeNull();
    expect(repository.claimNextJob()).toBeNull();
    expect(repository.deleteFeedback(record.id)).toBe(false);
  });

  it("purges only records outside the retention window", () => {
    const repository = new Repository(":memory:");
    const old = repository.createFeedback({
      idempotencyKey: crypto.randomUUID(), conversationId: "old", responseId: null,
      responseTimestamp: null, userFeedback: "Old record", expectedBehavior: null,
      includeExcerpt: false,
    }).record;
    const fresh = repository.createFeedback({
      idempotencyKey: crypto.randomUUID(), conversationId: "fresh", responseId: null,
      responseTimestamp: null, userFeedback: "Fresh record", expectedBehavior: null,
      includeExcerpt: false,
    }).record;
    repository.db.prepare("UPDATE feedback SET created_at = ? WHERE id = ?")
      .run("2026-10-01T00:00:00.000Z", old.id);

    expect(repository.purgeExpiredFeedback(7, new Date("2026-11-20T00:00:00.000Z"))).toBe(1);
    expect(repository.getFeedback(old.id)).toBeNull();
    expect(repository.getFeedback(fresh.id)).not.toBeNull();
  });
});
