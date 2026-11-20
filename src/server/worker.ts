import type { Config } from "./config.ts";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Repository } from "./database.ts";
import {
  evaluateFeedback,
  loadEvaluationAssets,
  runCandidateScenarioTests,
  selectEvidence,
} from "./evaluator.ts";
import type { ElevenLabsGateway } from "./elevenlabs.ts";
import { applyPatch } from "./deployment.ts";

export class ImprovementWorker {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly config: Config,
    private readonly repository: Repository,
    private readonly elevenLabs: ElevenLabsGateway,
  ) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), 1_500);
    this.timer.unref();
    void this.tick();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async tick(): Promise<boolean> {
    if (this.running) return false;
    this.repository.recoverStaleJobs(this.config.jobStaleAfterMinutes);
    const job = this.repository.claimNextJob();
    if (!job) return false;
    this.running = true;
    try {
      const feedback = this.repository.getFeedbackWorkerInput(job.feedbackId);
      if (!feedback) throw new Error("Feedback record disappeared before evaluation.");
      const conversationId = String(feedback.conversation_id);
      const includeExcerpt = Number(feedback.include_excerpt) === 1;
      const assets = await loadEvaluationAssets();
      const providerWritable = Boolean(this.config.elevenLabsApiKey);
      const conversation = !includeExcerpt
        ? { messages: [], raw: null }
        : providerWritable
        ? await this.elevenLabs.getConversation(conversationId)
        : {
            messages: parseClientEvidence(feedback.client_evidence_json),
            raw: null,
          };
      const agent = providerWritable
        ? await this.elevenLabs.getAgent()
        : await localAgentSnapshot();
      const evidence = selectEvidence(
        conversation.messages,
        (feedback.response_id as string | null) ?? null,
      );
      const report = await evaluateFeedback({
        config: this.config,
        evidence,
        userFeedback: String(feedback.user_feedback),
        expectedBehavior: (feedback.expected_behavior as string | null) ?? null,
      });
      if (report.proposal?.patch && this.config.evaluator?.runCandidateTests) {
        const candidatePrompt = applyPatch(agent.prompt, report.proposal.patch);
        const targetedUserMessage =
          [...evidence.messages].reverse().find((message) => message.role === "user")?.message ??
          String(feedback.user_feedback);
        report.scenarioRuns = await runCandidateScenarioTests({
          config: this.config,
          currentPrompt: agent.prompt,
          candidatePrompt,
          report,
          targetedUserMessage,
          targetedExpectedBehavior:
            (feedback.expected_behavior as string | null) ?? String(feedback.user_feedback),
        });
      }
      this.repository.completeJob({
        jobId: job.id,
        feedbackId: job.feedbackId,
        rubricVersion: assets.rubric.version,
        evidence,
        report,
        baseVersionId: agent.versionId,
        basePromptHash: agent.promptHash,
        providerWritable,
      });
      return true;
    } catch (error) {
      this.repository.failJob(job.id, job.feedbackId, error, job.attempts < 3);
      return false;
    } finally {
      this.running = false;
    }
  }
}

function parseClientEvidence(value: unknown) {
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function localAgentSnapshot() {
  const prompt = await readFile(resolve("agent/conviction.system.md"), "utf8");
  const { hashPrompt } = await import("./elevenlabs.ts");
  return { versionId: null, prompt, promptHash: hashPrompt(prompt), raw: null };
}
