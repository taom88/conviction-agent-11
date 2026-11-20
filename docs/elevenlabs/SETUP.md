# Recreate the Conviction agent in ElevenLabs

This guide recreates the hosted voice agent while keeping each installation's
agent ID and credentials outside the public repository. ElevenLabs hosts the
conversation runtime; this repository hosts the UI, feedback records,
evaluation runner, approval flow, and rollback history.

The ElevenLabs dashboard changes over time, so use the closest available option
when a model label differs. Do not paste API keys into browser code or a
`VITE_` variable.

## 1. Create the agent

1. In ElevenLabs, create a new conversational agent named `Conviction`.
2. Set the primary language to English.
3. Leave the first message empty so the user can begin when ready.
4. Copy the complete contents of
   [`agent/conviction.system.md`](../../agent/conviction.system.md) into the
   agent's system prompt.
5. Select a fast general-purpose model suitable for low-latency dialogue. The
   reference agent uses a Gemini Flash-class model; model availability can
   change by plan and region.

## 2. Configure speech and turn taking

- Choose a calm, natural voice that remains clear for technical language.
- Use the current low-latency ElevenLabs speech model available to the account.
- Use Scribe real-time speech recognition when available.
- Set turn eagerness to **patient** so users can pause, revise, and think aloud.
- Keep interruptions enabled so the agent immediately follows a user's change
  of direction.

Voice selection is intentionally not fixed in source control. A voice ID is an
installation choice and should be tested with the target audience.

## 3. Add the knowledge base

Use [`docs/source-manifest.md`](../source-manifest.md) as the source of truth.
The initial knowledge base covers:

- agent architecture and evaluation;
- context engineering;
- systems thinking and leverage points;
- reliability and SRE signals;
- UX mental models and usability heuristics; and
- checkout and conversion UX.

Verify the canonical source, usage rights, retrieval date, and index status for
every document before attaching it. Do not upload employer documents, private
projects, transcripts, or proprietary material. Enable retrieval only for the
approved sources and test that the agent does not claim live web access.

## 4. Apply safety and privacy settings

Recommended reference settings:

| Setting | Value |
| --- | --- |
| Focus guardrail | Enabled |
| Prompt-injection guardrail | Enabled |
| Voice recording | Disabled |
| Conversation retention | 7 days |
| User memory | Disabled |
| Agent concurrency | 1 during initial rollout |
| Daily conversation limit | 50 or lower for a free plan |
| Bursting | Disabled |

Keep the agent private when the account supports authenticated sessions. On a
free plan without an API key, the browser may need a public agent ID; that ID is
runtime configuration, not a repository secret, and should still remain out of
committed source to avoid unsolicited usage.

## 5. Add calibration tests

Translate the scenarios in [`eval/scenarios.json`](../../eval/scenarios.json)
into ElevenLabs single-turn or simulation tests when the account supports agent
testing. At minimum cover:

1. one substantive question rather than a generic checklist;
2. a direct answer when the user explicitly requests one;
3. a mixed-signal turn containing both correct reasoning and one weak premise;
4. a transfer exercise that does not reveal its solution early;
5. refusal to claim live search or unsupported evidence; and
6. resistance to prompt-injection attempts.

The repository evaluation rubric is authoritative for the local improvement
pipeline. Platform tests are an additional runtime check, not a replacement.

## 6. Connect the local application

Copy the example environment file and add the newly created ID only to the
ignored local file:

```bash
cp .env.example .env.local
```

```dotenv
ELEVENLABS_AGENT_ID=agent_your_agent_id
VITE_ELEVENLABS_AGENT_ID=agent_your_agent_id
```

Do not add a real ID to `.env.example`, source files, documentation examples,
screenshots, or issue reports. `.env.local` is ignored by Git.

For the free/no-key path, start the application with `npm run dev`. The browser
connects using the configured public agent ID. Feedback and evaluation remain
inside this repository's local application.

If an API key becomes available later, set `ELEVENLABS_API_KEY` only in the
server environment. The server will request short-lived signed sessions and can
retrieve authorized conversation evidence or apply explicitly approved prompt
changes without exposing the key to the browser.

## 7. Verify before use

1. Start and end a voice session; verify microphone permission, listening,
   speaking, mute, and interruption states.
2. Confirm the agent waits for the user to begin and generally asks one useful
   question at a time.
3. Submit feedback with and without the transcript-excerpt checkbox.
4. Confirm feedback appears in the owner Improve view and expires or deletes as
   configured.
5. Run `npm run eval:validate`, `npm test`, and `npm run build`.
6. Confirm the repository contains placeholders only:

   ```bash
   rg 'agent_[a-z0-9]{20,}|sk-[A-Za-z0-9_-]{20,}' . \
     -g '!node_modules' -g '!dist' -g '!.git'
   ```

7. Before any prompt publication, review the proposed diff, targeted test, two
   regression scenarios, prompt hash, and rollback record.

## What is intentionally not exported

- the live agent ID;
- API keys or signed session URLs;
- a fixed voice ID;
- private conversations, transcripts, or feedback records;
- ElevenLabs workspace, branch, version, test, and knowledge-base document IDs.

Those values belong to the installation, not the reusable project.
