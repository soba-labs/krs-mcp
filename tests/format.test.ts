import { beforeEach, describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { extractBoard, formatOdpis, formatSearchResults } from "../src/format.js";
import type { SearchResult } from "../src/clients/search-api.js";

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const hasFixture = (name: string) => existsSync(join(fixtureDir, name));

function loadFixture(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(fixtureDir, name), "utf-8")) as Record<string, unknown>;
}

describe("formatSearchResults", () => {
  const result: SearchResult = {
    total: 157,
    page: 1,
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
    const single: SearchResult = { ...result, total: 1 };
    expect(formatSearchResults(single, "Soba Labs")).not.toContain("showing");
  });
});

describe.skipIf(!hasFixture("odpis-aktualny-sobalabs.json"))("formatOdpis", () => {
  let out = "";
  beforeEach(() => {
    out = formatOdpis(loadFixture("odpis-aktualny-sobalabs.json"), "aktualny");
  });

  it("includes company identity fields", () => {
    expect(out).toContain('Name: SOBA LABS PROSTA SPÓŁKA AKCYJNA');
    expect(out).toContain("0001245101");
    expect(out).toContain("8971973376");
    expect(out).toContain("54494280900000");
    expect(out).toContain("Legal form: PROSTA SPÓŁKA AKCYJNA");
  });

  it("includes address and city", () => {
    expect(out).toContain("WROCŁAW");
    expect(out).toContain("MARSZ. JÓZEFA PIŁSUDSKIEGO");
    expect(out).toContain("50-019");
  });

  it("includes board members", () => {
    expect(out).toContain("PREZES ZARZĄDU");
    expect(out).toContain("B******");
  });

  it("includes PKD codes", () => {
    expect(out).toContain("62.10.B");
    expect(out).toContain("POZOSTAŁA DZIAŁALNOŚĆ W ZAKRESIE PROGRAMOWANIA");
    expect(out).toContain("(primary)");
  });

  it("mentions the odpis kind", () => {
    expect(out.toLowerCase()).toContain("aktualny");
  });

  it("uses English labels only (Polish data values stay verbatim)", () => {
    expect(out).toContain("As of: 15.06.2026");
    expect(out).toContain("Representation: DO SKŁADANIA OŚWIADCZEŃ");
    expect(out).not.toMatch(/Nazwa:|Adres:|Forma prawna:|Kapitał zakładowy:/);
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

describe.skipIf(!hasFixture("odpis-aktualny-sobalabs.json"))("extractBoard", () => {
  it("returns only the board section", () => {
    const board = extractBoard(loadFixture("odpis-aktualny-sobalabs.json"));
    expect(board).toContain("ZARZĄD");
    expect(board).toContain("B******");
    expect(board).toContain("DO SKŁADANIA OŚWIADCZEŃ");
    expect(board).not.toContain("PROGRAMOWANIE");
    expect(board).not.toContain("8971973376");
  });

  it("returns empty-state text when nothing found", () => {
    expect(extractBoard({})).toContain("No board");
  });
});

describe.skipIf(!hasFixture("odpis-pelny-sobalabs.json"))("formatOdpis (pelny shape)", () => {
  let out = "";
  beforeEach(() => {
    out = formatOdpis(loadFixture("odpis-pelny-sobalabs.json"), "pelny");
  });

  it("unwraps history arrays into current values", () => {
    expect(out).toContain("SOBA LABS PROSTA SPÓŁKA AKCYJNA");
    expect(out).toContain("0001245101");
    expect(out).toContain("8971973376");
    expect(out).toContain("54494280900000");
    expect(out).toContain("PROSTA SPÓŁKA AKCYJNA");
    expect(out).toContain("As of: 15.06.2026");
  });

  it("renders address", () => {
    expect(out).toContain("MARSZ. JÓZEFA PIŁSUDSKIEGO 91");
    expect(out).toContain("50-019 WROCŁAW");
  });

  it("renders PKD from wrapped pozycja entries", () => {
    expect(out).toContain("62.10.B");
    expect(out).toContain("POZOSTAŁA DZIAŁALNOŚĆ W ZAKRESIE PROGRAMOWANIA");
    expect(out).toContain("(primary)");
  });

  it("renders board members", () => {
    expect(out).toContain("Board: ZARZĄD");
    expect(out).toContain("PREZES ZARZĄDU");
    expect(out).toContain("B******");
    expect(out).toContain("S***** J**");
  });

  it("picks the entry with the highest nrWpisuWprow when history has multiple entries", () => {
    // identyfikatory history: wprow 2 (withdrawn at 3, regon missing) vs wprow 3 (both ids)
    expect(out).toContain("REGON: 54494280900000");
  });
});

describe.skipIf(!hasFixture("odpis-pelny-sobalabs.json"))("extractBoard (pelny shape)", () => {
  it("works on the pelny shape", () => {
    const board = extractBoard(loadFixture("odpis-pelny-sobalabs.json"));
    expect(board).toContain("ZARZĄD");
    expect(board).toContain("PREZES ZARZĄDU");
    expect(board).toContain("B******");
    expect(board).not.toContain("PROGRAMOWANIE");
  });
});
