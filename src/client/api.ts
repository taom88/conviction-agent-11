import type { FeedbackInput } from "../shared/schemas.ts";
import type { FeedbackRecord, ProposalRecord } from "../shared/types.ts";

let ownerToken = sessionStorage.getItem("conviction-owner-token") ?? "";

export function setOwnerToken(token: string): void {
  ownerToken = token.trim();
  if (ownerToken) sessionStorage.setItem("conviction-owner-token", ownerToken);
  else sessionStorage.removeItem("conviction-owner-token");
}

export function hasOwnerToken(): boolean {
  return Boolean(ownerToken);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      authorization: `Bearer ${ownerToken}`,
      "content-type": "application/json",
      ...init.headers,
    },
  });
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? `Request failed (${response.status}).`);
  return body;
}

export const api = {
  health: () => request<{ ok: boolean; evaluator: "llm" | "heuristic" }>("/api/health"),
  session: () =>
    request<
      | { signedUrl: string; mode: "private" }
      | { agentId: string; mode: "public" }
    >("/api/session", { method: "POST" }),
  createFeedback: (input: FeedbackInput) =>
    request<{ feedback: FeedbackRecord; duplicate: boolean; analysisQueued: boolean }>(
      "/api/feedback",
      { method: "POST", body: JSON.stringify(input) },
    ),
  listFeedback: () => request<{ feedback: FeedbackRecord[] }>("/api/feedback"),
  deleteFeedback: (id: string) =>
    request<{ deleted: boolean }>(`/api/feedback/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
  listRuns: () => request<{ runs: Array<Record<string, unknown>> }>("/api/evaluation/runs"),
  listProposals: () => request<{ proposals: ProposalRecord[] }>("/api/proposals"),
  listDeployments: () =>
    request<{ deployments: Array<Record<string, unknown>> }>("/api/deployments"),
  decideProposal: (
    id: string,
    decision: "approve" | "reject",
    confirmation?: string,
    note?: string,
  ) =>
    request<Record<string, unknown>>(`/api/proposals/${encodeURIComponent(id)}/decision`, {
      method: "POST",
      body: JSON.stringify({ decision, confirmation, note }),
    }),
  rollback: (id: string, confirmation: string) =>
    request<Record<string, unknown>>(`/api/deployments/${encodeURIComponent(id)}/rollback`, {
      method: "POST",
      body: JSON.stringify({ confirmation }),
    }),
};
