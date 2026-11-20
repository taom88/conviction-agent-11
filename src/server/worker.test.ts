import { describe, expect, it } from "vitest";
import type { Config } from "./config.ts";
import { Repository } from "./database.ts";
import type { ElevenLabsGateway } from "./elevenlabs.ts";
import { hashPrompt } from "./elevenlabs.ts";
import { ImprovementWorker } from "./worker.ts";

describe("ImprovementWorker privacy", () => {
  it("does not retrieve a provider transcript without excerpt consent", async () => {
    const repository = new Repository(":memory:");
    repository.createFeedback({
      idempotencyKey: crypto.randomUUID(),
      conversationId: "provider-conversation",
      responseId: "agent-turn",
      responseTimestamp: new Date().toISOString(),
      userFeedback: "Evaluate without retaining conversation text.",
      expectedBehavior: null,
      includeExcerpt: false,
      evidenceMessages: [
        { id: "agent-turn", role: "agent", message: "Sensitive", timestamp: null },
      ],
    });

    let conversationReads = 0;
    const prompt = "You are a concise thinking partner.";
    const elevenLabs = {
      getConversation: async () => {
        conversationReads += 1;
        throw new Error("Transcript retrieval should not occur.");
      },
      getAgent: async () => ({
        versionId: "version-1",
        prompt,
        promptHash: hashPrompt(prompt),
        raw: {},
      }),
    } as unknown as ElevenLabsGateway;
    const config = {
      host: "127.0.0.1",
      port: 8787,
      databasePath: ":memory:",
      localRetentionDays: 7,
      jobStaleAfterMinutes: 15,
      ownerToken: null,
      elevenLabsApiKey: "server-key",
      elevenLabsAgentId: "agent-test",
      elevenLabsApiBase: "https://api.elevenlabs.io",
      evaluator: null,
    } satisfies Config;

    const worker = new ImprovementWorker(config, repository, elevenLabs);
    expect(await worker.tick()).toBe(true);
    expect(conversationReads).toBe(0);
    expect(repository.listRuns()).toHaveLength(1);
  });
});
