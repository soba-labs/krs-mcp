export interface RetryOptions {
  timeoutMs?: number;
  retryDelaysMs?: readonly number[];
}

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_RETRY_DELAYS_MS = [250, 750] as const;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

export async function fetchWithRetry(
  request: (signal: AbortSignal) => Promise<Response>,
  {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retryDelaysMs = DEFAULT_RETRY_DELAYS_MS,
  }: RetryOptions = {},
): Promise<Response> {
  for (let attempt = 0; attempt <= retryDelaysMs.length; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await request(controller.signal);
      if (!isTransientStatus(response.status) || attempt === retryDelaysMs.length) {
        return response;
      }
    } catch (error) {
      if (attempt === retryDelaysMs.length) {
        if (error instanceof Error && error.name === "AbortError") {
          throw new Error(`KRS request timed out after ${timeoutMs}ms`, { cause: error });
        }
        throw error;
      }
    } finally {
      clearTimeout(timer);
    }

    await delay(retryDelaysMs[attempt]);
  }

  throw new Error("KRS request retry loop exhausted unexpectedly");
}
