import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { extractBoardAndProxies } from "../format.js";
import { getOdpisOrError, textResult } from "./common.js";

const inputSchema = z.object({
  krs: z.string().regex(/^\d{1,10}$/).describe("KRS number, 1-10 digits (padding is applied automatically)."),
  rejestr: z.enum(["P", "S"]).default("P").describe("Registry: P = entrepreneurs, S = associations."),
});

export function registerGetBoard(server: McpServer) {
  server.registerTool(
    "get_board",
    {
      title: "Get KRS board members",
      description:
        "List the board, supervisory bodies and proxies of a Polish company from its current KRS extract. Resolve the KRS number first with search_companies.",
      inputSchema,
    },
    async ({ krs, rejestr }) => {
      const result = await getOdpisOrError(krs, rejestr, false);
      if (!result.ok) return textResult(result.error, true);
      return textResult(extractBoardAndProxies(result.odpis));
    },
  );
}
