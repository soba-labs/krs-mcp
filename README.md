# krs-mcp

An [MCP](https://modelcontextprotocol.io) server for the Polish **KRS** (Krajowy Rejestr Sądowy — National Court Register). It lets any MCP-capable AI client search Polish companies by name, KRS, NIP or REGON, and fetch official current and full registry extracts.

All four tools are read-only and require no API key, no account, and no configuration. KRS data is public record.

## Tools

| Tool | Inputs | Returns |
|---|---|---|
| `search_companies` | `query` (name or partial name) and/or `krs`, `nip`, `regon`; optional `registries` (array of registry types: `P` = entrepreneurs, `S` = associations; defaults to `["P", "S"]`, both searched), `page`, `pageSize` | Matching entities with their zero-padded 10-digit KRS numbers, city, registry, bankruptcy flag; paginated. **Use this first to resolve a company name to a KRS number.** |
| `get_company` | `krs` (1–10 digits, padding applied automatically), `rejestr` (`P`/`S`, default `P`) | Current official extract (*odpis aktualny*): identity, address, board, capital, PKD — as markdown |
| `get_company_full` | same as `get_company` | Full official extract (*odpis pełny*) as semantic JSON, preserving all historical entries. Much larger; prefer `get_company` unless you need history |
| `get_board` | same as `get_company` | Slim view of just the board, supervisory bodies and proxies (prokurenci) |

## How it works

- **Search** goes through the Ministry of Justice's public search service — the same backend that powers [wyszukiwarka-krs.ms.gov.pl](https://wyszukiwarka-krs.ms.gov.pl). The frontend signs its requests with a generated request token; krs-mcp reproduces that algorithm offline, so no credentials are needed.
- **Extracts (odpisy)** come from the Ministry of Justice's official open API at [api-krs.ms.gov.pl](https://api-krs.ms.gov.pl) — free and keyless. The data is public record (CC0).
- Search results and current extracts are formatted as compact, LLM-friendly markdown. Full extracts remain semantic JSON so no historical entries are discarded.

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

## Disclaimer

This project is not affiliated with, endorsed by, or connected to the Polish Ministry of Justice (Ministerstwo Sprawiedliwości). Registry data is fetched from public government sources and passed through as-is: personal data in extracts has been masked upstream since the 2023 amendment to the KRS Act. Provided without warranty of any kind.

## License

[MIT](LICENSE)

---

Built and maintained by [Soba Labs](https://sobalabs.dev).
