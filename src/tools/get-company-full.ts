import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getOdpisOrError, textResult } from "./common.js";

const inputSchema = z.object({
  krs: z.string().regex(/^\d{1,10}$/).describe("KRS number, 1-10 digits (padding is applied automatically)."),
  rejestr: z.enum(["P", "S"]).default("P").describe("Registry: P = entrepreneurs, S = associations."),
});

export function registerGetCompanyFull(server: McpServer) {
  server.registerTool(
    "get_company_full",
    {
      title: "Get full KRS extract",
      description:
        "Fetch the FULL (pelny) official semantic JSON extract of a Polish company from the KRS registry by its 1-10 digit KRS number. Preserves all historical entries. Much larger than the current extract; use get_company unless history is needed.",
      inputSchema,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ krs, rejestr }) => {
      const result = await getOdpisOrError(krs, rejestr, true);
      if (!result.ok) return textResult(result.error, true);
      return textResult(JSON.stringify(result.odpis, null, 2), false, {
        source: result.source,
        processing: "Full extract passed through as JSON by krs-mcp.",
      });
    },
  );
}
