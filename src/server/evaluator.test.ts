import { describe, expect, it } from "vitest";
import { selectEvidence } from "./evaluator.ts";
import type { TranscriptMessage } from "../shared/types.ts";

const messages: TranscriptMessage[] = [
  { id: "u1", role: "user", message: "First", timestamp: null },
  { id: "a1", role: "agent", message: "First answer", timestamp: null },
  { id: "u2", role: "user", message: "Second", timestamp: null },
  { id: "a2", role: "agent", message: "Second answer", timestamp: null },
  { id: "u3", role: "user", message: "Follow-up", timestamp: null },
];

describe("selectEvidence", () => {
  it("targets an exact agent response and keeps only nearby context", () => {
    const evidence = selectEvidence(messages, "a1");
    expect(evidence.targetPrecision).toBe("exact");
    expect(evidence.targetMessageId).toBe("a1");
    expect(evidence.messages.map((message) => message.id)).toEqual(["u1", "a1", "u2"]);
  });

  it("falls back honestly to the latest agent response", () => {
    const evidence = selectEvidence(messages, "missing");
    expect(evidence.targetPrecision).toBe("approximate");
    expect(evidence.targetMessageId).toBe("a2");
    expect(evidence.messages.map((message) => message.id)).toEqual(["a1", "u2", "a2", "u3"]);
  });
});
