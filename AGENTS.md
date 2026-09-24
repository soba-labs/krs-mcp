# AGENTS.md

This file provides guidance to AI coding agents (Claude Code, Codex and others) when working with code in this repository.

krs-mcp is a stdio MCP server (TypeScript, ESM, Node >= 22.12) exposing four read-only tools over the Polish KRS registry: `search_companies`, `get_company`, `get_company_full`, `get_board`.

## Commands

```sh
npm ci
npm run build              # tsc -> dist/
npm run typecheck          # tsc over src + tests (tsconfig.test.json, no emit)
npm test                   # vitest run, offline, synthetic fixtures only
npx vitest run tests/format.test.ts        # single file
npx vitest run -t "maps response fields"   # single test by name
npm run check:package      # npm pack dry run, asserts dist runtime files ship
npm run check:live         # builds, then hits the real Ministry endpoints once
node scripts/fetch-test-fixtures.mjs       # writes gitignored live captures for manual comparison
```

CI (`.github/workflows/ci.yml`, Node 22 and 24) runs `npm audit --audit-level=high`, `check:package`, `typecheck`, `test`, `build`. Run the same set before opening a PR.

## Architecture

`src/index.ts` connects `buildServer()` (`src/server.ts`) to a stdio transport; `buildServer` registers one tool per file in `src/tools/`.

**Two upstream clients, very different trust levels** (`src/clients/`):
- `krs-api.ts`: the official, keyless extract API (`api-krs.ms.gov.pl`, `OdpisAktualny` / `OdpisPelny`). 404 maps to `null` (not found).
- `search-api.ts`: an **undocumented** endpoint behind the Ministry's public search website. It needs browser-like headers plus a 512-digit `apikey` produced by `src/key-generator.ts`, a port of the site's frontend request interceptor. `tests/fixtures/key-vectors.json` pins its output for deterministic `random`/`timestamp` inputs; any change to the generator must keep those vectors passing.

Both clients call `fetchWithRetry` (`request.ts`: 15 s timeout, retries 429/5xx/network errors after 250 ms and 750 ms, returns 4xx immediately) and each owns a module-level `Pacer(500)` that spaces requests. Both validate the response shape and throw `"... response contract changed"` on mismatch. Both accept an injectable `fetchImpl`, which is how tests stub the network.

**Tool result contract** (`src/tools/common.ts`): tools never throw. Failures return `textResult(message, true)`; `errorText` maps known errors (e.g. search 403) to user-facing text. Successes return two text blocks: the payload (markdown from `src/format.ts`, or raw JSON for `get_company_full`) and a provenance JSON block (`source`, `sourceProducedAt: null`, `retrievedAt`, `processing`). The provenance block exists to satisfy the Ministry's data reuse conditions (see README); do not drop it or infer `sourceProducedAt`.

**Formatting** (`src/format.ts`): walks the odpis JSON by path to produce compact markdown; handles both aktualny and pelny shapes (`isPelny`), and `normalize` collapses historical entries for the board view.

**Search input quirks** (`src/tools/search-companies.ts`): empty strings are treated as absent, `name`/`nazwa` are aliased to `query` because models guess those names, and at least one criterion is required.

## Upstream monitoring

`src/health-check.ts` runs a live search plus extract against a fixed public record (Soba Labs, KRS 0001245101) and classifies failures into statuses with an `actionable` flag (transient outages are not actionable). `scripts/check-live.mjs` imports from `dist/`, so it needs a build first (the npm script does this). The daily `upstream-compatibility.yml` workflow feeds the result to `scripts/report-live-failure.mjs` -> `src/ops/github-incident.ts`, which opens or comments on a single incident issue.

A search `403` means the Ministry changed access controls: it requires human review. Never add code that bypasses new access controls automatically.

## Conventions and gotchas

- ESM with `module: Node16`: relative imports in `src/` must end in `.js`.
- The version `0.1.0` is hardcoded in `package.json`, `src/server.ts` and the user agent in `src/clients/krs-api.ts`; bump all three together.
- Tests must use synthetic fixtures and never touch live services. `tests/fixtures/*` is gitignored except the three committed synthetic files; never commit live registry captures or personal data.
- The live check must stay a single narrow query for the known record; do not add broad queries or personal data to it.
- `docs/` and `.superpowers/` are gitignored local working material, not part of the project.
