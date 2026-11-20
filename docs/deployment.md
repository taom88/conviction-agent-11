# Deployment readiness

**Status: READY for a private, single-instance deployment.**

The public/no-key browser mode remains a development convenience and is not
approved for an unrestricted public launch because its agent ID is necessarily
visible to every visitor.

## Required production configuration

- `OWNER_TOKEN`: a long random value; startup fails without it when binding to
  a non-loopback address.
- `ELEVENLABS_AGENT_ID`: the agent owned by the deployer.
- `ELEVENLABS_API_KEY`: recommended so browser sessions use short-lived signed
  URLs and management operations remain server-side.
- `DATABASE_PATH`: persistent storage; the container default is
  `/data/conviction.db`.
- TLS and user authentication at the reverse proxy or hosting layer.

Keep `VITE_ELEVENLABS_AGENT_ID` unset in a private deployment. The browser then
must obtain a session through the authenticated server instead of falling back
to a public agent ID.

## Container runbook

```bash
docker build -t conviction:0.1.0 .
docker run --name conviction \
  -p 127.0.0.1:8787:8787 \
  -v conviction-data:/data \
  -e OWNER_TOKEN='replace-with-a-long-random-value' \
  -e ELEVENLABS_AGENT_ID='agent_your_agent_id' \
  -e ELEVENLABS_API_KEY='replace-with-server-api-key' \
  conviction:0.1.0
```

Place a TLS reverse proxy with real user authentication in front of port 8787.
Enter `OWNER_TOKEN` through the UI's Access control after opening the app.

## Release gates

- Clean `npm ci`, rubric validation, unit tests, type-check, and production
  build pass.
- The production server health, authenticated API boundary, session creation,
  feedback ingestion, evaluation, deletion, and static UI routes pass smoke
  testing.
- SQLite is persisted and backed up; only one application instance writes to
  it.
- ElevenLabs recording, retention, call limits, and guardrails are verified.
- A rollback owner and post-launch monitoring window are assigned.

## Public-launch blockers

Before an unrestricted public launch, add end-user authentication, signed
session issuance tied to that identity, an explicit deployed privacy policy,
abuse/rate limiting at the edge, and a gradual rollout with live monitoring.
