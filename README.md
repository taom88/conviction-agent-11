# Conviction

Conviction is a local-first, voice-first thinking partner for AI systems, engineering architecture, systems thinking, and product design. ElevenLabs hosts the conversational agent and speech runtime. This repository owns the client experience and the feedback-driven improvement loop.

This is an early prototype, not a production service. The source is suitable for external review, but each installation must supply its own ElevenLabs agent and complete its own privacy, security, and behavioral validation before deployment.

## What lives where

| Boundary | Owner | Responsibility |
| --- | --- | --- |
| Voice runtime | ElevenLabs | Speech recognition, turn taking, hosted agent, knowledge retrieval, and speech generation |
| Private client | This repository | React voice UI, live transcript state, response-targeted feedback, and owner review |
| Improvement loop | This repository | Durable feedback, job state, evidence selection, evaluation criteria, scenario runs, candidate changes, approval, audit trail, and rollback |

The system never publishes an agent change merely because feedback was submitted. A candidate becomes publishable only after an evaluator produces a scoped patch and the configured motivating/regression scenarios pass. Publishing still requires the owner to type `PUBLISH` in the UI.

## Milestones

- **M0 — Agent, KB, and policy:** Hosted ElevenLabs agent, system prompt, knowledge base, voice, and initial calibration tests. The current prompt is mirrored in [`agent/conviction.system.md`](agent/conviction.system.md).
- **M1 — Private UI and feedback:** Implemented here with the ElevenLabs React SDK, signed URLs, response-targeted feedback, SQLite persistence, and idempotency.
- **M2 — Evaluation runner:** Implemented here with a versioned rubric, eight baseline scenarios, minimal transcript evidence, transparent heuristic fallback, optional semantic judging, and optional before/after scenario comparisons.
- **M3 — Approval and rollback:** Implemented here with prompt hashes, stale-change protection, explicit approval/rejection, deployment records, and rollback conflict checks.

## Local setup

Requirements:

- Node.js 24 or newer
- Your own ElevenLabs agent ID
- Optional: an ElevenLabs API key for private signed sessions, conversation retrieval, and API-driven publishing
- Optional for localhost: an owner token; set one before exposing the server beyond your machine
- Optional: an OpenAI-compatible chat-completions endpoint for semantic evaluation and candidate testing

```bash
cp .env.example .env.local
npm ci
npm run dev
```

On macOS without Node.js installed, double-click [`scripts/run-local.command`](scripts/run-local.command). It downloads a project-local, checksum-verified Node runtime into the ignored `.tools/` directory and starts the app.

Open `http://127.0.0.1:5173`. Do not open the repository's raw `index.html` with a `file://` URL; Vite must serve the React application.

Set both `ELEVENLABS_AGENT_ID` and `VITE_ELEVENLABS_AGENT_ID` in `.env.local`. The repository and example file intentionally contain no live agent ID.

The server binds to `127.0.0.1` by default. With no ElevenLabs API key, the browser connects directly to the public agent using its agent ID. If a key is later added, it is used only by the server for signed sessions and management calls; it is never sent to the browser. A non-loopback bind fails at startup unless `OWNER_TOKEN` is set.

## Free-plan / no-key mode

The current agent does not require authentication, so the React SDK can start a conversation using only the public agent ID. In this mode:

- Voice conversations work directly from the browser.
- Feedback includes the small relevant transcript excerpt captured by the SDK, so the local worker does not need to fetch the conversation from ElevenLabs.
- If the local API is not running, feedback falls back to browser `localStorage` and appears in the Improve view.
- Automatic prompt publication and rollback are unavailable; apply approved changes manually in the ElevenLabs dashboard.
- The agent ID is visible in browser code, and anyone with it can potentially start conversations that consume plan credits. Move to authenticated sessions before a public deployment.

The included live-agent settings and knowledge base are not provisioned by this repository. The checked-in prompt is a reviewable mirror; connect it to an agent you control.

## Evaluation modes

Without evaluator variables, every feedback event still creates a durable job and evaluation run. The runner performs only explicit mechanical checks and marks semantic criteria `UNKNOWN`. It creates no publishable prompt change.

To enable semantic evaluation, configure an OpenAI-compatible endpoint and model. A cloud endpoint usually needs an API key; a local endpoint can leave it blank:

```dotenv
EVALUATOR_BASE_URL=https://your-provider.example/v1
EVALUATOR_API_KEY=...
EVALUATOR_MODEL=...
```

For example, a local OpenAI-compatible server can use `EVALUATOR_BASE_URL=http://127.0.0.1:11434/v1` with the name of a model already installed on your machine. This keeps evaluation evidence local and requires no cloud evaluator key.

Candidate scenario tests are separately opt-in because they make additional model calls:

```dotenv
EVALUATOR_RUN_CANDIDATE_TESTS=true
```

With candidate tests enabled, the runner compares the current and candidate prompts on one motivating case and two regression scenarios. A proposal reaches `ready-for-approval` only when all three candidate responses pass. Criteria and scenarios remain source-controlled under [`eval/`](eval/); private run evidence remains in the ignored local SQLite database.

Those comparisons use the configured evaluator endpoint as both the response generator and judge. They are fast regression evidence, not a guarantee that ElevenLabs' hosted model will behave identically; confirm consequential changes in the live runtime before approval.

## Commands

```bash
npm run dev            # UI and localhost API
npm test               # Unit tests
npm run build          # Type-check and production web build
npm run eval:validate  # Validate versioned rubric/scenario files
npm start              # Serve the production build and worker
```

## Privacy defaults

- Public no-key sessions use the agent ID directly. Private signed sessions are available when a server API key is configured.
- Private endpoints require the owner token when `OWNER_TOKEN` is configured.
- The service binds to localhost unless explicitly changed, and refuses a non-loopback bind without an owner token.
- Only a small transcript window around the flagged response is stored with an evaluation run.
- Voice use requires explicit in-UI consent. Local feedback defaults to seven-day retention and can be deleted from the Improve view.
- `.env`, `.data/`, and private artifacts are ignored by Git.
- ElevenLabs audio saving and retention are separate account settings and must be audited independently.

See [`docs/privacy.md`](docs/privacy.md), [`docs/evaluation.md`](docs/evaluation.md), and [`docs/architecture.md`](docs/architecture.md) for the operating model.

## Cost boundary

The SDK is open-source client software, but hosted ElevenLabs conversations, knowledge retrieval, and testing may consume plan credits. This application does not depend on paid ElevenLabs Architect features. The optional evaluator is also external and may incur usage charges; candidate scenario runs are therefore disabled by default.

## External review checklist

- `npm ci`, rubric validation, tests, and the production build pass in CI.
- No live agent ID, API key, transcript, database, or local environment file is committed.
- Network exposure requires owner authentication; browser sessions display a consent disclosure.
- Feedback has configurable local retention and an owner deletion control.
- Prompt publication remains manual and conflict-checked.

For a public deployment, replace public-ID sessions with signed URLs, add a real user-authentication layer, document the deployed privacy policy, and run the live agent's behavioral and prompt-injection test suite.
