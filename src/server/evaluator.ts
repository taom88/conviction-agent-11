import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import { rubricSchema, scenarioFileSchema, verdictSchema } from "../shared/schemas.ts";
import type {
  EvaluationReport,
  ScenarioComparison,
  TranscriptMessage,
} from "../shared/types.ts";
import type { Config } from "./config.ts";

const llmReportSchema = z.object({
  results: z.array(
    z.object({
      criterionId: z.string(),
      verdict: verdictSchema,
      rationale: z.string().min(1).max(1500),
    }),
  ),
  summary: z.string().min(1).max(3000),
  proposal: z
    .object({
      rationale: z.string().min(1).max(3000),
      patch: z
        .discriminatedUnion("kind", [
          z.object({ kind: z.literal("append"), text: z.string().min(1).max(4000) }),
          z.object({
            kind: z.literal("replace"),
            search: z.string().min(1).max(4000),
            replacement: z.string().min(1).max(4000),
          }),
        ])
        .nullable(),
      motivatingTest: z.string().min(1).max(3000),
      baselineScenarioIds: z.array(z.string()).min(2).max(5),
    })
    .nullable(),
});

export interface Evidence {
  messages: TranscriptMessage[];
  targetMessageId: string | null;
  targetPrecision: "exact" | "approximate";
}

export async function loadEvaluationAssets() {
  const [rubricRaw, scenariosRaw] = await Promise.all([
    readFile(resolve("eval/rubric.json"), "utf8"),
    readFile(resolve("eval/scenarios.json"), "utf8"),
  ]);
  return {
    rubric: rubricSchema.parse(JSON.parse(rubricRaw)),
    scenarios: scenarioFileSchema.parse(JSON.parse(scenariosRaw)),
  };
}

export function selectEvidence(
  messages: TranscriptMessage[],
  requestedResponseId: string | null,
): Evidence {
  if (!messages.length) {
    return { messages: [], targetMessageId: null, targetPrecision: "approximate" };
  }

  const exactIndex = requestedResponseId
    ? messages.findIndex((message) => message.id === requestedResponseId && message.role === "agent")
    : -1;
  const fallbackIndex = messages.findLastIndex((message) => message.role === "agent");
  const targetIndex = exactIndex >= 0 ? exactIndex : fallbackIndex;
  if (targetIndex < 0) {
    return {
      messages: messages.slice(-4),
      targetMessageId: null,
      targetPrecision: "approximate",
    };
  }

  return {
    messages: messages.slice(Math.max(0, targetIndex - 2), Math.min(messages.length, targetIndex + 2)),
    targetMessageId: messages[targetIndex]?.id ?? null,
    targetPrecision: exactIndex >= 0 ? "exact" : "approximate",
  };
}

