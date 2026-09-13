import { Pacer } from "../pacer.js";
import { generateKrsApiKey } from "../key-generator.js";
import { fetchWithRetry } from "./request.js";

export const SEARCH_URL = "https://wyszukiwarka-krs-api.ms.gov.pl/api/wyszukiwarka/krs";

export interface SearchParams {
  name?: string;
  krs?: string;
  nip?: string;
  regon?: string;
  registries?: ("P" | "S")[];
  page?: number;
  pageSize?: number;
}

export interface SearchHit {
  krs: string;
  name: string;
  city: string;
  registry: "P" | "S";
  isOpp: boolean;
  isBankruptcy: boolean;
}

export interface SearchResult {
  total: number;
  page: number;
  hasMore: boolean;
  hits: SearchHit[];
}

const pacer = new Pacer(500);

function padKrs(numer: string): string {
  return numer.padStart(10, "0");
}

interface RawHit {
  numer?: string;
  nazwa?: string;
  miejscowosc?: string;
  typRejestru?: string;
  czyOPP?: boolean;
  czyUpadlosc?: boolean;
}

export async function searchCompanies(
  params: SearchParams,
  fetchImpl: typeof fetch = fetch,
): Promise<SearchResult> {
  if (!params.name && !params.krs && !params.nip && !params.regon) {
    throw new Error("Provide at least one search criterion: name, krs, nip or regon.");
  }

  const pageSize = Math.min(params.pageSize ?? 100, 100);
  const page = params.page ?? 1;

  const payload = {
    rejestr: params.registries ?? ["P", "S"],
    podmiot: {
      krs: params.krs ?? null,
      nip: params.nip ?? null,
      regon: params.regon ?? null,
      nazwa: params.name ?? null,
      wojewodztwo: null,
      powiat: null,
      gmina: null,
      miejscowosc: null,
      dokladnaNazwa: false,
    },
    status: {
      czyOpp: null,
      czyWpisDotyczacyPostepowaniaUpadlosciowego: null,
      dataPrzyznaniaStatutuOppOd: null,
      dataPrzyznaniaStatutuOppDo: null,
    },
    paginacja: {
      liczbaElementowNaStronie: pageSize,
      maksymalnaLiczbaWynikow: 100,
      numerStrony: page,
    },
  };

  const response = await fetchWithRetry(async (signal) => {
    await pacer.wait();
    return fetchImpl(SEARCH_URL, {
      method: "POST",
      headers: {
        apikey: generateKrsApiKey(),
        "x-api-key": "TopSecretApiKey",
        origin: "https://wyszukiwarka-krs.ms.gov.pl",
        referer: "https://wyszukiwarka-krs.ms.gov.pl/",
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
      signal,
    });
  });

  if (!response.ok) {
    throw new Error(`KRS search API returned ${response.status}`);
  }

  const body = await response.json();
  if (
    body === null ||
    typeof body !== "object" ||
    typeof (body as Record<string, unknown>).liczbaPodmiotow !== "number" ||
    !Array.isArray((body as Record<string, unknown>).listaPodmiotow)
  ) {
    throw new Error("KRS search API response contract changed");
  }

  const validatedBody = body as { liczbaPodmiotow: number; listaPodmiotow: RawHit[] };
  const hits = validatedBody.listaPodmiotow.map((raw) => ({
    krs: padKrs(String(raw.numer ?? "")),
    name: raw.nazwa ?? "",
    city: raw.miejscowosc ?? "",
    registry: raw.typRejestru === "S" ? ("S" as const) : ("P" as const),
    isOpp: Boolean(raw.czyOPP),
    isBankruptcy: Boolean(raw.czyUpadlosc),
  }));

  const total = validatedBody.liczbaPodmiotow;
  const hasMore = page * pageSize < total;
  return { total, page, hasMore, hits };
}
