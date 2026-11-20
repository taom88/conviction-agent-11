import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { FeedbackInput } from "../shared/schemas.ts";
import type {
  EvaluationReport,
  FeedbackRecord,
  ImprovementPatch,
  ProposalRecord,
} from "../shared/types.ts";

type SqlValue = string | number | bigint | null;

export class Repository {
  readonly db: DatabaseSync;

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS feedback (
        id TEXT PRIMARY KEY,
        idempotency_key TEXT NOT NULL UNIQUE,
        conversation_id TEXT NOT NULL,
        response_id TEXT,
        response_timestamp TEXT,
        user_feedback TEXT NOT NULL,
        expected_behavior TEXT,
        include_excerpt INTEGER NOT NULL DEFAULT 0,
        client_evidence_json TEXT,
        response_reference_precision TEXT NOT NULL CHECK (response_reference_precision IN ('exact', 'approximate')),
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        feedback_id TEXT NOT NULL UNIQUE REFERENCES feedback(id) ON DELETE CASCADE,
        status TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        locked_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS evaluation_runs (
        id TEXT PRIMARY KEY,
        feedback_id TEXT NOT NULL REFERENCES feedback(id) ON DELETE CASCADE,
        rubric_version TEXT NOT NULL,
        evaluator TEXT NOT NULL,
        status TEXT NOT NULL,
        evidence_json TEXT NOT NULL,
        report_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        completed_at TEXT
      );

      CREATE TABLE IF NOT EXISTS proposals (
        id TEXT PRIMARY KEY,
        feedback_id TEXT NOT NULL REFERENCES feedback(id) ON DELETE CASCADE,
        run_id TEXT NOT NULL REFERENCES evaluation_runs(id) ON DELETE CASCADE,
        status TEXT NOT NULL,
        rationale TEXT NOT NULL,
        patch_json TEXT,
        base_version_id TEXT,
        base_prompt_hash TEXT,
        report_json TEXT NOT NULL,
        owner_note TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS deployments (
        id TEXT PRIMARY KEY,
        proposal_id TEXT REFERENCES proposals(id),
        action TEXT NOT NULL CHECK (action IN ('publish', 'rollback')),
        before_prompt TEXT NOT NULL,
        before_prompt_hash TEXT NOT NULL,
        after_prompt TEXT NOT NULL,
        after_prompt_hash TEXT NOT NULL,
        provider_response_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        rolled_back_at TEXT
      );

      CREATE TABLE IF NOT EXISTS audit_log (
        id TEXT PRIMARY KEY,
        action TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        detail_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);
    try {
      this.db.exec("ALTER TABLE feedback ADD COLUMN client_evidence_json TEXT;");
    } catch (error) {
      if (!String(error).includes("duplicate column name")) throw error;
    }
  }

  createFeedback(input: FeedbackInput): { record: FeedbackRecord; duplicate: boolean } {
    const existing = this.db
      .prepare("SELECT * FROM feedback WHERE idempotency_key = ?")
      .get(input.idempotencyKey) as Record<string, SqlValue> | undefined;
    if (existing) return { record: mapFeedback(existing), duplicate: true };

    const now = new Date().toISOString();
    const feedbackId = crypto.randomUUID();
    const precision = input.responseId ? "exact" : "approximate";
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db
        .prepare(`
          INSERT INTO feedback (
            id, idempotency_key, conversation_id, response_id, response_timestamp,
            user_feedback, expected_behavior, include_excerpt, client_evidence_json,
            response_reference_precision, status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'received', ?, ?)
        `)
        .run(
          feedbackId,
          input.idempotencyKey,
          input.conversationId,
          input.responseId ?? null,
          input.responseTimestamp ?? null,
          input.userFeedback,
          input.expectedBehavior ?? null,
          input.includeExcerpt ? 1 : 0,
          input.evidenceMessages?.length ? JSON.stringify(input.evidenceMessages) : null,
          precision,
          now,
          now,
        );
      this.db
        .prepare(`
          INSERT INTO jobs (id, feedback_id, status, created_at, updated_at)
          VALUES (?, ?, 'queued', ?, ?)
        `)
        .run(crypto.randomUUID(), feedbackId, now, now);
      this.audit("feedback.created", "feedback", feedbackId, { precision });
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }

    return {
      record: this.getFeedback(feedbackId) as FeedbackRecord,
      duplicate: false,
    };
  }

  getFeedback(id: string): FeedbackRecord | null {
    const row = this.db.prepare("SELECT * FROM feedback WHERE id = ?").get(id) as
      | Record<string, SqlValue>
      | undefined;
    return row ? mapFeedback(row) : null;
  }

  listFeedback(limit = 50): FeedbackRecord[] {
    const rows = this.db
      .prepare("SELECT * FROM feedback ORDER BY created_at DESC LIMIT ?")
      .all(limit) as Record<string, SqlValue>[];
    return rows.map(mapFeedback);
  }

