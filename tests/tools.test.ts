import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { buildServer } from "../src/server.js";

const SEARCH_SOURCE = "https://wyszukiwarka-krs-api.ms.gov.pl/api/wyszukiwarka/krs";
const EXTRACT_SOURCE_PREFIX = "https://api-krs.ms.gov.pl/api/krs/";

const sobalabsSearch = {
  liczbaPodmiotow: 1,
  listaPodmiotow: [
    {
      numer: "1245101",
      nazwa: "SOBA LABS PROSTA SPÓŁKA AKCYJNA",
      miejscowosc: "WROCŁAW",
      typRejestru: "P",
      czyOPP: false,
      czyUpadlosc: false,
    },
  ],
};

const odpisFixture = {
  odpis: {
    rodzaj: "Aktualny",
    naglowekA: { numerKRS: "0001245101", stanZDnia: "2026-01-01" },
    dane: {
      dzial1: {
        danePodmiotu: {
          nazwa: "SOBA LABS PROSTA SPÓŁKA AKCYJNA",
          identyfikatory: { nip: "1111111111", regon: "22222222222222" },
        },
        siedzibaIAdres: {
          siedziba: { kraj: "POLSKA" },
          adres: { miejscowosc: "WROCŁAW", kodPocztowy: "50-019", poczta: "WROCŁAW" },
        },
      },
      dzial2: {
        reprezentacja: {
          nazwaOrganu: "Zarząd",
          sklad: [
            {
              funkcjaWOrganie: "PREZES ZARZĄDU",
              imiona: { imie: "JAN" },
              nazwisko: { nazwiskoICzlon: "KOWALSKI" },
            },
          ],
        },
        prokurenci: [
          {
            funkcjaWOrganie: "PROKURENT",
            imiona: { imie: "ANNA" },
            nazwisko: { nazwiskoICzlon: "NOWAK" },
            rodzajProkury: "SAMOISTNA",
          },
        ],
      },
    },
  },
};

const fullOdpisFixture = JSON.parse(
  readFileSync(new URL("./fixtures/odpis-pelny-synthetic.json", import.meta.url), "utf8"),
) as Record<string, unknown>;

async function connect(fetchMock: ReturnType<typeof vi.fn>): Promise<Client> {
  vi.stubGlobal("fetch", fetchMock);
  const server: McpServer = buildServer();
  const client = new Client({ name: "test-client", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(clientTransport), client.connect(serverTransport)]);
  return client;
}

function okFetch(body: unknown, status = 200) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status }));
}

