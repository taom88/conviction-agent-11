import { createServer } from "node:http";
import { loadConfig } from "./config.ts";
import { Repository } from "./database.ts";
import { ElevenLabsGateway } from "./elevenlabs.ts";
import { createRequestHandler } from "./http.ts";
import { ImprovementWorker } from "./worker.ts";

const config = loadConfig();
const repository = new Repository(config.databasePath);
const purged = repository.purgeExpiredFeedback(config.localRetentionDays);
if (purged > 0) console.log(`Purged ${purged} expired local feedback record(s).`);
const elevenLabs = new ElevenLabsGateway(config);
const worker = new ImprovementWorker(config, repository, elevenLabs);

const server = createServer(createRequestHandler({ config, repository, elevenLabs, worker }));
worker.start();

server.listen(config.port, config.host, () => {
  console.log(
    `Conviction server listening on http://${config.host}:${config.port} (${config.evaluator ? "LLM evaluator" : "heuristic evaluator"}).`,
  );
});

function shutdown(signal: string): void {
  console.log(`Received ${signal}; shutting down.`);
  worker.stop();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5_000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
