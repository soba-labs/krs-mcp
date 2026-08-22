import { describe, it, expect } from "vitest";
import { Pacer } from "../src/pacer.js";

describe("Pacer", () => {
  it("waits at least minIntervalMs between consecutive waits", async () => {
    const p = new Pacer(50);
    const t0 = Date.now();
    await p.wait();
    await p.wait();
    const elapsed = Date.now() - t0;
    expect(elapsed).toBeGreaterThanOrEqual(45);
  });

  it("first call does not wait", async () => {
    const p = new Pacer(10_000);
    const t0 = Date.now();
    await p.wait();
    expect(Date.now() - t0).toBeLessThan(100);
  });
});
