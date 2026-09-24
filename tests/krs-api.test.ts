import { describe, it, expect, vi } from "vitest";
import { getOdpis, padKrs } from "../src/clients/krs-api.js";

describe("padKrs", () => {
  it("pads to 10 digits", () => {
    expect(padKrs("1245101")).toBe("0001245101");
    expect(padKrs("0001245101")).toBe("0001245101");
  });
});

describe("getOdpis", () => {
  it("hits OdpisAktualny with padded krs and rejestr param", async () => {
    const f = vi.fn(async (_url: unknown, _init?: unknown) => new Response(JSON.stringify({ podmiot: {} }), { status: 200 }));
    await getOdpis("1245101", "P", false, f as unknown as typeof fetch);
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/krs/OdpisAktualny/0001245101");
    expect(url).toContain("rejestr=P");
    expect((init.headers as Record<string, string>)["user-agent"]).toMatch(/^krs-mcp\//);
  });

  it("hits OdpisPelny when full=true", async () => {
    const f = vi.fn(async (_url: unknown, _init?: unknown) => new Response(JSON.stringify({}), { status: 200 }));
    await getOdpis("0001245101", "S", true, f as unknown as typeof fetch);
    expect(f.mock.calls[0][0]).toContain("/api/krs/OdpisPelny/");
    expect(f.mock.calls[0][0]).toContain("rejestr=S");
  });

  it("returns null on 404", async () => {
    const f = vi.fn(async (_url: unknown, _init?: unknown) => new Response("not found", { status: 404 }));
    await expect(getOdpis("9999999999", undefined, false, f as unknown as typeof fetch)).resolves.toBeNull();
  });

  it("retries a transient API failure", async () => {
    const statuses = [503, 200];
    const f = vi.fn(async () =>
      new Response(JSON.stringify({ podmiot: {} }), { status: statuses.shift() }),
    );

    await expect(
      getOdpis("0001245101", undefined, false, f as unknown as typeof fetch),
    ).resolves.toEqual({ podmiot: {} });
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("throws with status after transient retries are exhausted", async () => {
    const f = vi.fn(async () => new Response("boom", { status: 500 }));

    await expect(
      getOdpis("0001245101", undefined, false, f as unknown as typeof fetch),
    ).rejects.toThrow(/500/);
    expect(f).toHaveBeenCalledTimes(3);
  });

  it("rejects a changed response contract", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify(["unexpected"]), { status: 200 }));

    await expect(
      getOdpis("0001245101", undefined, false, f as unknown as typeof fetch),
    ).rejects.toThrow(/response contract/i);
  });

  it("validates krs input", async () => {
    await expect(getOdpis("abc")).rejects.toThrow(/krs/i);
  });
});
