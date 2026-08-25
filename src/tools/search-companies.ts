import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SEARCH_URL, searchCompanies } from "../clients/search-api.js";
import { formatSearchResults } from "../format.js";
import { errorText, textResult } from "./common.js";

function optionalCriterion(schema: z.ZodString) {
  return z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    schema.optional(),
  );
}

const inputSchemaBase = z
  .object({
    query: optionalCriterion(z.string().trim().min(1)).describe(
        "Company name or partial name. This is the only tool that can resolve a company NAME to a KRS number.",
      ),
    krs: optionalCriterion(z.string().trim().regex(/^\d{1,10}$/)).describe(
      "Exact KRS number, 1-10 digits.",
    ),
    nip: optionalCriterion(z.string().trim().regex(/^\d{10}$/)).describe(
      "Exact NIP number, 10 digits.",
    ),
    regon: optionalCriterion(z.string().trim().regex(/^(?:\d{9}|\d{14})$/)).describe(
      "Exact REGON number, 9 or 14 digits.",
    ),
    registries: z
      .enum(["P", "S"])
      .array()
      .min(1)
      .default(["P", "S"])
      .describe("Registries to search: P = entrepreneurs, S = associations."),
    page: z.number().int().min(1).default(1),
    pageSize: z.number().int().min(1).max(100).default(100),
  });

// Client models often guess "name"/"nazwa" from the tool description instead of
// "query" — accept both so a guess never becomes a validation error.
const withNameAlias = z.preprocess((args) => {
  if (args !== null && typeof args === "object" && !Array.isArray(args)) {
    const a = { ...(args as Record<string, unknown>) };
    if (a.query === undefined && typeof a.name === "string") a.query = a.name;
    if (a.query === undefined && typeof a.nazwa === "string") a.query = a.nazwa;
    return a;
  }
  return args;
}, inputSchemaBase);

const inputSchema = withNameAlias.refine(
  (v) => [v.query, v.krs, v.nip, v.regon].some((criterion) => criterion !== undefined),
  {
    message: "Provide at least one search criterion: query (name), krs, nip or regon.",
  },
);

export function registerSearchCompanies(server: McpServer) {
  server.registerTool(
    "search_companies",
    {
      title: "Search the KRS registry",
      description:
        'Search Polish companies in the KRS (National Court Register) by name or partial name ("query"), KRS, NIP or REGON. Returns matching entities with their padded 10-digit KRS numbers — use this FIRST to resolve a company name to a KRS number before calling get_company / get_company_full / get_board.',
      inputSchema,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) => {
      try {
        const result = await searchCompanies({
          name: args.query,
          krs: args.krs,
          nip: args.nip,
          regon: args.regon,
          registries: [...args.registries],
          page: args.page,
          pageSize: args.pageSize,
        });
        const criteria = [
          args.query && `"${args.query}"`,
          args.krs && `krs=${args.krs}`,
          args.nip && `nip=${args.nip}`,
          args.regon && `regon=${args.regon}`,
        ]
          .filter(Boolean)
          .join(", ");
        return textResult(formatSearchResults(result, criteria), false, {
          source: SEARCH_URL,
          processing: "Search results formatted as Markdown by krs-mcp.",
        });
      } catch (err) {
        return textResult(errorText(err), true);
      }
    },
  );
}
