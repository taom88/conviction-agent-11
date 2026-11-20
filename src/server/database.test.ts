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

  it("does not persist transcript evidence when excerpt consent is false", () => {
    const repository = new Repository(":memory:");
    const { record } = repository.createFeedback({
      idempotencyKey: crypto.randomUUID(),
      conversationId: "privacy-test",
      responseId: "response-1",
      responseTimestamp: new Date().toISOString(),
      userFeedback: "Do not retain the transcript.",
      expectedBehavior: null,
      includeExcerpt: false,
      evidenceMessages: [
        { id: "response-1", role: "agent", message: "Sensitive text", timestamp: null },
      ],
    });

    const stored = repository.getFeedbackWorkerInput(record.id);
    expect(stored?.include_excerpt).toBe(0);
    expect(stored?.client_evidence_json).toBeNull();
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

  it("recovers an interrupted analysis after the stale threshold", () => {
    const repository = new Repository(":memory:");
    const { record } = repository.createFeedback({
      idempotencyKey: crypto.randomUUID(), conversationId: "recovery", responseId: null,
      responseTimestamp: null, userFeedback: "Retry this analysis", expectedBehavior: null,
      includeExcerpt: false,
    });
    const job = repository.claimNextJob();
    expect(job?.feedbackId).toBe(record.id);
    repository.db.prepare("UPDATE jobs SET locked_at = ? WHERE id = ?")
      .run("2026-11-20T10:00:00.000Z", job?.id as string);

    expect(repository.recoverStaleJobs(15, new Date("2026-11-20T10:16:00.000Z"))).toBe(1);
    expect(repository.claimNextJob()?.feedbackId).toBe(record.id);
  });
});
