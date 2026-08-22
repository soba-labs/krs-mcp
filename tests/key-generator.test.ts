import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { generateKrsApiKey } from "../src/key-generator.js";

const vectors = JSON.parse(readFileSync(new URL("./fixtures/key-vectors.json", import.meta.url), "utf8"));

function makeCyclic(seq: number[]) {
  let i = 0;
  return () => seq[i++ % seq.length];
}

describe("generateKrsApiKey", () => {
  it("matches reference implementation output (cyclic sequence)", () => {
    const v = vectors.cyclicSeq;
    const key = generateKrsApiKey({
      krs: v.krs,
      timestamp: new Date(v.timestamp),
      random: makeCyclic([0.1, 0.55, 0.23, 0.87, 0.41, 0.09, 0.66, 0.32]),
    });
    expect(key).toBe(v.key);
  });

  it("matches reference implementation output (constant 0.5)", () => {
    const v = vectors.constantHalf;
    const key = generateKrsApiKey({ krs: v.krs, timestamp: new Date(v.timestamp), random: () => 0.5 });
    expect(key).toBe(v.key);
  });

  it("always returns exactly 512 decimal digits", () => {
    for (let n = 0; n < 20; n++) {
      const key = generateKrsApiKey();
      expect(key).toMatch(/^\d{512}$/);
    }
  });

  it("rejects non-numeric or too-long krs", () => {
    expect(() => generateKrsApiKey({ krs: "12345678901" })).toThrow();
    expect(() => generateKrsApiKey({ krs: "12a" })).toThrow();
  });

  it("pads short krs with leading zeros", () => {
    const a = generateKrsApiKey({ krs: "1245101", timestamp: new Date(0), random: () => 0.5 });
    const b = generateKrsApiKey({ krs: "0001245101", timestamp: new Date(0), random: () => 0.5 });
    expect(a).toBe(b);
  });
});
