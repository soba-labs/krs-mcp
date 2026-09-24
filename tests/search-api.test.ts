import { describe, it, expect, vi } from "vitest";
import { searchCompanies } from "../src/clients/search-api.js";

const sampleResponse = {
  liczbaPodmiotow: 17,
  listaPodmiotow: [
    {
      numer: "1245101",
      nazwa: "SOBA LABS PROSTA SPÓŁKA AKCYJNA",
      miejscowosc: "WROCŁAW",
      typRejestru: "P",
      czyOPP: false,
      czyUpadlosc: false,
      dataPrzyznaniaStatutuOPP: null,
    },
  ],
};

function okFetch(body: unknown) {
  return vi.fn(async (_url: unknown, _init?: unknown) => new Response(JSON.stringify(body), { status: 200 }));
}

describe("searchCompanies", () => {
  it("posts to the search endpoint with generated apikey headers", async () => {
    const f = okFetch(sampleResponse);
    await searchCompanies({ name: "Soba Labs" }, f as unknown as typeof fetch);
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://wyszukiwarka-krs-api.ms.gov.pl/api/wyszukiwarka/krs");
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers.apikey).toMatch(/^\d{512}$/);
    expect(headers["x-api-key"]).toBe("TopSecretApiKey");
    expect(headers.origin).toBe("https://wyszukiwarka-krs.ms.gov.pl");
    expect(headers.referer).toBe("https://wyszukiwarka-krs.ms.gov.pl/");
  });

  it("maps response fields to padded SearchHit", async () => {
    const r = await searchCompanies(
      { name: "Soba Labs" },
      okFetch(sampleResponse) as unknown as typeof fetch,
    );
    expect(r.total).toBe(17);
    expect(r.hasMore).toBe(false);
    expect(r.hits[0]).toEqual({
      krs: "0001245101",
      name: "SOBA LABS PROSTA SPÓŁKA AKCYJNA",
      city: "WROCŁAW",
      registry: "P",
      isOpp: false,
      isBankruptcy: false,
    });
  });

  it("reports whether another page exists", async () => {
    const response = { ...sampleResponse, liczbaPodmiotow: 150 };
    const middle = await searchCompanies(
      { name: "Soba", page: 2, pageSize: 50 },
      okFetch(response) as unknown as typeof fetch,
    );
    const final = await searchCompanies(
      { name: "Soba", page: 3, pageSize: 50 },
      okFetch(response) as unknown as typeof fetch,
    );
    expect(middle.hasMore).toBe(true);
    expect(final.hasMore).toBe(false);
  });

  it("builds payload from params with defaults", async () => {
    const f = okFetch(sampleResponse);
    await searchCompanies(
      { name: "Soba", registries: ["P"], page: 2, pageSize: 50 },
      f as unknown as typeof fetch,
    );
    const body = JSON.parse(
      ((f.mock.calls[0] as unknown[])[1] as RequestInit).body as string,
    );
    expect(body.podmiot.nazwa).toBe("Soba");
    expect(body.rejestr).toEqual(["P"]);
    expect(body.paginacja).toEqual({
      liczbaElementowNaStronie: 50,
      maksymalnaLiczbaWynikow: 100,
      numerStrony: 2,
    });
  });

  it("throws structured error on non-200", async () => {
    const f = vi.fn(async (_url: unknown, _init?: unknown) => new Response("blocked", { status: 403 }));
    await expect(
      searchCompanies({ name: "x" }, f as unknown as typeof fetch),
    ).rejects.toThrow(/search API returned 403/);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("retries a transient search failure", async () => {
    const statuses = [503, 200];
    const f = vi.fn(async () =>
      new Response(JSON.stringify(sampleResponse), { status: statuses.shift() }),
    );

    await expect(
      searchCompanies({ name: "Soba Labs" }, f as unknown as typeof fetch),
    ).resolves.toMatchObject({ total: 17 });
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("rejects a changed response contract", async () => {
    await expect(
      searchCompanies(
        { name: "Soba Labs" },
        okFetch({ unexpected: true }) as unknown as typeof fetch,
      ),
    ).rejects.toThrow(/response contract/i);
  });

  it("requires at least one search criterion", async () => {
    await expect(
      searchCompanies({}, okFetch(sampleResponse) as unknown as typeof fetch),
    ).rejects.toThrow(/at least one/);
  });
});