  deleteFeedback(id: string): boolean {
    const exists = Boolean(this.db.prepare("SELECT 1 FROM feedback WHERE id = ?").get(id));
    if (!exists) return false;

    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db
        .prepare(`
          UPDATE deployments SET proposal_id = NULL
          WHERE proposal_id IN (SELECT id FROM proposals WHERE feedback_id = ?)
        `)
        .run(id);
      this.db.prepare("DELETE FROM feedback WHERE id = ?").run(id);
      this.audit("feedback.deleted", "feedback", id, { reason: "owner-request" });
      this.db.exec("COMMIT");
      return true;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  purgeExpiredFeedback(retentionDays: number, now = new Date()): number {
    const cutoff = new Date(now.getTime() - retentionDays * 86_400_000).toISOString();
    const rows = this.db
      .prepare("SELECT id FROM feedback WHERE created_at <= ?")
      .all(cutoff) as Array<{ id: string }>;
    for (const row of rows) {
      this.deleteFeedback(row.id);
    }
    return rows.length;
  }

  claimNextJob(): null | { id: string; feedbackId: string; attempts: number } {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const row = this.db
        .prepare(`
          SELECT * FROM jobs
          WHERE status IN ('queued', 'retry')
          ORDER BY created_at ASC LIMIT 1
        `)
        .get() as Record<string, SqlValue> | undefined;
      if (!row) {
        this.db.exec("COMMIT");
        return null;
      }
      const now = new Date().toISOString();
      this.db
        .prepare(`
          UPDATE jobs SET status = 'analyzing', attempts = attempts + 1,
            locked_at = ?, updated_at = ? WHERE id = ?
        `)
        .run(now, now, row.id as string);
      this.db
        .prepare("UPDATE feedback SET status = 'analyzing', updated_at = ? WHERE id = ?")
        .run(now, row.feedback_id as string);
      this.db.exec("COMMIT");
      return {
        id: row.id as string,
        feedbackId: row.feedback_id as string,
        attempts: Number(row.attempts) + 1,
      };
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  getFeedbackWorkerInput(id: string): Record<string, SqlValue> | null {
    return (
      (this.db.prepare("SELECT * FROM feedback WHERE id = ?").get(id) as
        | Record<string, SqlValue>
        | undefined) ?? null
    );
  }

  completeJob(args: {
    jobId: string;
    feedbackId: string;
    rubricVersion: string;
    evidence: unknown;
    report: EvaluationReport;
    baseVersionId: string | null;
    basePromptHash: string | null;
    providerWritable: boolean;
  }): void {
    const now = new Date().toISOString();
    const runId = crypto.randomUUID();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db
        .prepare(`
          INSERT INTO evaluation_runs (
            id, feedback_id, rubric_version, evaluator, status,
            evidence_json, report_json, created_at, completed_at
          ) VALUES (?, ?, ?, ?, 'completed', ?, ?, ?, ?)
        `)
        .run(
          runId,
          args.feedbackId,
          args.rubricVersion,
          args.report.evaluator,
          JSON.stringify(args.evidence),
          JSON.stringify(args.report),
          now,
          now,
        );

      if (args.report.proposal) {
        const proposalId = crypto.randomUUID();
        const tests = args.report.scenarioRuns ?? [];
        const testsPassed =
          tests.length >= 3 &&
          tests.every((test) => test.candidateVerdict === "SUCCESS") &&
          tests.every(
            (test) =>
              !(test.baselineVerdict === "SUCCESS" && test.candidateVerdict === "FAILURE"),
          );
        const status =
          args.providerWritable && args.report.proposal.patch && testsPassed
            ? "ready-for-approval"
            : "needs-owner-review";
        this.db
          .prepare(`
            INSERT INTO proposals (
              id, feedback_id, run_id, status, rationale, patch_json,
              base_version_id, base_prompt_hash, report_json, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `)
          .run(
            proposalId,
            args.feedbackId,
            runId,
            status,
            args.report.proposal.rationale,
            args.report.proposal.patch
              ? JSON.stringify(args.report.proposal.patch)
              : null,
            args.baseVersionId,
            args.basePromptHash,
            JSON.stringify(args.report),
            now,
            now,
          );
      }

      const tests = args.report.scenarioRuns ?? [];
      const testsPassed =
        tests.length >= 3 && tests.every((test) => test.candidateVerdict === "SUCCESS");
      const feedbackStatus =
        args.providerWritable && args.report.proposal?.patch && testsPassed
          ? "ready-for-approval"
          : "needs-owner-review";
      this.db
        .prepare("UPDATE jobs SET status = 'completed', updated_at = ? WHERE id = ?")
        .run(now, args.jobId);
      this.db
        .prepare("UPDATE feedback SET status = ?, updated_at = ? WHERE id = ?")
        .run(feedbackStatus, now, args.feedbackId);
      this.audit("evaluation.completed", "feedback", args.feedbackId, {
        runId,
        evaluator: args.report.evaluator,
      });
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  failJob(jobId: string, feedbackId: string, error: unknown, retry: boolean): void {
    const now = new Date().toISOString();
    const message = error instanceof Error ? error.message : String(error);
    this.db
      .prepare("UPDATE jobs SET status = ?, last_error = ?, updated_at = ? WHERE id = ?")
      .run(retry ? "retry" : "failed", message.slice(0, 4000), now, jobId);
    this.db
      .prepare("UPDATE feedback SET status = ?, updated_at = ? WHERE id = ?")
      .run(retry ? "queued-for-retry" : "failed", now, feedbackId);
    this.audit("evaluation.failed", "feedback", feedbackId, { message, retry });
  }

  listRuns(limit = 50): unknown[] {
    const rows = this.db
      .prepare(`
        SELECT id, feedback_id, rubric_version, evaluator, status, report_json,
          created_at, completed_at FROM evaluation_runs
        ORDER BY created_at DESC LIMIT ?
      `)
      .all(limit) as Record<string, SqlValue>[];
    return rows.map((row) => ({
      id: row.id,
      feedbackId: row.feedback_id,
      rubricVersion: row.rubric_version,
      evaluator: row.evaluator,
      status: row.status,
      report: JSON.parse(row.report_json as string),
      createdAt: row.created_at,
      completedAt: row.completed_at,
    }));
  }

  listProposals(limit = 50): ProposalRecord[] {
    const rows = this.db
      .prepare("SELECT * FROM proposals ORDER BY created_at DESC LIMIT ?")
      .all(limit) as Record<string, SqlValue>[];
    return rows.map(mapProposal);
  }

  getProposal(id: string): (ProposalRecord & {
    baseVersionId: string | null;
    basePromptHash: string | null;
  }) | null {
    const row = this.db.prepare("SELECT * FROM proposals WHERE id = ?").get(id) as
      | Record<string, SqlValue>
      | undefined;
    if (!row) return null;
    return {
      ...mapProposal(row),
      baseVersionId: row.base_version_id as string | null,
      basePromptHash: row.base_prompt_hash as string | null,
    };
  }

  updateProposalStatus(id: string, status: string, note?: string): void {
    const now = new Date().toISOString();
    this.db
      .prepare("UPDATE proposals SET status = ?, owner_note = ?, updated_at = ? WHERE id = ?")
      .run(status, note ?? null, now, id);
    this.audit(`proposal.${status}`, "proposal", id, { note: note ?? null });
  }

  recordDeployment(args: {
    proposalId: string | null;
    action: "publish" | "rollback";
    beforePrompt: string;
    beforePromptHash: string;
    afterPrompt: string;
    afterPromptHash: string;
    providerResponse: unknown;
  }): string {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    this.db
      .prepare(`
        INSERT INTO deployments (
          id, proposal_id, action, before_prompt, before_prompt_hash,
          after_prompt, after_prompt_hash, provider_response_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        id,
        args.proposalId,
        args.action,
        args.beforePrompt,
        args.beforePromptHash,
        args.afterPrompt,
        args.afterPromptHash,
        JSON.stringify(args.providerResponse),
        now,
      );
    this.audit(`deployment.${args.action}`, "deployment", id, {
      proposalId: args.proposalId,
    });
    return id;
  }

  listDeployments(limit = 50): unknown[] {
    return this.db
      .prepare(`
        SELECT id, proposal_id, action, before_prompt_hash, after_prompt_hash,
          created_at, rolled_back_at FROM deployments
        ORDER BY created_at DESC LIMIT ?
      `)
      .all(limit);
  }

  getDeployment(id: string): Record<string, SqlValue> | null {
    return (
      (this.db.prepare("SELECT * FROM deployments WHERE id = ?").get(id) as
        | Record<string, SqlValue>
        | undefined) ?? null
    );
  }

  markDeploymentRolledBack(id: string): void {
    this.db
      .prepare("UPDATE deployments SET rolled_back_at = ? WHERE id = ?")
      .run(new Date().toISOString(), id);
  }

  private audit(action: string, entityType: string, entityId: string, detail: unknown): void {
    this.db
      .prepare(`
        INSERT INTO audit_log (id, action, entity_type, entity_id, detail_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `)
      .run(
        crypto.randomUUID(),
        action,
        entityType,
        entityId,
        JSON.stringify(detail),
        new Date().toISOString(),
      );
  }
}

function mapFeedback(row: Record<string, SqlValue>): FeedbackRecord {
  return {
    id: row.id as string,
    conversationId: row.conversation_id as string,
    responseId: row.response_id as string | null,
    userFeedback: row.user_feedback as string,
    expectedBehavior: row.expected_behavior as string | null,
    status: row.status as string,
    responseReferencePrecision: row.response_reference_precision as "exact" | "approximate",
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function mapProposal(row: Record<string, SqlValue>): ProposalRecord {
  return {
    id: row.id as string,
    feedbackId: row.feedback_id as string,
    status: row.status as string,
    rationale: row.rationale as string,
    patch: row.patch_json
      ? (JSON.parse(row.patch_json as string) as ImprovementPatch)
      : null,
    report: JSON.parse(row.report_json as string) as EvaluationReport,
    createdAt: row.created_at as string,
  };
}