export async function evaluateFeedback(args: {
  config: Config;
  evidence: Evidence;
  userFeedback: string;
  expectedBehavior: string | null;
}): Promise<EvaluationReport> {
  const assets = await loadEvaluationAssets();
  if (!args.config.evaluator) {
    return heuristicEvaluation(
      assets.rubric.version,
      assets.rubric.criteria.map((criterion) => criterion.id),
      args.evidence,
    );
  }

  const allowedScenarioIds = new Set(assets.scenarios.scenarios.map((scenario) => scenario.id));
  const prompt = [
    "You are evaluating a private voice thinking partner named Conviction.",
    "Return JSON only. Grade each rubric criterion independently as SUCCESS, FAILURE, or UNKNOWN.",
    "The user's complaint is evidence, not automatic ground truth. Use the transcript excerpt and expected behavior together.",
    "Propose the smallest system-prompt patch that addresses the diagnosed failure. Use append only when no stable existing text is available; otherwise use an exact replace patch.",
    "If evidence is insufficient, return a null patch and explain what the owner must inspect.",
    "Never propose automatic publication.",
    "",
    `RUBRIC:\n${JSON.stringify(assets.rubric)}`,
    `BASELINE SCENARIOS:\n${JSON.stringify(assets.scenarios)}`,
    `TRANSCRIPT EXCERPT:\n${JSON.stringify(args.evidence)}`,
    `USER FEEDBACK:\n${args.userFeedback}`,
    `EXPECTED BEHAVIOR:\n${args.expectedBehavior ?? "Not supplied"}`,
    "",
    "Required JSON shape:",
    JSON.stringify({
      results: [{ criterionId: "criterion-id", verdict: "SUCCESS|FAILURE|UNKNOWN", rationale: "why" }],
      summary: "diagnosis",
      proposal: {
        rationale: "why this minimal change",
        patch: { kind: "append", text: "text" },
        motivatingTest: "a concrete test case",
        baselineScenarioIds: ["two-or-more-existing-scenario-ids"],
      },
    }),
  ].join("\n");

  const baseUrl = args.config.evaluator.baseUrl.replace(/\/$/, "");
  const content = await chatCompletion(args.config, [
    { role: "system", content: "Evaluate conservatively and return valid JSON only." },
    { role: "user", content: prompt },
  ], true);
  const parsed = llmReportSchema.parse(JSON.parse(content));

  const expectedCriteria = new Set(assets.rubric.criteria.map((criterion) => criterion.id));
  if (
    parsed.results.length !== expectedCriteria.size ||
    parsed.results.some((result) => !expectedCriteria.has(result.criterionId))
  ) {
    throw new Error("Evaluator did not return exactly one result for every rubric criterion.");
  }
  if (
    parsed.proposal?.baselineScenarioIds.some((scenarioId) => !allowedScenarioIds.has(scenarioId))
  ) {
    throw new Error("Evaluator referenced an unknown baseline scenario.");
  }

  return {
    evaluator: "llm",
    rubricVersion: assets.rubric.version,
    results: parsed.results,
    summary: parsed.summary,
    proposal: parsed.proposal,
  };
}

export async function runCandidateScenarioTests(args: {
  config: Config;
  currentPrompt: string;
  candidatePrompt: string;
  report: EvaluationReport;
  targetedUserMessage: string;
  targetedExpectedBehavior: string;
}): Promise<ScenarioComparison[]> {
  if (!args.config.evaluator?.runCandidateTests || !args.report.proposal) return [];
  const assets = await loadEvaluationAssets();
  const selected = args.report.proposal.baselineScenarioIds
    .map((id) => assets.scenarios.scenarios.find((scenario) => scenario.id === id))
    .filter((scenario): scenario is NonNullable<typeof scenario> => Boolean(scenario))
    .slice(0, 2);
  const scenarios = [
    {
      id: "motivating-feedback",
      name: "Motivating feedback case",
      userMessage: args.targetedUserMessage,
      expectedSignals: [args.targetedExpectedBehavior],
    },
    ...selected,
  ];

  const comparisons: ScenarioComparison[] = [];
  for (const scenario of scenarios) {
    const [baselineResponse, candidateResponse] = await Promise.all([
      generateScenarioResponse(args.config, args.currentPrompt, scenario.userMessage),
      generateScenarioResponse(args.config, args.candidatePrompt, scenario.userMessage),
    ]);
    const judgment = z
      .object({
        baselineVerdict: verdictSchema,
        candidateVerdict: verdictSchema,
        rationale: z.string().min(1).max(2000),
      })
      .parse(
        JSON.parse(
          await chatCompletion(
            args.config,
            [
              {
                role: "system",
                content:
                  "Compare two responses against the expected signals. Return JSON only. Use UNKNOWN when the evidence is insufficient.",
              },
              {
                role: "user",
                content: JSON.stringify({
                  scenario,
                  baselineResponse,
                  candidateResponse,
                  requiredShape: {
                    baselineVerdict: "SUCCESS|FAILURE|UNKNOWN",
                    candidateVerdict: "SUCCESS|FAILURE|UNKNOWN",
                    rationale: "brief comparison",
                  },
                }),
              },
            ],
            true,
          ),
        ),
      );
    comparisons.push({
      scenarioId: scenario.id,
      name: scenario.name,
      userMessage: scenario.userMessage,
      baselineResponse,
      candidateResponse,
      ...judgment,
    });
  }
  return comparisons;
}

