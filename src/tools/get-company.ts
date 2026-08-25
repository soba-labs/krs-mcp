import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { formatOdpis } from "../format.js";
import { getOdpisOrError, textResult } from "./common.js";

const inputSchema = z.object({
  krs: z.string().regex(/^\d{1,10}$/).describe("KRS number, 1-10 digits (padding is applied automatically)."),
  rejestr: z.enum(["P", "S"]).default("P").describe("Registry: P = entrepreneurs, S = associations."),
});

export function registerGetCompany(server: McpServer) {
  server.registerTool(
    "get_company",
    {
      title: "Get current KRS extract",
      description:
        "Fetch the CURRENT (aktualny) official extract of a Polish company from the KRS registry by its 1-10 digit KRS number. Returns identity, address, board, capital and PKD as markdown.",
      inputSchema,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ krs, rejestr }) => {
      const result = await getOdpisOrError(krs, rejestr, false);
      if (!result.ok) return textResult(result.error, true);
      return textResult(formatOdpis(result.odpis, "aktualny"), false, {
        source: result.source,
        processing: "Current extract formatted as Markdown by krs-mcp.",
      });
    },
  );
}
