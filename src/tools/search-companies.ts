import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { searchCompanies } from "../clients/search-api.js";
import { formatSearchResults } from "../format.js";
import { errorText, textResult } from "./common.js";

const inputSchema = z
  .object({
    query: z
      .string()
      .optional()
      .describe(
        "Company name or partial name. This is the only tool that can resolve a company NAME to a KRS number.",
      ),
    krs: z.string().optional().describe("Exact KRS number (digits only)."),
    nip: z.string().optional(),
    regon: z.string().optional(),
    registries: z
      .enum(["P", "S"])
      .array()
      .default(["P", "S"])
      .describe("Registries to search: P = entrepreneurs, S = associations."),
    page: z.number().int().min(1).default(1),
    pageSize: z.number().int().min(1).max(100).default(100),
  })
  .refine((v) => Boolean(v.query ?? v.krs ?? v.nip ?? v.regon), {
    message: "Provide at least one search criterion: query (name), krs, nip or regon.",
  });

export function registerSearchCompanies(server: McpServer) {
  server.registerTool(
    "search_companies",
    {
      title: "Search the KRS registry",
      description:
        'Search Polish companies in the KRS (National Court Register) by name or partial name ("query"), KRS, NIP or REGON. Returns matching entities with their padded 10-digit KRS numbers — use this FIRST to resolve a company name to a KRS number before calling get_company / get_company_full / get_board.',
      inputSchema,
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
        return textResult(formatSearchResults(result, criteria));
      } catch (err) {
        return textResult(errorText(err), true);
      }
    },
  );
}
