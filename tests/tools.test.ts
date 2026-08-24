import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { buildServer } from "../src/server.js";

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
          identyfikatory: { nip: "8971973376", regon: "54494280900000" },
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
  });

  it("search_companies returns padded KRS number", async () => {
    const client = await connect(okFetch(sobalabsSearch));
    const res = await client.callTool({ name: "search_companies", arguments: { query: "Soba Labs" } });
    expect(res.isError).toBeFalsy();
    const text = (res.content as Array<{ text: string }>)[0].text;
    expect(text).toContain("0001245101");
    expect(text).toContain("SOBA LABS");
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
