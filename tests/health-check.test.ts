import { describe, expect, it, vi } from "vitest";
import { runLiveCheck } from "../src/health-check.js";

const expectedSearchResult = {
  total: 1,
  page: 1,
  hasMore: false,
  hits: [
    {
      krs: "0001245101",
      name: "SOBA LABS PROSTA SPÓŁKA AKCYJNA",
      city: "WROCŁAW",
      registry: "P" as const,
      isOpp: false,
      isBankruptcy: false,
    },
  ],
};

describe("runLiveCheck", () => {
  it("reports healthy only when search and the official extract both work", async () => {
    const search = vi.fn(async () => expectedSearchResult);
    const getExtract = vi.fn(async () => ({ odpis: { naglowekA: { numerKRS: "1245101" } } }));

    const result = await runLiveCheck({ search, getExtract });

    expect(result).toMatchObject({ status: "healthy", actionable: false });
    expect(getExtract).toHaveBeenCalledWith("0001245101", "P", false);
  });

  it("classifies a successful response missing the known entity as a contract change", async () => {
    const search = vi.fn(async () => ({ ...expectedSearchResult, hits: [] }));
    const getExtract = vi.fn(async () => ({}));

    const result = await runLiveCheck({ search, getExtract });

    expect(result).toMatchObject({ status: "search-contract-change", actionable: true });
    expect(getExtract).not.toHaveBeenCalled();
  });

  it("classifies a search 403 as access blocked and requiring human review", async () => {
    const search = vi.fn(async () => {
      throw new Error("KRS search API returned 403");
    });

    const result = await runLiveCheck({ search, getExtract: vi.fn() });

    expect(result).toMatchObject({ status: "search-access-blocked", actionable: true });
  });

  it("classifies timeouts as transient upstream failures", async () => {
    const search = vi.fn(async () => {
      throw new Error("KRS request timed out after 15000ms");
    });

    const result = await runLiveCheck({ search, getExtract: vi.fn() });

    expect(result).toMatchObject({ status: "upstream-unavailable", actionable: false });
  });

  it("reports official API failures separately from search failures", async () => {
    const getExtract = vi.fn(async () => {
      throw new Error("KRS odpisy API returned 503");
    });

    const result = await runLiveCheck({
      search: vi.fn(async () => expectedSearchResult),
      getExtract,
    });

    expect(result).toMatchObject({ status: "official-api-failure", actionable: false });
  });

  it("rejects an official API response for the wrong or missing entity", async () => {
    const result = await runLiveCheck({
      search: vi.fn(async () => expectedSearchResult),
      getExtract: vi.fn(async () => ({ odpis: { naglowekA: {} } })),
    });

    expect(result).toMatchObject({ status: "official-api-failure", actionable: true });
  });

  it("reports an official API contract error as actionable", async () => {
    const result = await runLiveCheck({
      search: vi.fn(async () => expectedSearchResult),
      getExtract: vi.fn(async () => {
        throw new Error("KRS odpisy API response contract changed");
      }),
    });

    expect(result).toMatchObject({ status: "official-api-failure", actionable: true });
  });
});
