import { getOdpis, getOdpisUrl, padKrs, type Registry } from "../clients/krs-api.js";

export interface Provenance {
  source: string;
  processing: string;
  retrievedAt?: string;
}

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
): Promise<
  { ok: false; error: string } | { ok: true; odpis: Record<string, unknown>; source: string }
> {
  try {
    const odpis = await getOdpis(krs, rejestr, full);
    if (!odpis) {
      return {
        ok: false,
        error: `Not found: no entity with this KRS number (${padKrs(krs)}) in registry ${rejestr}.`,
      };
    }
    return { ok: true, odpis, source: getOdpisUrl(krs, rejestr, full) };
  } catch (err) {
    return { ok: false, error: errorText(err) };
  }
}

export function textResult(text: string, isError = false, provenance?: Provenance) {
  const content = [{ type: "text" as const, text }];
  if (provenance) {
    content.push({
      type: "text" as const,
      text: JSON.stringify({
        source: provenance.source,
        sourceProducedAt: null,
        retrievedAt: provenance.retrievedAt ?? new Date().toISOString(),
        processing: provenance.processing,
      }),
    });
  }
  return { content, ...(isError ? { isError: true } : {}) };
}
