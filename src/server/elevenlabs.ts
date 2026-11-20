import { createHash } from "node:crypto";
import type { Config } from "./config.ts";
import type { TranscriptMessage } from "../shared/types.ts";

export interface AgentSnapshot {
  versionId: string | null;
  prompt: string;
  promptHash: string;
  raw: unknown;
}

export class ElevenLabsGateway {
  constructor(private readonly config: Config) {}

  async getSignedUrl(): Promise<{ signedUrl: string }> {
    this.requireApiKey("signed URL generation");
    const query = new URLSearchParams({ agent_id: this.requireAgentId() });
    const response = await this.request(
      `/v1/convai/conversation/get_signed_url?${query.toString()}`,
    );
    const signedUrl = asRecord(response).signed_url;
    if (typeof signedUrl !== "string") {
      throw new Error("ElevenLabs did not return a signed URL.");
    }
    return { signedUrl };
  }

  async getConversation(conversationId: string): Promise<{
    messages: TranscriptMessage[];
    raw: unknown;
  }> {
    this.requireApiKey("conversation retrieval");
    const raw = await this.request(`/v1/convai/conversations/${encodeURIComponent(conversationId)}`);
    const transcript = asRecord(raw).transcript;
    const messages = Array.isArray(transcript)
      ? transcript.flatMap((entry): TranscriptMessage[] => {
          const record = asRecord(entry);
          const role = record.role === "agent" ? "agent" : record.role === "user" ? "user" : null;
          const message =
            typeof record.message === "string"
              ? record.message
              : typeof record.text === "string"
                ? record.text
                : null;
          if (!role || !message) return [];
          const idCandidate = record.id ?? record.message_id ?? record.turn_id;
          const timeCandidate = record.timestamp ?? record.time_in_call_secs;
          return [
            {
              id: typeof idCandidate === "string" ? idCandidate : null,
              role,
              message,
              timestamp:
                typeof timeCandidate === "string"
                  ? timeCandidate
                  : typeof timeCandidate === "number"
                    ? String(timeCandidate)
                    : null,
            },
          ];
        })
      : [];
    return { messages, raw };
  }

  async getAgent(): Promise<AgentSnapshot> {
    this.requireApiKey("agent configuration retrieval");
    const raw = await this.request(
      `/v1/convai/agents/${encodeURIComponent(this.requireAgentId())}`,
    );
    const root = asRecord(raw);
    const conversationConfig = asRecord(root.conversation_config);
    const agent = asRecord(conversationConfig.agent);
    const promptConfig = asRecord(agent.prompt);
    const prompt = promptConfig.prompt;
    if (typeof prompt !== "string") throw new Error("The active agent prompt was not readable.");
    const versionCandidate = root.version_id ?? root.agent_version_id;
    return {
      versionId: typeof versionCandidate === "string" ? versionCandidate : null,
      prompt,
      promptHash: hashPrompt(prompt),
      raw,
    };
  }

  async updatePrompt(prompt: string): Promise<unknown> {
    this.requireApiKey("agent updates");
    return this.request(`/v1/convai/agents/${encodeURIComponent(this.requireAgentId())}`, {
      method: "PATCH",
      body: JSON.stringify({
        conversation_config: {
          agent: {
            prompt: { prompt },
          },
        },
      }),
    });
  }

  private async request(path: string, init: RequestInit = {}): Promise<unknown> {
    const response = await fetch(`${this.config.elevenLabsApiBase}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...(this.config.elevenLabsApiKey
          ? { "xi-api-key": this.config.elevenLabsApiKey }
          : {}),
        ...init.headers,
      },
      signal: AbortSignal.timeout(20_000),
    });
    const text = await response.text();
    let body: unknown;
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = { message: text };
    }
    if (!response.ok) {
      const detail = asRecord(body).detail ?? asRecord(body).message ?? response.statusText;
      throw new Error(`ElevenLabs ${response.status}: ${String(detail)}`);
    }
    return body;
  }

  private requireApiKey(operation: string): void {
    if (!this.config.elevenLabsApiKey) {
      throw new Error(`ELEVENLABS_API_KEY is required for ${operation}.`);
    }
  }

  private requireAgentId(): string {
    if (!this.config.elevenLabsAgentId) {
      throw new Error("ELEVENLABS_AGENT_ID is required for this operation.");
    }
    return this.config.elevenLabsAgentId;
  }
}

export function hashPrompt(prompt: string): string {
  return createHash("sha256").update(prompt).digest("hex");
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}
