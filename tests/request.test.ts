import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchWithRetry } from "../src/clients/request.js";

afterEach(() => {
  vi.useRealTimers();
});

describe("fetchWithRetry", () => {
  it("retries transient HTTP failures and returns the first successful response", async () => {
    const statuses = [500, 429, 200];
    const request = vi.fn(async () => new Response("", { status: statuses.shift() }));

    const response = await fetchWithRetry(request, { retryDelaysMs: [0, 0] });

    expect(response.status).toBe(200);
    expect(request).toHaveBeenCalledTimes(3);
  });

  it("does not retry a permanent HTTP failure", async () => {
    const request = vi.fn(async () => new Response("forbidden", { status: 403 }));

    const response = await fetchWithRetry(request, { retryDelaysMs: [0, 0] });

    expect(response.status).toBe(403);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("aborts timed-out attempts and reports the timeout after retries are exhausted", async () => {
    vi.useFakeTimers();
    const request = vi.fn(
      (signal: AbortSignal) =>
        new Promise<Response>((_resolve, reject) => {
          signal.addEventListener("abort", () => {
            const error = new Error("aborted");
            error.name = "AbortError";
            reject(error);
          });
        }),
    );

    const pending = fetchWithRetry(request, { timeoutMs: 10, retryDelaysMs: [0] });
    const assertion = expect(pending).rejects.toThrow("timed out after 10ms");
    await vi.runAllTimersAsync();

    await assertion;
    expect(request).toHaveBeenCalledTimes(2);
  });
});