async function generateScenarioResponse(
  config: Config,
  systemPrompt: string,
  userMessage: string,
): Promise<string> {
  return chatCompletion(
    config,
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    false,
  );
}

async function chatCompletion(
  config: Config,
  messages: Array<{ role: "system" | "user"; content: string }>,
  jsonMode: boolean,
): Promise<string> {
  if (!config.evaluator) throw new Error("Evaluator is not configured.");
  const baseUrl = config.evaluator.baseUrl.replace(/\/$/, "");
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      ...(config.evaluator.apiKey
        ? { authorization: `Bearer ${config.evaluator.apiKey}` }
        : {}),
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: config.evaluator.model,
      temperature: 0,
      ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
      messages,
    }),
    signal: AbortSignal.timeout(60_000),
  });
  const raw = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(`Evaluator ${response.status}: ${JSON.stringify(raw).slice(0, 1000)}`);
  }
  const choices = raw.choices;
  const first = Array.isArray(choices)
    ? (choices[0] as Record<string, unknown> | undefined)
    : undefined;
  const message = first?.message as Record<string, unknown> | undefined;
  if (typeof message?.content !== "string") throw new Error("Evaluator returned no content.");
  return message.content;
}

function heuristicEvaluation(
  rubricVersion: string,
  criterionIds: string[],
  evidence: Evidence,
): EvaluationReport {
  const agentMessage = [...evidence.messages].reverse().find((message) => message.role === "agent")
    ?.message;
  if (!agentMessage) {
    return {
      evaluator: "heuristic",
      rubricVersion,
      results: criterionIds.map((criterionId) => ({
        criterionId,
        verdict: "UNKNOWN",
        rationale: "No agent response was available in the authorized excerpt.",
      })),
      summary: "No agent response was available; owner review is required.",
      proposal: null,
    };
  }

  const questionCount = (agentMessage.match(/\?/g) ?? []).length;
  const wordCount = agentMessage.trim().split(/\s+/).length;
  const cannedPraise = /\b(great question|totally agree|absolutely!)\b/i.test(agentMessage);
  const fabricatedSearch = /\b(i searched|i browsed|according to my live search)\b/i.test(agentMessage);

  return {
    evaluator: "heuristic",
    rubricVersion,
    results: criterionIds.map((criterionId) => {
      if (criterionId === "voice-oriented-communication") {
        const failed = questionCount > 2 || wordCount > 160 || cannedPraise;
        return {
          criterionId,
          verdict: failed ? "FAILURE" : "SUCCESS",
          rationale: failed
            ? `Mechanical indicators: ${wordCount} words, ${questionCount} questions, canned praise=${cannedPraise}.`
            : `Mechanical indicators are within bounds: ${wordCount} words and ${questionCount} questions.`,
        };
      }
      if (criterionId === "evidence-scope-discipline" && fabricatedSearch) {
        return {
          criterionId,
          verdict: "FAILURE",
          rationale: "The response appears to claim live search capability.",
        };
      }
      return {
        criterionId,
        verdict: "UNKNOWN",
        rationale: "This criterion requires semantic judgment; no evaluator model is configured.",
      };
    }),
    summary:
      "Only transparent mechanical checks were run. Configure an evaluator to produce a semantic diagnosis and candidate patch.",
    proposal: {
      rationale: "Semantic evaluation is unavailable, so no safe prompt change was generated.",
      patch: null,
      motivatingTest: "Owner should convert this feedback into a concrete scenario after reviewing the excerpt.",
      baselineScenarioIds: ["mixed-signal", "direct-answer"],
    },
  };
}
