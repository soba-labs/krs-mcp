# krs-mcp

An [MCP](https://modelcontextprotocol.io) server for the Polish **KRS** (Krajowy Rejestr Sądowy — National Court Register). It lets any MCP-capable AI client search Polish companies by name, KRS, NIP or REGON, and fetch official current and full registry extracts.

All four tools are read-only and require no API key, account, or configuration. KRS data is public record. Node.js 22.12 or later is required.

## Tools

| Tool | Inputs | Returns |
|---|---|---|
| `search_companies` | `query` (name or partial name) and/or `krs`, `nip`, `regon`; optional `registries` (array of registry types: `P` = entrepreneurs, `S` = associations; defaults to `["P", "S"]`, both searched), `page`, `pageSize` | Matching entities with their zero-padded 10-digit KRS numbers, city, registry, bankruptcy flag; paginated. **Use this first to resolve a company name to a KRS number.** |
| `get_company` | `krs` (1–10 digits, padding applied automatically), `rejestr` (`P`/`S`, default `P`) | Current official extract (*odpis aktualny*): identity, address, board, capital, PKD — as markdown |
| `get_company_full` | same as `get_company` | Full official extract (*odpis pełny*) as semantic JSON, preserving all historical entries. Much larger; prefer `get_company` unless you need history |
| `get_board` | same as `get_company` | Slim view of just the board, supervisory bodies and proxies (prokurenci) |

## How it works

- **Search** uses an undocumented endpoint behind the Ministry of Justice's public search website, [wyszukiwarka-krs.ms.gov.pl](https://wyszukiwarka-krs.ms.gov.pl). The endpoint is not part of the documented KRS Open API and may change or reject programmatic access without notice.
- **Extracts (odpisy)** come from the Ministry of Justice's official, keyless API at [api-krs.ms.gov.pl](https://api-krs.ms.gov.pl).
- Search results and current extracts are formatted as compact, LLM-friendly markdown. Full extracts remain semantic JSON so no historical entries are discarded.
- Every successful result includes a second text block containing JSON provenance: the source URL, retrieval time, source-production time when supplied, and a description of krs-mcp's processing. The source services do not currently provide a separate production timestamp, so `sourceProducedAt` is `null` rather than inferred. The full extract remains parseable JSON in the first text block.

## Reliability

Requests time out after 15 seconds. Network errors, HTTP 429 responses, and server errors are retried twice with short delays. Authentication or permission failures are returned immediately.

A daily GitHub Actions check verifies company-name search and the official extract API against a known public Soba Labs record. A contract change or access failure opens or updates one incident issue. Temporary upstream outages fail the check without creating an issue. Maintainers can also run `npm run check:live` manually.

GitHub may disable scheduled workflows in a public repository after 60 days without repository activity. If this repository becomes inactive, a maintainer must [re-enable the workflow](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/disable-and-enable-workflows) or run it manually.

The live check detects breakage; it does not make the undocumented search endpoint official or supported. A `403` requires human review. Maintainers and repair agents must not bypass new access controls automatically. The official extract tools remain usable if only name search breaks.

## Setup

### Claude Code / Codex / opencode-style clients

Add to your MCP configuration:

```json
{
  "mcpServers": {
    "krs-mcp": {
      "command": "npx",
      "args": ["-y", "krs-mcp"]
    }
  }
}
```

(Once the package is published to npm. Until then, use the from-source setup below.)

### From source

```sh
git clone https://github.com/soba-labs/krs-mcp.git
cd krs-mcp
npm install && npm run build
```

`npm test` is fully self-contained (synthetic fixtures, no network). Optionally, `node scripts/fetch-test-fixtures.mjs` refreshes ignored live captures for manual comparison with KRS 0001245101.

```json
{
  "mcpServers": {
    "krs-mcp": {
      "command": "node",
      "args": ["<path-to-repo>/dist/index.js"]
    }
  }
}
```

## Example workflow

1. `search_companies` with `"query": "allegro"` → get the padded KRS number
2. `get_company` with `"krs": "0000245961"` → current extract
3. `get_board` with the same KRS → just the people

## Data reuse and privacy

The Ministry of Justice's [public-sector information reuse conditions](https://www.gov.pl/web/sprawiedliwosc/ponowne-wykorzystywanie) require users to identify the source, the time the information was produced and obtained, and any processing applied to it. krs-mcp adds those disclosure fields to every successful tool result and explicitly marks an unavailable source-production time as `null`. Downstream users remain responsible for preserving the required attribution and complying with applicable privacy and reuse rules.

krs-mcp sends requests only to the Ministry's KRS services. It has no telemetry and does not persist registry responses. Your MCP client may send tool output to its configured model provider; review that provider's privacy terms before processing personal data. The Ministry controls masking in the source responses, and krs-mcp does not independently redact fields in full extracts.

## Disclaimer

This project is not affiliated with, endorsed by, or connected to the Polish Ministry of Justice (Ministerstwo Sprawiedliwości). Registry data is fetched from public government sources. Formatted tools transform or select fields as described above; full extracts are passed through as JSON. Provided without warranty of any kind.

## License

[MIT](LICENSE)

---

Built and maintained by [Soba Labs](https://sobalabs.ai).