function expectProvenance(
  response: unknown,
  expected: { source: string | RegExp; processing: string },
) {
  if (response === null || typeof response !== "object" || !("content" in response)) {
    throw new TypeError("Expected a completed MCP tool result with content.");
  }
  const content = response.content as Array<{ type: string; text: string }>;
  expect(content).toHaveLength(2);
  expect(content[1].type).toBe("text");

  const provenance = JSON.parse(content[1].text) as Record<string, string | null>;
  if (typeof expected.source === "string") {
    expect(provenance.source).toBe(expected.source);
  } else {
    expect(provenance.source).toMatch(expected.source);
  }
  expect(provenance.sourceProducedAt).toBeNull();
  expect(provenance.processing).toBe(expected.processing);
  expect(provenance.retrievedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("krs-mcp tools", () => {
  it("lists exactly the four tools", async () => {
    const client = await connect(okFetch(sobalabsSearch));
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      "get_board",
      "get_company",
      "get_company_full",
      "search_companies",
    ]);
    expect(tools.every((tool) => tool.annotations?.readOnlyHint === true)).toBe(true);
    expect(tools.every((tool) => tool.annotations?.openWorldHint === true)).toBe(true);
  });

  it("search_companies returns padded KRS number", async () => {
    const client = await connect(okFetch(sobalabsSearch));
    const res = await client.callTool({ name: "search_companies", arguments: { query: "Soba Labs" } });
    expect(res.isError).toBeFalsy();
    const text = (res.content as Array<{ text: string }>)[0].text;
    expect(text).toContain("0001245101");
    expect(text).toContain("SOBA LABS");
    expectProvenance(res, {
      source: SEARCH_SOURCE,
      processing: "Search results formatted as Markdown by krs-mcp.",
    });
  });

  it("search_companies accepts name/nazwa as aliases for query", async () => {
    for (const alias of ["name", "nazwa"]) {
      const client = await connect(okFetch(sobalabsSearch));
      const res = await client.callTool({
        name: "search_companies",
        arguments: { [alias]: "Soba Labs" },
      });
      expect(res.isError).toBeFalsy();
      const text = (res.content as Array<{ text: string }>)[0].text;
      expect(text).toContain("0001245101");
      await client.close();
    }
  });

  it("search_companies without criteria returns an actionable error", async () => {
    const client = await connect(okFetch(sobalabsSearch));
    const res = await client.callTool({ name: "search_companies", arguments: {} });
    expect(res.isError).toBe(true);
    const text = (res.content as Array<{ text: string }>)[0].text;
    expect(text).toMatch(/query|krs|nip|regon/i);
  });

  it("search_companies accepts a valid KRS when query is empty", async () => {
    const fetchMock = okFetch(sobalabsSearch);
    const client = await connect(fetchMock);
    const res = await client.callTool({
      name: "search_companies",
      arguments: { query: "", krs: "1245101" },
    });
    expect(res.isError).toBeFalsy();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("search_companies rejects a non-digit KRS before calling the API", async () => {
    const fetchMock = okFetch(sobalabsSearch);
    const client = await connect(fetchMock);
    const res = await client.callTool({
      name: "search_companies",
      arguments: { krs: "not-digits" },
    });
    expect(res.isError).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("get_company with 404 reports not found", async () => {
    const client = await connect(okFetch({}, 404));
    const res = await client.callTool({
      name: "get_company",
      arguments: { krs: "9999999999", rejestr: "P" },
    });
    expect(res.isError).toBe(true);
    const text = (res.content as Array<{ text: string }>)[0].text;
    expect(text.toLowerCase()).toContain("not found");
  });

  it("get_company returns source and processing provenance", async () => {
    const client = await connect(okFetch(odpisFixture));
    const res = await client.callTool({
      name: "get_company",
      arguments: { krs: "1245101", rejestr: "P" },
    });
    expect(res.isError).toBeFalsy();
    expectProvenance(res, {
      source: new RegExp(`^${EXTRACT_SOURCE_PREFIX}OdpisAktualny/0001245101\\?`),
      processing: "Current extract formatted as Markdown by krs-mcp.",
    });
  });

  it("get_company_full returns the complete semantic JSON with history", async () => {
    const client = await connect(okFetch(fullOdpisFixture));
    const res = await client.callTool({
      name: "get_company_full",
      arguments: { krs: "1245101", rejestr: "P" },
    });
    expect(res.isError).toBeFalsy();
    const text = (res.content as Array<{ text: string }>)[0].text;
    expect(JSON.parse(text)).toEqual(fullOdpisFixture);
    expect(text).toContain("BOB");
    expect(text).toContain("nrWpisuWykr");
    expectProvenance(res, {
      source: new RegExp(`^${EXTRACT_SOURCE_PREFIX}OdpisPelny/0001245101\\?`),
      processing: "Full extract passed through as JSON by krs-mcp.",
    });
  });

  it("get_board extracts board members", async () => {
    const client = await connect(okFetch(odpisFixture));
    const res = await client.callTool({
      name: "get_board",
      arguments: { krs: "1245101", rejestr: "P" },
    });
    expect(res.isError).toBeFalsy();
    const text = (res.content as Array<{ text: string }>)[0].text;
    expect(text).toContain("JAN KOWALSKI");
    expect(text).toContain("PREZES ZARZĄDU");
    expect(text).toContain("ANNA NOWAK");
    expect(text).toContain("SAMOISTNA");
    expectProvenance(res, {
      source: new RegExp(`^${EXTRACT_SOURCE_PREFIX}OdpisAktualny/0001245101\\?`),
      processing: "Extract reduced to board, supervisory-body, and proxy fields by krs-mcp.",
    });
  });

  it("surfaces API errors with status in the message", async () => {
    const client = await connect(okFetch("blocked", 403));
    const res = await client.callTool({
      name: "search_companies",
      arguments: { query: "x" },
    });
    expect(res.isError).toBe(true);
    const text = (res.content as Array<{ text: string }>)[0].text;
    expect(text).toContain("403");
  });

  it("does not label an extract API 403 as search bot protection", async () => {
    const client = await connect(okFetch("blocked", 403));
    const res = await client.callTool({
      name: "get_company",
      arguments: { krs: "1245101" },
    });
    expect(res.isError).toBe(true);
    const text = (res.content as Array<{ text: string }>)[0].text;
    expect(text).toContain("403");
    expect(text).not.toContain("search endpoint");
  });
});
