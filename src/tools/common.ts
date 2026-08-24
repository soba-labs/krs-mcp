import { getOdpis, padKrs, type Registry } from "../clients/krs-api.js";

export function errorText(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("KRS search API returned 403")) {
    return "KRS API request failed: the search endpoint refused the request (403) — possibly bot protection. Retry later or narrow the query.";
  }
  return `KRS API request failed: ${msg}`;
}

export async function getOdpisOrError(
  krs: string,
  rejestr: Registry,
  full: boolean,
): Promise<{ ok: false; error: string } | { ok: true; odpis: Record<string, unknown> }> {
  try {
    const odpis = await getOdpis(krs, rejestr, full);
    if (!odpis) {
      return {
        ok: false,
        error: `Not found: no entity with this KRS number (${padKrs(krs)}) in registry ${rejestr}.`,
      };
    }
    return { ok: true, odpis };
  } catch (err) {
    return { ok: false, error: errorText(err) };
  }
}

export function textResult(text: string, isError = false) {
  return { content: [{ type: "text" as const, text }], ...(isError ? { isError: true } : {}) };
}
