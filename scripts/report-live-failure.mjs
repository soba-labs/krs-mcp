import { readFile } from "node:fs/promises";
import { reportLiveIncident } from "../dist/ops/github-incident.js";

const outputPath = process.env.KRS_HEALTH_OUTPUT ?? ".krs-health-result.json";
const requiredEnvironment = ["GH_TOKEN", "GH_REPO", "RUN_URL"];

for (const name of requiredEnvironment) {
  if (!process.env[name]) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
}

const result = JSON.parse(await readFile(outputPath, "utf8"));
const outcome = await reportLiveIncident(result, {
  token: process.env.GH_TOKEN,
  repository: process.env.GH_REPO,
  runUrl: process.env.RUN_URL,
});

console.log(`Incident outcome: ${outcome}`);
