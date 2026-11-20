# Conviction — Implementation Specification (v1.3)

**Companion to:** `Conviction_PRD_v1_3.md`  
**Purpose:** Turn the intended product and feedback mechanism into an implementable sequence without overclaiming what ElevenLabs builds automatically.

## 1. Build order

1. **ElevenLabs dashboard agent first:** Agent name Conviction; system prompt; natural voice; patient turn-taking if feasible; curated KB; 6–8 manually reviewed calibration scenarios. Verify features actually enabled on account.
2. **Private local React client:** `@elevenlabs/react` wrapped in `ConversationProvider`; mic controls, start/end, connection state, active `conversation_id`, recent agent-response metadata when exposed, Feedback button + optional note.
3. **Minimal local credential/feedback service:** Private agent token issuer with server-held ElevenLabs API key; `POST /feedback` stores event then queues one job; `GET /feedback/:id` exposes private status. Bind only to localhost or protect with owner auth; do not publish service.
4. **Feedback-triggered worker:** Idempotent job reads scoped evidence, produces diagnosis, patch suggestion and tests, writes review report. If SDK/service does not expose a stable response ID, store latest completed response timestamp and mark target approximate. Never fabricate trace IDs.
5. **Review + versioning:** Owner approves/rejects candidate via authenticated local action or CLI. Only approved diff deploys. Keep rollback configuration.
6. **Sanitized GitHub portfolio:** Repo with prompt, source manifest, synthetic tests, architecture, code, safe setup instructions, redacted before/after examples, recorded demo. No live private agent/keys/real transcript dumps.

## 2. Runtime dependencies

- Use **one ElevenAgents conversational agent** for real-time voice, managed KB and LLM.
- Use the **ElevenLabs React SDK** for session controls and `sendUserMessage` for an explanatory feedback note to appear as a user turn by default when the session is active (unless **Record only** is selected). Do not confuse `sendContextualUpdate` (no response) with a new conversational turn.
- A **private agent** requires short-lived credentials generated server-side. Do not put `ELEVENLABS_API_KEY` in browser code or `VITE_` environment variables.
- SDK `sendFeedback(false)` may provide supplemental binary quality feedback but **does not replace** the custom feedback record. Persist first, acknowledge after success, and make the live correction optional.
- Fetch transcripts only when enabled and allowed. Implement deletion or retention controls; avoid full-session persistence by default.

## 3. Suggested minimal directory

```text
conviction/
├── README.md
├── PRD.md
├── IMPLEMENTATION_SPEC.md
├── prompts/agent-system-prompt.md
├── docs/source-manifest.md
├── docs/architecture.mmd
├── tests/next-move-scenarios.md
├── tests/feedback-integration.md
├── src/VoiceSession.tsx
├── src/FeedbackPanel.tsx
├── server/session-and-feedback.ts
├── worker/improve-feedback.ts
├── artifacts/example-improvement-report.redacted.md
├── .env.example
└── .gitignore
```

This is a possible structure, not an instruction to scaffold every file immediately. Keep components small and avoid a general agent framework.

## 4. Feedback API contract (illustrative)

`POST /feedback` request after user clicks Submit:

```json
{
  "idempotency_key": "locally-created-uuid",
  "conversation_id": "real-SDK-conversation-id",
  "response_id": null,
  "response_timestamp": "2026-11-19T22:44:00-05:00",
  "user_feedback": "The agent restated my argument instead of challenging the remaining weakness",
  "expected_behavior": "Challenge the weak assumption then offer transfer",
  "include_excerpt": false
}
```

Response only after durable persistence:

```json
{
  "feedback_id": "server-generated-id",
  "status": "received",
  "analysis_queued": true,
  "response_reference_precision": "approximate"
}
```

Back end must validate owner access, actual conversation ID where possible, requested excerpt scope, length limits, and idempotency; reject missing required fields without inventing IDs. Never report queued/success status if the runner failed to accept the job. A local lightweight SQLite store or append-only durable file with locking can suffice for MVP; keep it untracked by Git.

## 5. Worker state and safeguards

`received → analyzing → (needs-owner-review | testing) → ready-for-approval → (approved-and-published | rejected)`; failures can become `failed` and retried safely.

- **Trigger:** Exactly one job per distinct accepted feedback ID; retry delivery does not rerun completed work.
- **Concurrency:** Sequential local worker initially; bounded test count and token/credit budgets; queue burst feedback, with optional clustering but no dropped events.
- **Evidence:** Minimal authorized transcript slice and metadata; if not available, ask owner to inspect/confirm instead of fabricating context.
- **Root cause:** Provisional classification: wrong next move, misunderstanding, retrieval, verbosity, prompt policy, ASR/timing, or user/agent disagreement.
- **Candidate:** Draft patch + clear diff to prompt/source/tool/voice setting; do not mutate production before owner approval.
- **Tests:** At least motivating feedback test and two nearby baseline cases if supported; separate automated checks (event/ID/status) from semantic judges.
- **Human approval:** Explicit review of evidence, diff and outcomes. No auto-merge/auto-approve; rollback retained.
- **Failure:** Safe status and retry; do not block live conversation.

## 6. Evaluation acceptance checks

| ID | Required check |
|---|---|
| AC-01 | Voice session starts/stops/mutes with expected UI states |
| AC-02 | Agent asks one targeted question rather than generic checklist |
| AC-03 | Mixed-signal turn recognizes correct understanding and one faulty assumption |
| AC-04 | KB citation/attribution only when actually grounded |
| AC-05 | Novel transfer scenario does not supply its answer |
| AC-06 | Feedback targets the user's selected/most recent completed response |
| AC-07 | Private durable record contains actual conversation reference and user note |
| AC-08 | Double-click/retry results in one accepted event/job |
| AC-09 | Job produces visible failure status if trace or test infrastructure unavailable |
| AC-10 | Draft improvement includes diff + targeted and baseline test evidence |
| AC-11 | Live agent unchanged before explicit owner approval |
| AC-12 | Source, code and demo contain no API keys or unredacted private transcripts |

## 7. Feature boundaries / reality checks

- An ElevenLabs **dashboard agent** does not itself implement a custom UI button, durable feedback API or custom CI job.
- ElevenLabs **Architect** may assist with investigation and test-driven changes on paid plans; file attachments in Architect are plan-gated. The fallback for the builder is to paste its prompt and short source excerpts if direct attachment is unavailable.
- An asynchronous **feedback-triggered** worker is a private engineering integration and requires compute when the event arrives; a scheduled task is not a substitute. It may use local event/queue processing while the laptop is running, or a private automation service later.
- Search, personal project KB ingestion, browser extension, public multi-user hosting and automatic model retraining are explicitly not part of this version.
