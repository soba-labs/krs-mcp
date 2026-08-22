#!/usr/bin/env node
// Fetches public KRS extracts for our own test company (Soba Labs) and writes
// them as local test fixtures. Fixtures are gitignored; regenerate any time.
//
// Usage: node scripts/fetch-test-fixtures.mjs

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const KRS = "0001245101";
const BASE = "https://api-krs.ms.gov.pl/api/krs";

const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "tests", "fixtures");

const endpoints = [
  ["odpis-aktualny-sobalabs.json", "OdpisAktualny"],
  ["odpis-pelny-sobalabs.json", "OdpisPelny"],
];

mkdirSync(outDir, { recursive: true });

for (const [file, odpis] of endpoints) {
  const url = `${BASE}/${odpis}/${KRS}?rejestr=P&format=json`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`${odpis} request failed with HTTP ${res.status}`);
  }
  const body = await res.json();
  writeFileSync(join(outDir, file), JSON.stringify(body, null, 2) + "\n");
  console.log(`wrote ${file}`);
}
