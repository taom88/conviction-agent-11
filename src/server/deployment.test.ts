import { describe, expect, it } from "vitest";
import { applyPatch, publishProposal } from "./deployment.ts";
import type { Repository } from "./database.ts";
import type { ElevenLabsGateway } from "./elevenlabs.ts";

describe("applyPatch", () => {
  it("appends a scoped instruction", () => {
    expect(applyPatch("Base prompt\n", { kind: "append", text: "New rule" })).toBe(
      "Base prompt\n\nNew rule\n",
    );
  });

  it("replaces one exact passage", () => {
    expect(
      applyPatch("Before old after", {
        kind: "replace",
        search: "old",
        replacement: "new",
      }),
    ).toBe("Before new after");
  });

  it("rejects ambiguous replacements", () => {
    expect(() =>
      applyPatch("same and same", {
        kind: "replace",
        search: "same",
        replacement: "different",
      }),
    ).toThrow(/ambiguous/);
  });

  it("refuses to publish over a prompt that changed after evaluation", async () => {
    const repository = {
      getProposal: () => ({
        id: "proposal-1",
        feedbackId: "feedback-1",
        status: "ready-for-approval",
        rationale: "Test",
        patch: { kind: "append", text: "New rule" },
        report: {},
        createdAt: new Date().toISOString(),
        baseVersionId: null,
        basePromptHash: "old-hash",
      }),
    } as unknown as Repository;
    let updated = false;
    const elevenLabs = {
      getAgent: async () => ({
        versionId: null,
        prompt: "A newer prompt",
        promptHash: "new-hash",
        raw: {},
      }),
      updatePrompt: async () => { updated = true; },
    } as unknown as ElevenLabsGateway;

    await expect(
      publishProposal({ proposalId: "proposal-1", repository, elevenLabs }),
    ).rejects.toThrow(/changed/);
    expect(updated).toBe(false);
  });
});
