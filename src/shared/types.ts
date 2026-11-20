import type { Verdict } from "./schemas.ts";

export interface TranscriptMessage {
  id: string | null;
  role: "user" | "agent";
  message: string;
  timestamp: string | null;
}

export interface CriterionResult {
  criterionId: string;
  verdict: Verdict;
  rationale: string;
}

export interface ImprovementPatch {
  kind: "append" | "replace";
  text?: string;
  search?: string;
  replacement?: string;
}

export interface EvaluationReport {
  evaluator: "heuristic" | "llm";
  rubricVersion: string;
  results: CriterionResult[];
  summary: string;
  proposal: {
    rationale: string;
    patch: ImprovementPatch | null;
    motivatingTest: string;
    baselineScenarioIds: string[];
  } | null;
  scenarioRuns?: ScenarioComparison[];
}

export interface ScenarioComparison {
  scenarioId: string;
  name: string;
  userMessage: string;
  baselineResponse: string;
  candidateResponse: string;
  baselineVerdict: Verdict;
  candidateVerdict: Verdict;
  rationale: string;
}

export interface FeedbackRecord {
  id: string;
  conversationId: string;
  responseId: string | null;
  userFeedback: string;
  expectedBehavior: string | null;
  status: string;
  responseReferencePrecision: "exact" | "approximate";
  createdAt: string;
  updatedAt: string;
}

export interface ProposalRecord {
  id: string;
  feedbackId: string;
  status: string;
  rationale: string;
  patch: ImprovementPatch | null;
  report: EvaluationReport;
  createdAt: string;
}
