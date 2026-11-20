import { resolve } from "node:path";
import { loadEnvFile } from "node:process";

for (const file of [".env.local", ".env"]) {
  try {
    loadEnvFile(resolve(file));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") throw error;
  }
}

function optional(name: string): string | null {
  return process.env[name]?.trim() || null;
}

export interface Config {
  host: string;
  port: number;
  databasePath: string;
  localRetentionDays: number;
  jobStaleAfterMinutes: number;
  ownerToken: string | null;
  elevenLabsApiKey: string | null;
  elevenLabsAgentId: string | null;
  elevenLabsApiBase: string;
  evaluator: null | {
    baseUrl: string;
    apiKey: string | null;
    model: string;
    runCandidateTests: boolean;
  };
}

export function loadConfig(): Config {
  const evaluatorBaseUrl = optional("EVALUATOR_BASE_URL");
  const evaluatorApiKey = optional("EVALUATOR_API_KEY");
  const evaluatorModel = optional("EVALUATOR_MODEL");

  const partiallyConfigured = [evaluatorBaseUrl, evaluatorModel].some(Boolean);
  const evaluator = [evaluatorBaseUrl, evaluatorModel].every(Boolean)
    ? {
        baseUrl: evaluatorBaseUrl as string,
        apiKey: evaluatorApiKey,
        model: evaluatorModel as string,
        runCandidateTests: process.env.EVALUATOR_RUN_CANDIDATE_TESTS === "true",
      }
    : null;

  if (partiallyConfigured && !evaluator) {
    throw new Error(
      "EVALUATOR_BASE_URL and EVALUATOR_MODEL must be set together. EVALUATOR_API_KEY is optional for local endpoints.",
    );
  }

  const port = Number(process.env.APP_PORT ?? 8787);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("APP_PORT must be a valid TCP port.");
  }

  const localRetentionDays = Number(process.env.LOCAL_RETENTION_DAYS ?? 7);
  if (!Number.isInteger(localRetentionDays) || localRetentionDays < 0 || localRetentionDays > 3650) {
    throw new Error("LOCAL_RETENTION_DAYS must be an integer from 0 to 3650.");
  }

  const jobStaleAfterMinutes = Number(process.env.JOB_STALE_AFTER_MINUTES ?? 15);
  if (!Number.isInteger(jobStaleAfterMinutes) || jobStaleAfterMinutes < 1 || jobStaleAfterMinutes > 1440) {
    throw new Error("JOB_STALE_AFTER_MINUTES must be an integer from 1 to 1440.");
  }

  const host = process.env.APP_HOST?.trim() || "127.0.0.1";
  const ownerToken = optional("OWNER_TOKEN");
  assertSafeExposure(host, ownerToken);

  return {
    host,
    port,
    databasePath: resolve(process.env.DATABASE_PATH?.trim() || ".data/conviction.db"),
    localRetentionDays,
    jobStaleAfterMinutes,
    ownerToken,
    elevenLabsApiKey: optional("ELEVENLABS_API_KEY"),
    elevenLabsAgentId: optional("ELEVENLABS_AGENT_ID"),
    elevenLabsApiBase:
      process.env.ELEVENLABS_API_BASE?.trim() || "https://api.elevenlabs.io",
    evaluator,
  };
}

export function assertSafeExposure(host: string, ownerToken: string | null): void {
  const normalized = host.trim().toLowerCase().replace(/^\[|\]$/g, "");
  const loopback = normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
  if (!loopback && !ownerToken) {
    throw new Error("OWNER_TOKEN is required when APP_HOST is not a loopback address.");
  }
  if (!loopback && ownerToken && ownerToken.length < 32) {
    throw new Error("OWNER_TOKEN must be at least 32 characters for a non-loopback bind.");
  }
}
