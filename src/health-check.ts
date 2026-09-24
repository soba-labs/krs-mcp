import { getOdpis } from "./clients/krs-api.js";
import { searchCompanies, type SearchParams, type SearchResult } from "./clients/search-api.js";

const CHECK_KRS = "0001245101";
const CHECK_NAME = "SOBA LABS PROSTA SPÓŁKA AKCYJNA";

type HealthStatus =
  | "healthy"
  | "search-contract-change"
  | "search-access-blocked"
  | "upstream-unavailable"
  | "official-api-failure"
  | "unknown-failure";

export interface HealthCheckResult {
  status: HealthStatus;
  actionable: boolean;
  summary: string;
  checkedAt: string;
}

interface HealthCheckDependencies {
  search: (params: SearchParams) => Promise<SearchResult>;
  getExtract: typeof getOdpis;
}

function result(status: HealthStatus, actionable: boolean, summary: string): HealthCheckResult {
  return { status, actionable, summary, checkedAt: new Date().toISOString() };
}

function classifySearchFailure(error: unknown): HealthCheckResult {
  const message = error instanceof Error ? error.message : String(error);
  if (/\b403\b/.test(message)) {
    return result(
      "search-access-blocked",
      true,
      "The KRS search service refused programmatic access. Human review is required; do not bypass access controls automatically.",
    );
  }
  if (/timed out|\b429\b|\b5\d\d\b|fetch failed|network|ECONN/i.test(message)) {
    return result(
      "upstream-unavailable",
      false,
      "The KRS search service is temporarily unavailable after retries.",
    );
  }
  if (/\b401\b|JSON|parse|syntax/i.test(message)) {
    return result(
      "search-contract-change",
      true,
      "The KRS search authentication or response contract appears to have changed.",
    );
  }
  return result("unknown-failure", true, "The KRS search compatibility check failed unexpectedly.");
}

function classifyOfficialApiFailure(error: unknown): HealthCheckResult {
  const message = error instanceof Error ? error.message : String(error);
  if (/response contract|\b401\b|\b403\b|JSON|parse|syntax/i.test(message)) {
    return result(
      "official-api-failure",
      true,
      "The official KRS API access or response contract appears to have changed.",
    );
  }

  return result(
    "official-api-failure",
    false,
    "The official KRS API is unavailable after retries.",
  );
}

function extractKrsNumber(extract: Record<string, unknown>): string | null {
  const odpis = extract.odpis;
  if (odpis === null || typeof odpis !== "object") return null;
  const header = (odpis as Record<string, unknown>).naglowekA;
  if (header === null || typeof header !== "object") return null;
  const value = (header as Record<string, unknown>).numerKRS;
  if (typeof value !== "string" || !/^\d{1,10}$/.test(value)) return null;
  return value.padStart(10, "0");
}

export async function runLiveCheck({
  search = searchCompanies,
  getExtract = getOdpis,
}: Partial<HealthCheckDependencies> = {}): Promise<HealthCheckResult> {
  let searchResult: SearchResult;
  try {
    searchResult = await search({ name: CHECK_NAME, registries: ["P"], pageSize: 10 });
  } catch (error) {
    return classifySearchFailure(error);
  }

  if (!searchResult.hits.some((hit) => hit.krs === CHECK_KRS)) {
    return result(
      "search-contract-change",
      true,
      "The search endpoint responded but no longer returned the known entity.",
    );
  }

  try {
    const extract = await getExtract(CHECK_KRS, "P", false);
    if (extract === null) {
      return result("official-api-failure", false, "The official KRS API did not return the known entity.");
    }
    if (extractKrsNumber(extract) !== CHECK_KRS) {
      return result(
        "official-api-failure",
        true,
        "The official KRS API response no longer matches the expected entity contract.",
      );
    }
  } catch (error) {
    return classifyOfficialApiFailure(error);
  }

  return result("healthy", false, "Search and official extract checks passed.");
}
