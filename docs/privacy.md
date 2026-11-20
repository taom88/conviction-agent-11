# Privacy operating profile

Recommended profile for a personal deployment:

- Enable ElevenLabs agent authentication and use server-generated signed URLs.
- Do not combine signed-URL authentication with an origin allowlist on the same agent.
- Disable ElevenLabs audio saving unless debugging a specific speech problem.
- Start with seven-day transcript retention to permit worker retries; shorten it after the pipeline is proven.
- Keep the server bound to `127.0.0.1` or add a real owner authentication layer before remote hosting.
- Persist only the conversation ID, response reference, owner note, small evidence excerpt, and evaluation outputs.
- Default local feedback retention to seven days and expose per-record deletion to the owner.
- Require explicit consent before opening the microphone or starting a provider session.
- Never commit `.env`, SQLite files, audio, or unredacted transcripts.

## No-key free-plan mode

The React SDK can connect to a public agent with only its agent ID. This is suitable for local development but is not private authentication: the ID is necessarily present in browser code. Do not publish the public client broadly unless you accept that anyone who obtains the ID may consume the agent's plan credits. Feedback evidence can still remain local because the browser sends only the nearby transcript messages selected for the feedback event.

The repository cannot enforce dashboard-level retention settings. Those must be configured on the ElevenLabs agent separately and periodically audited. The browser disclosure describes the current local defaults; a deployed service should replace it with a complete privacy notice for its jurisdiction and data flows.

## Local deletion behavior

`LOCAL_RETENTION_DAYS` defaults to `7`. Expired feedback and dependent jobs,
evaluation runs, and proposals are removed at server startup. Deployment audit
records are retained with their proposal link removed so rollback history is not
silently rewritten. Browser-fallback feedback is pruned to the same seven-day
window when the Improve view is opened. The Improve view also supports immediate
per-record deletion in both stores.
