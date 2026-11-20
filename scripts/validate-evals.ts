import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { rubricSchema, scenarioFileSchema } from "../src/shared/schemas.ts";

const rubric = rubricSchema.parse(
  JSON.parse(await readFile(resolve("eval/rubric.json"), "utf8")),
);
const scenarios = scenarioFileSchema.parse(
  JSON.parse(await readFile(resolve("eval/scenarios.json"), "utf8")),
);

const duplicateCriteria = rubric.criteria.filter(
  (criterion, index, all) => all.findIndex((item) => item.id === criterion.id) !== index,
);
const duplicateScenarios = scenarios.scenarios.filter(
  (scenario, index, all) => all.findIndex((item) => item.id === scenario.id) !== index,
);

if (duplicateCriteria.length || duplicateScenarios.length) {
  throw new Error("Evaluation IDs must be unique.");
}

console.log(
  `Validated rubric ${rubric.version}: ${rubric.criteria.length} criteria and ${scenarios.scenarios.length} scenarios.`,
);
