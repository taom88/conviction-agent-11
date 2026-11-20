# Conviction — Product Requirements Document

**Version:** 1.3 — Button-triggered, evaluation-driven improvement  
**Date:** 2026-11-19  
**Status:** Approved product direction; implementation not yet verified  
**Owner/user:** Solo builder and primary personal user  
**Companions:** `Conviction_IMPLEMENTATION_SPEC_v1_3.md`, `Conviction_README_architecture_v1_3.md`, `Conviction_architecture_v1_3.mmd`, `Conviction_ElevenLabs_Builder_Prompt_v1_3.md`

> **Promise:** *Think it through. Make it your own.*  
> **Definition:** A private, voice-first AI thinking partner that recognizes what the user understands, chooses the most useful next intellectual intervention, and gets better through user-flagged, tested, human-approved configuration improvements.

## 1. Why this exists

AI assistants often produce excellent explanations without ensuring that the user can independently reason with the underlying concepts. A fluent reply may prematurely resolve uncertainty, reinforce an unfounded assumption, or prevent the user from doing the thinking. Voice adds timing, interruption, and perceived-latency challenges.

Conviction responds by asking the **right next question**, not the most questions. It meets the user at their current understanding and intended depth, challenges one consequential gap at a time, selectively retrieves approved sources, and offers a genuinely novel transfer case when useful. It is neither a rigid tutor nor an automatic agreement engine.

**Core product hypothesis:** Improving the selection, sequencing, and calibration of conversational interventions will help the user articulate more accurate mechanisms and apply those ideas to unfamiliar problems with less unnecessary conversation or retrieval.

**Secondary engineering hypothesis:** Feedback linked to an identifiable response can drive an automated *draft-and-evaluate* loop without allowing uncontrolled updates to the live agent.

These are hypotheses. A few tests do not establish educational efficacy or autonomous self-learning.

## 2. Scope and knowledge boundaries

**Primary subject:** AI-agent and systems thinking: agent/workflow design, tool calls, context engineering, memory, prompting, orchestration, evaluation methods, model/system improvement, and architecture trade-offs.

**Complementary subject:** Nielsen Norman Group's *Mental Models* framework, for thinking through how users understand products and systems. Discussing generic UX reasoning is allowed, but do not imply an expansive product-management curriculum or invent domain research.

**No active-project corpus.** Do not ingest, retain, or index private work projects, employer material, internal architecture documentation, or proprietary systems. The user can discuss an appropriately non-sensitive hypothetical scenario during a session; nothing makes it part of the curated knowledge base.

**No live web search in alpha.** A later, permissioned search tool may be considered **only** for unfamiliar architectures or newly published agent/evaluation research when the curated material is inadequate. Require source quality checks and cost/latency bounds. Search is not part of the initial agent-build request.

**Initial curated source manifest (prioritize three, then expand selectively):**

