# Security policy

Please report vulnerabilities privately through GitHub's **Report a vulnerability**
flow for this repository. Do not open a public issue containing credentials,
agent identifiers, private transcripts, conversation IDs, or personal data.

This project is a local-first prototype. Before exposing it to a network:

- set a strong `OWNER_TOKEN`;
- use ElevenLabs signed URLs rather than a public agent ID;
- terminate TLS at a trusted reverse proxy;
- review the configured retention period and provider privacy settings; and
- test access control and deletion behavior in the deployed environment.

Supported versions are the current `main` branch only.
