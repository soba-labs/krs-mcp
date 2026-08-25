import { Pacer } from "../pacer.js";

const API_BASE = "https://api-krs.ms.gov.pl/api/krs";

export type Registry = "P" | "S";

export function padKrs(krs: string): string {
  return krs.padStart(10, "0");
}

export function getOdpisUrl(krs: string, registry: Registry, full: boolean): string {
  const endpoint = full ? "OdpisPelny" : "OdpisAktualny";
  return `${API_BASE}/${endpoint}/${padKrs(krs)}?rejestr=${registry}&format=json`;
}

const pacer = new Pacer(500);

export async function getOdpis(
  krs: string,
  registry: Registry = "P",
  full = false,
  fetchImpl: typeof fetch = fetch,
): Promise<Record<string, unknown> | null> {
  if (!/^\d{1,10}$/.test(krs)) {
    throw new Error(`Invalid krs number: "${krs}" — expected 1 to 10 digits.`);
  }

  const url = getOdpisUrl(krs, registry, full);

  await pacer.wait();

  const response = await fetchImpl(url, {
    headers: {
      "user-agent": "krs-mcp/0.1.0",
      accept: "application/json",
    },
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`KRS odpisy API returned ${response.status}`);
  }

  return (await response.json()) as Record<string, unknown>;
}