| ID | Source | Purpose | Inclusion |
|---|---|---|---|
| KB-01 | [OpenAI — A practical guide to building AI agents](https://openai.com/business/guides-and-resources/a-practical-guide-to-building-ai-agents/) | Agent vs. workflow, tool design, orchestration | Initial |
| KB-02 | [Anthropic — Effective context engineering for AI agents](https://www.anthropic.com/research/effective-context-engineering-for-ai-agents) | Context selection, memory, retrieval | Initial |
| KB-03 | [NN/g — Mental Models](https://www.nngroup.com/articles/mental-models/) | User mental models and product expectations | Initial |
| KB-04 | [Anthropic — Building effective agents](https://www.anthropic.com/research/building-effective-agents) | Simple workflows vs. autonomous loops | Add if ingestion works |
| KB-05 | [OpenAI Cookbook — Agent improvement loop](https://developers.openai.com/cookbook/examples/agents_sdk/agent_improvement_loop) | Traces, evals, prompt iteration | Add if ingestion works |
| KB-06 | [OpenAI — Evaluation best practices](https://developers.openai.com/api/docs/guides/evaluation-best-practices) | Calibration and evaluative validity | Add if ingestion works |
| KB-07 | [Anthropic — Demystifying evals for AI agents](https://www.anthropic.com/research/demystifying-evals-for-ai-agents) | Multi-turn, tool-using agent evaluation | Optional later |

References are *proposed*, not asserted as indexed or ingested. Use approved URL imports or permitted original synthesis notes. Verify extraction, content rights, index completion, and grounded response quality. Do not publish third-party article bodies in GitHub. Favor publisher-original material; do not assume a KB article supports claims outside its contents.

## 3. Primary user and intentions

**Persona:** A technically literate early-career builder who thinks aloud about AI systems and wants to test and refine their mental models while retaining ownership of the reasoning.

**User intentions:**
- **Quick gut check:** identify the main flaw or caveat succinctly.
- **Deep understanding:** clarify mechanisms, assumptions, boundaries, alternatives.
- **Interview readiness:** articulate a coherent explanation and handle a new case.
- **Open exploration:** ask at most one light calibration question if needed; adapt as intent emerges.

Explicit user preference overrides inferred depth. Eloquence is not proof of expertise; hesitations are not proof of confusion. Avoid forcing a transfer exercise after the user's purpose has been satisfied.

## 4. Experience principles

1. Treat understanding as **overlapping signals**, not a mutually exclusive label.
2. Pick **one primary intervention**, sometimes with one compatible secondary move; generally ask at most one spoken question.
3. Correct major false premises, but don't challenge for entertainment.
4. Ask a meaningful question rather than exhaustively enumerate gaps.
5. Retrieve evidence only if it improves correctness, not simply because a tool exists.
6. Protect the user's reasoning: don't supply the transfer answer before they attempt it.
7. Let the user pause, interrupt, revise, request a direct answer, or end naturally.
8. A user complaint is a **signal**, not automatically verified ground truth.
9. Keep feedback and configuration-improvement work off the voice-response critical path.
10. Version and test all changes before human-approved promotion.

## 5. Dynamic conversation decision policy

### 5.1 Non-exclusive assessment signals

| Signal | Example | Plausible next move |
|---|---|---|
| Ambiguity | “Agents need more memory.” | Clarify persistent storage vs. runtime context |
| Weak assumption | “Agents must outperform workflows because they reason.” | Challenge the cost/control trade-off |
| Missing mechanism/evidence | “How does tool calling change the context window?” | Brief explanation; approved KB lookup if useful |
| Working understanding | Accurately distinguishes context, retrieval, and storage | Recognize mechanism; probe remaining boundary |
| Transfer readiness | Can explain mechanism *and* when it fails | Pose one unfamiliar-but-related application |
| Stuck / explicit help | “I don't know. Just explain it.” | Teach briefly, then return control |
| Intent/depth | “Quick gut check” vs “prepare for an interview” | Calibrate length and depth |
| Control / correction | “Stop”; “That's not what I meant” | Follow direction; repair misinterpretation |

### 5.2 Selection behavior

For each substantive turn, infer purpose and the important overlapping signals. Choose the lowest-overhead intervention likely to unblock the next reasoning step. Prioritize the user's directions, material errors, and blocking uncertainty over cosmetic precision. Use one concise response (usually one to three spoken sentences) and at most one question, unless asked to teach in detail. Re-evaluate after each turn; the sequence is **not** a hard-coded stage machine.

**Example of mixed signals:** A user explains an agent workflow correctly but assumes retrieval always improves quality. Recognize the good mechanism, challenge the overgeneralization, and *if appropriate* ask them to apply the trade-off to a different architecture. Don't restart at a beginner's definition.

**Tool discipline:** “Clarify,” “challenge,” “explain,” and “transfer” are LLM conversational actions. Only knowledge lookup is an external retrieval operation. If KB support is absent, say so instead of inventing an attribution. Tool invocations are limited by factual need, not a fixed count. The long-term optimization is **high-quality reasoning per unit of latency and retrieved context**, not tool-call minimization at any cost.

### 5.3 Calibrated examples for baseline evaluation

| ID | User expression | Expected behavior | Prohibited shortcut |
|---|---|---|---|
| EX-01 | “More agent memory always means better performance.” | Clarify memory vs context; challenge “always” | Agree automatically |
| EX-02 | “An agent is superior to a workflow because it can decide.” | Probe when dynamic reasoning earns its cost | Generic agent lecture |
| EX-03 | “I know the mechanism, but retrieval can't fail.” | Recognize understanding; challenge recall/quality limits | Return to beginner questions |
| EX-04 | “Explain prompt caching versus retrieval.” | Offer concise, sourced distinction if supported | Withhold explanation unnecessarily |
| EX-05 | “This is for an interview; how would you test my explanation?” | Probe one boundary, then transfer | Ask an entire checklist |
| EX-06 | “Quick gut check—is tool calling always necessary?” | Short answer + one condition | Long lesson |
| EX-07 | “Wait, I hadn't finished talking.” | Acknowledge interruption; listen patiently | Continue monologue |
| EX-08 | “What does a user mental model mean?” | Explain NN/g concept within verified coverage | Invent UX experiment outcomes |
| EX-09 | “I understand context selection; show me another case.” | Transfer to unfamiliar-but-related scenario | Give answer before user attempts |
| EX-10 | “I don't get it; just tell me directly.” | Brief explanation, no forced Socratic flow | Repeat the same question |
| EX-11 | “New AI benchmarking paper released today—what does it say?” | State current-source limit; no web search | Fabricate current paper findings |
| EX-12 | “Let's stop.” | End/comply immediately | Require recap or transfer |

For each example, record **acceptable alternative responses**, user purpose, whether external knowledge is needed, and why the preferred move is best. Human calibration is about behavior quality, not matching a category label exactly.

## 6. Runtime architecture and UX

**One ElevenAgents conversational agent** owns model-based dialogue. ElevenLabs handles streaming audio, speech-to-text or integrated speech processing, turn-taking, speech generation, session context, and managed KB access. The version-controlled agent prompt governs purpose/depth/intervention policy, not low-level speech endpointing. A local React app using `@elevenlabs/react` controls appearance, mic/mute/end/status, and a distinct **Feedback** button; the SDK is not a pre-designed UI.

**Local/private deployment:** No public hosted demo is required. Keep the agent private. A local browser client connecting to a private agent needs an authenticated **local server endpoint** issuing short-lived ElevenLabs session credentials; the API key stays on the server. A dashboard-only prototype can validate the agent but **cannot** provide the custom React feedback button. Local UI and small server are therefore required for the full v1.3 P0 flow. Do not expose the agent or an unrestricted credential endpoint on the public internet.

**Voice behavior:** Favor patient turn-taking while a user thinks aloud, allow interruption, minimize dead air and spoken lists, and test real pauses. Distinguish agent conversational quality from SDK/model audio behavior. Do not assume the LLM receives acoustic prosody in a cascaded pipeline.

## 7. Feedback button — first-class P0

### 7.1 Primary interaction

During an active session, the user clicks **Feedback**. A small, non-blocking panel opens, showing the latest completed agent response (or a selectable recent response when available). The user may enter a short natural-language correction such as “You misunderstood my argument; I wanted a quick check,” and optionally the desired behavior. A one-click **Flag response** with no explanation is allowed, but it is marked “needs clarification” in review.

On **Submit**, the app must:
1. Capture a **structured private record** and an **idempotency key** before doing any expensive work.
2. Associate it with the active `conversation_id`, the relevant **agent response/turn identifier if available**, fallback timestamp and short transcript excerpt only with consent, and the user's original wording. Never fabricate a precise turn ID.
3. Persist locally/private to a minimal durable store and acknowledge receipt **only after persistence**. If persistence fails, show an error and retry option.
4. When the session is active **and an explanatory note was entered**, send that correction as an ordinary **user turn by default**, using the SDK's text-user-message feature, so the agent can respond immediately; offer a **Record only** option. If no note exists or the session has ended, do not invent a conversational turn. This path is independent of the offline improvement job: failure of one path must not falsely report success for the other.
5. Trigger the **asynchronous improvement job once per accepted feedback event**, not every time a page reloads or a webhook retries.
6. Mark clear statuses: `received`, `analyzing`, `needs-owner-review`, `testing`, `ready-for-approval`, `failed`, `approved-and-published` or `rejected`.

Do not send full personal transcripts to a public GitHub issue or an external analytics service. Keep snippets minimal. A correction might refer to a transcription error, missing context, wrong intervention, bad grounding, or a justified difference in viewpoint. Neither the user nor the agent is assumed infallible.

### 7.2 Feedback record contract

```json
{
  "feedback_id": "uuid",
  "conversation_id": "from actual SDK session",
  "response_id": "nullable; actual SDK event only",
  "response_timestamp": "ISO-8601",
  "user_feedback": "You challenged something I'd already established",
  "expected_behavior": "Acknowledge and move to a novel example",
  "evidence_excerpt": "optional, minimal and consented",
  "suspected_failure": "unreviewed",
  "review_status": "received",
  "candidate_version": null,
  "created_at": "ISO-8601"
}
```

**ElevenLabs SDK `sendFeedback(false)` is optional supplementary telemetry**. It cannot be assumed to store the user's explanation, refer to the intended message, or trigger the private improvement pipeline. The custom feedback record is authoritative for this feature.

### 7.3 Avoid two common problems

- **False attribution:** If only a session ID exists, mark the response reference approximate and allow the user to confirm the targeted answer. A negative rating is not automatically a proof of model error.
- **Duplicate or costly jobs:** Repeated clicks with the same idempotency key are one event. Queue background work, rate-limit/consolidate bursts, and set a test-cost budget. Jobs must never delay speaking or block the user from ending a session.

## 8. Automatic feedback-triggered improvement — P0

**Trigger:** Each newly persisted feedback event enqueues exactly one **review-and-test attempt**. The system automatically performs as much of the following as can be safely performed **before human approval**:

1. **Locate evidence:** Fetch just the authorized, relevant conversation turn and minimal surrounding context if available; label missing evidence.
2. **Diagnose:** Classify the probable failure (e.g., wrong intervention, verbosity, depth mismatch, unsupported claim, retrieval quality, turn-taking, STT misrecognition) as a *hypothesis*, with the user's criticism preserved verbatim.
3. **Propose:** Suggest the **smallest** appropriate prompt, KB, retrieval/tool policy, or voice-setting change; produce a readable diff and rationale. Do not recommend tool changes for purely conversational misses.
4. **Test:** Convert the failure into a next-response or multi-turn test where feasible; run it against a **staged candidate** and a representative existing regression set. Compare baseline and candidate on appropriate qualitative rubric, unnecessary retrieval, and latency/cost when observable.
5. **Pause for owner:** Present a private report with evidence, proposed diff, tests/results, uncertainties, and rollback path. The owner approves, edits, or rejects the proposal.
6. **Promote only after approval:** Update the versioned configuration and the live agent only through an explicit authenticated approval action. Preserve the previous version for rollback.

**If the diagnosis is ambiguous or a counterfactual test cannot run,** stop at `needs-owner-review` and request clarification. Do not invent a passing test. One flagged response is sufficient to *trigger analysis*, not sufficient to prove the proposed change generalizes.

**Technical boundary:** ElevenLabs tests/conversation records and paid Architect may support steps, but **a feedback button does not automatically invoke Architect**, nor does a free account provide a guaranteed end-to-end autonomous revision service. The MVP requires a small local/private job runner and API integration, or it must be honestly labeled a **manual proof of concept**. The automated P0 flow is a design requirement, not a claim that dashboard configuration alone implements it.

**No self-training claim:** This loop improves the agent's prompt, tools, KB/voice configuration and evaluation corpus. It does not retrain model weights or automatically learn from every conversation. The live session may react to a correction immediately, but only approved configuration changes carry into future sessions.

## 9. Evaluation plan and measurable outcomes

### Baseline quality rubric

| Dimension | Evaluation question | Method |
|---|---|---|
| Signal recognition | Did it identify the important overlap of understanding, gaps, purpose? | Human + optional LLM judge |
| Next intervention | Did it choose the most useful one or two moves? | Human-calibrated scenario rubric |
| Reasoning ownership | Did it let the user think rather than provide the transfer answer? | Conversation inspection |
| Grounding | Did source-backed claims match retrieved approved material? | Evidence check |
| Tool discipline | Were retrievals necessary and non-duplicative? | Tool trace / manual review |
| Depth fit | Quick check vs. deep dive vs. interview goals respected? | Scenario inspection |
| Voice UX | Pauses, interruptions, naturalness and responsiveness? | Real audio tests |
| Transfer | Was a novel case used appropriately and not pre-answered? | Multi-turn scenario |
| Feedback integrity | Does the flag reference intended turn, persist, and trigger one job? | Deterministic integration test |
| Change safety | Candidate tested and blocked until approved? | Integration/regression test |

### Initial regression cases

- EX-01–EX-12 above, with at least six run before describing the conversational policy as functional.
- **FB-01:** User flags last response and provides a correction; record is persisted with actual session ID and text.
- **FB-02:** User clicks twice/retries; only one improvement job runs per idempotency key.
- **FB-03:** Voice conversation continues normally while feedback analysis runs.
- **FB-04:** Candidate prompt improves the flagged case but fails an adjacent regression; no publish is allowed.
- **FB-05:** Feedback without a precise turn ID is marked approximate, never fabricated.
- **FB-06:** Job fails or exceeds budget; feedback remains retained privately with failure status and safe retry.
- **FB-07:** Proposed change never appears live without explicit owner approval; rollback is possible.
- **FB-08:** User flags a disagreement that is not a factual error; review can reject the proposed change.
- **VOICE-01:** Long thinking pause does not repeatedly trigger premature replies.
- **VOICE-02:** The user interrupts to correct the agent; it stops and responds to the correction.
- **KB-01:** Unsupported claim is labeled uncertain rather than attributed to a source that was not consulted.

Do not present synthetic runs as measured real-world learning gains. Store outcomes and reasons, not merely pass percentages.

## 10. Release staging and time constraints

The requirements are ambitious relative to a 6–8-hour application project. Make **scope and delivery truth explicit**:

| Milestone | Deliverable | Release gate |
|---|---|---|
| **M0 — Agent-first** | One working dashboard agent; first KB sources tested; conversational examples | Understands the policy, corrects errors, can offer transfer |
| **M1 — Custom local UX** | Private React page + authenticated session endpoint + Feedback button | Voice works; flag persists against real conversation reference |
| **M2 — Automatic improvement** | On-feedback async job, draft diagnosis/diff, targeted + baseline evaluations | Trigger works exactly once; live config untouched |
| **M3 — Review and publication** | Owner approval UI or CLI, versioned promotion and rollback | Human approves each release; results and diffs inspectable |
| **M4 — Portfolio** | Sanitized repo, architecture, tested evidence and short recording | No secrets or private conversations published |

Ship M0/M1 promptly. M2/M3 can require additional focused sessions, API credits, and possibly paid ElevenLabs features; **do not delay an application waiting for fully autonomous improvement**. If M2 is not implemented, describe it as planned, not working.

## 11. Privacy, security, cost and authority

- No stored active-work project corpus, public production URL, or unsolicited web search.
- Explicit microphone permission and user-initiated session controls.
- Keep API key and job-runner credentials server-side; browser receives only short-lived credentials.
- Private feedback database; store only necessary snippets/metadata, support deletion, and honor ElevenLabs retention settings.
- Protect the owner-only approval action; avoid automatic merges, live edits, or changes based solely on LLM judges.
- Respect retrieved article copyright, publisher attribution and permission for KB use.
- Timebox agent research; avoid expensive test bursts after every minor feedback item. Queue/coalesce repeated events without dropping unique evidence.
- Transparently track actual model/agent usage and API/testing costs; platform feature availability varies by plan.
- No unearned claims of calibrated classifier accuracy, production reliability, or independent learning improvements.

## 12. Definition of done

**Minimum useful alpha (M0):** Voice dialogue working with approved, verified knowledge; six representative examples tested with observed results; clear prompt and version-controlled configuration.

**Feedback-enabled prototype (M1):** Private local UI with Feedback button, persistent feedback records tied to a real conversation and the intended response as precisely as supported; no secrets exposed.

**Automated improvement alpha (M2/M3):** A feedback submission reliably queues an independent analysis/test job, produces a reviewable candidate report/diff, runs failure/regression evaluations, and **cannot** alter the live agent without an owner approval action. A completed, documented before/after cycle is required before claiming this level.

**Portfolio artifact:** Sanitized GitHub README, source manifests, reproducible local setup, at least one honest before/after evaluation record, architecture diagram, and an offline demo recording. The code repo may be public; the running agent, credentials, and private traces stay private.

## 13. Deferred features

- Live search **only** for unfamiliar architecture and newly published agent/evaluation research, with permission, source provenance, and latency constraints.
- Browser extension or always-on screen overlay; full-page/web context capture.
- Private work-project ingestion; personalized memory; long-term learning profiles.
- Fully autonomous production optimization, model fine-tuning, analytics dashboards, public service deployment.
