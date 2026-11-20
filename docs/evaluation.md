# Evaluation and improvement policy

The evaluation system is repository-owned. ElevenLabs supplies the hosted agent and authorized conversation data, but does not own the improvement criteria, run history, approval policy, or release decision.

## Three layers

### Behavioral rubric

Five semantic criteria live in [`../eval/rubric.json`](../eval/rubric.json):

1. Useful next intervention
2. Understanding calibration
3. Reasoning ownership
4. Evidence and scope discipline
5. Voice-oriented communication

Each is independently scored `SUCCESS`, `FAILURE`, or `UNKNOWN`. `UNKNOWN` is required when the evidence does not support a judgment; it is not silently converted to failure.

### Regression scenarios

Eight source-controlled cases live in [`../eval/scenarios.json`](../eval/scenarios.json). They cover direct answers, novice explanation, mixed understanding, sound reasoning, transfer, evidence discipline, urgent decisions, and material ambiguity.

When candidate testing is enabled, the runner evaluates:

- One motivating case derived from the flagged conversation
- Two existing regression scenarios selected by the evaluator
- Current prompt and candidate prompt responses for each case

These are local model-based approximations produced by the configured evaluator endpoint. They do not prove identical behavior from the hosted ElevenLabs runtime. Before approving a high-risk change, confirm it in a real or simulated ElevenLabs conversation as well.

The proposal is not marked `ready-for-approval` unless all candidate cases pass. This is a conservative MVP gate, not a claim that three cases prove general quality.

### Deterministic integration checks

Unit and integration tests cover evidence targeting, idempotency, patch application, stale prompt conflicts, and rollback rules. These checks should never be delegated to an LLM judge.

## Improvement contract

An LLM evaluator may propose only one of:

- `replace`: replace one exact, unique prompt passage
- `append`: append a short instruction when no stable replacement target exists

The evaluator cannot publish. The server re-fetches the live prompt and compares its SHA-256 hash before applying an approved patch.

## Calibration process

After 5–10 representative calls:

1. Compare each model verdict with the owner’s judgment.
2. Loosen criteria that fail valid conversations.
3. Tighten criteria that pass obvious failures.
4. Add a regression scenario for every approved production change.
5. Version the rubric or scenarios whenever their meaning changes.

The user’s feedback is evidence, not automatic ground truth. Diagnosis must distinguish product preference, factual error, wrong intervention, retrieval failure, verbosity, and speech/turn-taking failure.
