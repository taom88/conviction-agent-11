# Contributing

Thank you for improving Conviction.

1. Use Node.js 24 or newer.
2. Copy `.env.example` to `.env.local` and add your own agent ID. Never commit
   credentials, live agent IDs, transcripts, conversation IDs, or SQLite data.
3. Keep changes focused and add tests for behavior changes.
4. Before opening a pull request, run:

   ```bash
   npm ci
   npm run eval:validate
   npm test
   npm run build
   ```

Prompt and rubric changes should explain the motivating failure and identify the
regression scenarios used to validate the change. Live-agent changes remain a
separate, explicit owner action.
