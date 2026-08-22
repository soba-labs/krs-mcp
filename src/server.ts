import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerGetBoard } from "./tools/get-board.js";
import { registerGetCompany } from "./tools/get-company.js";
import { registerGetCompanyFull } from "./tools/get-company-full.js";
import { registerSearchCompanies } from "./tools/search-companies.js";

export function buildServer(): McpServer {
  const server = new McpServer({ name: "krs-mcp", version: "0.1.0" });
  registerSearchCompanies(server);
  registerGetCompany(server);
  registerGetCompanyFull(server);
  registerGetBoard(server);
  return server;
}
