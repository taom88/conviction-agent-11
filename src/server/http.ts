import { timingSafeEqual } from "node:crypto";
import { createReadStream, existsSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { ZodError } from "zod";
import { feedbackInputSchema, proposalDecisionSchema } from "../shared/schemas.ts";
import type { Config } from "./config.ts";
import type { Repository } from "./database.ts";
import { publishProposal, rollbackDeployment } from "./deployment.ts";
import type { ElevenLabsGateway } from "./elevenlabs.ts";
import { loadEvaluationAssets } from "./evaluator.ts";
import type { ImprovementWorker } from "./worker.ts";

interface Dependencies {
  config: Config;
  repository: Repository;
  elevenLabs: ElevenLabsGateway;
  worker: ImprovementWorker;
}

export function createRequestHandler(dependencies: Dependencies) {
  return async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    try {
      const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
      if (url.pathname === "/api/health" && request.method === "GET") {
        return json(response, 200, { ok: true, evaluator: dependencies.config.evaluator ? "llm" : "heuristic" });
      }

      if (url.pathname.startsWith("/api/")) {
        if (!authorized(request, dependencies.config.ownerToken)) {
          return json(response, 401, { error: "Unauthorized" });
        }
        return await handleApi(request, response, url, dependencies);
      }

      return serveStatic(url.pathname, response);
    } catch (error) {
      if (error instanceof ZodError) {
        return json(response, 400, { error: "Invalid request", issues: error.issues });
      }
      const message = error instanceof Error ? error.message : "Unknown error";
      const conflict = /changed|already|not ready|ambiguous|no longer matches/i.test(message);
      console.error(error);
      return json(response, conflict ? 409 : 500, { error: message });
    }
  };
}

async function handleApi(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  dependencies: Dependencies,
): Promise<void> {
  const { repository, elevenLabs, worker } = dependencies;

  if (url.pathname === "/api/session" && request.method === "POST") {
    if (!dependencies.config.elevenLabsAgentId) {
      return json(response, 503, { error: "Voice is not configured. Set ELEVENLABS_AGENT_ID locally." });
    }
    return json(
      response,
      200,
      dependencies.config.elevenLabsApiKey
        ? { ...(await elevenLabs.getSignedUrl()), mode: "private" }
        : { agentId: dependencies.config.elevenLabsAgentId, mode: "public" },
    );
  }
  if (url.pathname === "/api/feedback" && request.method === "GET") {
    return json(response, 200, { feedback: repository.listFeedback() });
  }
  if (url.pathname === "/api/feedback" && request.method === "POST") {
    const input = feedbackInputSchema.parse(await readJson(request));
    const result = repository.createFeedback(input);
    void worker.tick();
    return json(response, result.duplicate ? 200 : 202, {
      feedback: result.record,
      duplicate: result.duplicate,
      analysisQueued: true,
    });
  }
  const feedbackMatch = url.pathname.match(/^\/api\/feedback\/([^/]+)$/);
  if (feedbackMatch && request.method === "DELETE") {
    const feedbackId = decodeURIComponent(feedbackMatch[1] as string);
    const deleted = repository.deleteFeedback(feedbackId);
    return json(response, deleted ? 200 : 404, { deleted });
  }
  if (url.pathname === "/api/evaluation/rubric" && request.method === "GET") {
    return json(response, 200, await loadEvaluationAssets());
  }
  if (url.pathname === "/api/evaluation/runs" && request.method === "GET") {
    return json(response, 200, { runs: repository.listRuns() });
  }
  if (url.pathname === "/api/evaluation/run-next" && request.method === "POST") {
    return json(response, 200, { processed: await worker.tick() });
  }
  if (url.pathname === "/api/proposals" && request.method === "GET") {
    return json(response, 200, { proposals: repository.listProposals() });
  }
  if (url.pathname === "/api/deployments" && request.method === "GET") {
    return json(response, 200, { deployments: repository.listDeployments() });
  }

  const proposalMatch = url.pathname.match(/^\/api\/proposals\/([^/]+)\/decision$/);
  if (proposalMatch && request.method === "POST") {
    const proposalId = decodeURIComponent(proposalMatch[1] as string);
    const decision = proposalDecisionSchema.parse(await readJson(request));
    if (decision.decision === "reject") {
      repository.updateProposalStatus(proposalId, "rejected", decision.note);
      return json(response, 200, { status: "rejected" });
    }
    if (decision.confirmation !== "PUBLISH") {
      return json(response, 400, { error: "Type PUBLISH to confirm a live agent change." });
    }
    const result = await publishProposal({ proposalId, repository, elevenLabs });
    return json(response, 200, { status: "published", ...result });
  }

  const rollbackMatch = url.pathname.match(/^\/api\/deployments\/([^/]+)\/rollback$/);
  if (rollbackMatch && request.method === "POST") {
    const body = (await readJson(request)) as Record<string, unknown>;
    if (body.confirmation !== "ROLLBACK") {
      return json(response, 400, { error: "Type ROLLBACK to confirm." });
    }
    const deploymentId = decodeURIComponent(rollbackMatch[1] as string);
    const result = await rollbackDeployment({ deploymentId, repository, elevenLabs });
    return json(response, 200, { status: "rolled-back", ...result });
  }

  return json(response, 404, { error: "Not found" });
}

function authorized(request: IncomingMessage, ownerToken: string | null): boolean {
  if (!ownerToken) return true;
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(header.slice(7));
  const expected = Buffer.from(ownerToken);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 100_000) throw new Error("Request body is too large.");
    chunks.push(buffer);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  response.end(JSON.stringify(body));
}

async function serveStatic(pathname: string, response: ServerResponse): Promise<void> {
  const dist = resolve("dist");
  const requested = normalize(pathname).replace(/^(\.\.(\/|\\|$))+/, "");
  let file = join(dist, requested === "/" ? "index.html" : requested);
  if (!file.startsWith(dist)) return json(response, 404, { error: "Not found" });
  if (!existsSync(file) || !statSync(file).isFile()) file = join(dist, "index.html");
  if (!existsSync(file)) {
    return json(response, 404, {
      error: "Web build not found. Run npm run dev or npm run build.",
    });
  }
  const contentTypes: Record<string, string> = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".svg": "image/svg+xml",
    ".json": "application/json",
  };
  response.writeHead(200, {
    "content-type": contentTypes[extname(file)] ?? "application/octet-stream",
    "cache-control": extname(file) === ".html" ? "no-store" : "public, max-age=31536000, immutable",
    "x-content-type-options": "nosniff",
  });
  createReadStream(file).pipe(response);
}
