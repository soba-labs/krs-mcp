import { writeFile } from "node:fs/promises";
import { runLiveCheck } from "../dist/health-check.js";

const outputPath = process.env.KRS_HEALTH_OUTPUT ?? ".krs-health-result.json";
const result = await runLiveCheck();

await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
console.log(JSON.stringify(result));

if (result.status !== "healthy") {
  process.exitCode = 1;
}
