import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { extractBoard, formatOdpis, formatSearchResults } from "../src/format.js";
import type { SearchResult } from "../src/clients/search-api.js";

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

function loadFixture(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(fixtureDir, name), "utf-8")) as Record<string, unknown>;
}

describe("formatSearchResults", () => {
  const result: SearchResult = {
    total: 157,
    page: 1,
    hasMore: true,
    hits: [
      {
        krs: "1245101",
        name: "SOBA LABS PROSTA SPÓŁKA AKCYJNA",
        city: "WROCŁAW",
        registry: "P",
        isOpp: false,
        isBankruptcy: false,
      },
    ],
  };

  it("renders one line per hit with padded KRS", () => {
    const out = formatSearchResults(result, "Soba Labs");
    expect(out).toContain("0001245101");
    expect(out).toContain("SOBA LABS PROSTA SPÓŁKA AKCYJNA");
    expect(out).toContain("WROCŁAW");
    expect(out).toContain("| P");
    expect(out).toContain("157");
    expect(out).toContain("Soba Labs");
  });

  it("appends truncation hint when results exceed the page", () => {
    const out = formatSearchResults(result, "Soba Labs");
    expect(out).toContain("(showing 1 of 157 results; use page=2 for more)");
  });

  it("omits the hint when everything fits on one page", () => {
    const single: SearchResult = { ...result, total: 1, hasMore: false };
    expect(formatSearchResults(single, "Soba Labs")).not.toContain("showing");
  });

  it("omits the next-page hint on the final page", () => {
    const finalPage: SearchResult = { ...result, total: 150, page: 3, hasMore: false };
    expect(formatSearchResults(finalPage, "Soba Labs")).not.toContain("page=4");
  });
});

describe("formatOdpis", () => {
  let out = "";
  beforeEach(() => {
    out = formatOdpis(loadFixture("odpis-aktualny-synthetic.json"), "aktualny");
  });

  it("includes company identity fields", () => {
    expect(out).toContain("Name: SYNTHETIC PSA");
    expect(out).toContain("0001234567");
    expect(out).toContain("1111111111");
    expect(out).toContain("22222222222222");
    expect(out).toContain("Legal form: PROSTA SPÓŁKA AKCYJNA");
  });

  it("includes address and city", () => {
    expect(out).toContain("WROCŁAW");
    expect(out).toContain("UL. TESTOWA");
    expect(out).toContain("50-001");
  });

  it("includes board members", () => {
    expect(out).toContain("PREZES ZARZĄDU");
    expect(out).toContain("ALICE ACTIVE");
  });

  it("includes PKD codes", () => {
    expect(out).toContain("62.10.B");
    expect(out).toContain("PROGRAMOWANIE");
    expect(out).toContain("(primary)");
  });

  it("mentions the odpis kind", () => {
    expect(out.toLowerCase()).toContain("aktualny");
  });

  it("uses English labels only (Polish data values stay verbatim)", () => {
    expect(out).toContain("As of: 23.08.2026");
    expect(out).toContain("Representation: KAŻDY CZŁONEK SAMODZIELNIE");
    expect(out).not.toMatch(/Nazwa:|Adres:|Forma prawna:|Kapitał zakładowy:/);
  });

  it("includes PSA share capital", () => {
    expect(out).toContain("Share capital: 5000,00 PLN");
    expect(out).toContain("Number of shares/units: 1000");
  });
});

describe("formatOdpis with empty dzial sections", () => {
  it("handles empty dzial sections gracefully", () => {
    const bare: Record<string, unknown> = { odpis: { rodzaj: "Aktualny" } };
    const empty = formatOdpis(bare, "aktualny");
    expect(empty).toBeTruthy();
    expect(empty).not.toContain("undefined");
  });

  it("emits no section header when a section has no content", () => {
    const bare: Record<string, unknown> = { odpis: { rodzaj: "Aktualny" } };
    const empty = formatOdpis(bare, "aktualny");
    expect(empty).not.toContain("Basic information");
    expect(empty).not.toContain("Share capital");
    expect(empty).not.toContain("PKD");
    expect(empty).not.toContain("Proxies");
  });
});

describe("extractBoard", () => {
  it("returns only the board section", () => {
    const board = extractBoard(loadFixture("odpis-aktualny-synthetic.json"));
    expect(board).toContain("ZARZĄD");
    expect(board).toContain("ALICE ACTIVE");
    expect(board).toContain("KAŻDY CZŁONEK SAMODZIELNIE");
    expect(board).not.toContain("PROGRAMOWANIE");
    expect(board).not.toContain("1111111111");
  });

  it("returns empty-state text when nothing found", () => {
    expect(extractBoard({})).toContain("No board");
  });
});

describe("formatOdpis (pelny shape)", () => {
  let out = "";
  beforeEach(() => {
    out = formatOdpis(loadFixture("odpis-pelny-synthetic.json"), "pelny");
  });

  it("unwraps history arrays into current values", () => {
    expect(out).toContain("SYNTHETIC PSA");
    expect(out).toContain("0001234567");
    expect(out).toContain("1111111111");
    expect(out).toContain("22222222222222");
    expect(out).toContain("PROSTA SPÓŁKA AKCYJNA");
    expect(out).toContain("As of: 23.08.2026");
  });

  it("renders address", () => {
    expect(out).toContain("UL. TESTOWA 1");
    expect(out).toContain("50-001 WROCŁAW");
  });

  it("renders PKD from wrapped pozycja entries", () => {
    expect(out).toContain("62.10.B");
    expect(out).toContain("PROGRAMOWANIE");
    expect(out).toContain("(primary)");
  });

  it("renders board members", () => {
    expect(out).toContain("Board: ZARZĄD");
    expect(out).toContain("PREZES ZARZĄDU");
    expect(out).toContain("ALICE ACTIVE");
    expect(out).not.toContain("BOB WITHDRAWN");
  });

  it("picks the entry with the highest nrWpisuWprow when history has multiple entries", () => {
    // The first identifier set is withdrawn; the later active set contains both identifiers.
    expect(out).toContain("REGON: 22222222222222");
  });

  it("includes PSA share capital", () => {
    expect(out).toContain("Share capital: 5000,00 PLN");
    expect(out).toContain("Number of shares/units: 1000");
  });
});

describe("extractBoard (pelny shape)", () => {
  it("works on the pelny shape", () => {
    const board = extractBoard(loadFixture("odpis-pelny-synthetic.json"));
    expect(board).toContain("ZARZĄD");
    expect(board).toContain("PREZES ZARZĄDU");
    expect(board).toContain("ALICE ACTIVE");
    expect(board).not.toContain("BOB WITHDRAWN");
    expect(board.split("\n").filter((line) => line.startsWith("- "))).toHaveLength(1);
    expect(board).not.toContain("PROGRAMOWANIE");
  });
});
