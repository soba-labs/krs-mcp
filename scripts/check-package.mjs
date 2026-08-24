import { execFileSync } from "node:child_process";

const output = execFileSync("npm", ["pack", "--dry-run", "--json", "--silent"], {
  encoding: "utf8",
});
const [manifest] = JSON.parse(output);
const packagedFiles = new Set(manifest.files.map(({ path }) => path));
const requiredRuntimeFiles = ["dist/index.js", "dist/server.js", "dist/tools/search-companies.js"];
const missing = requiredRuntimeFiles.filter((path) => !packagedFiles.has(path));

if (missing.length > 0) {
  throw new Error(`Package is missing runtime files: ${missing.join(", ")}`);
}

console.log(`Package contains ${manifest.entryCount} files, including the built runtime.`);
