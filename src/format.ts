import type { SearchResult } from "./clients/search-api.js";

// Field paths into the raw OdpisAktualny/OdpisPelny JSON. If the API shape
// drifts, fix the path here and nowhere else.
const P = {
  naglowek: ["odpis", "naglowekA"],
  dane: ["odpis", "dane"],
  dzial1: ["odpis", "dane", "dzial1"],
  dzial2: ["odpis", "dane", "dzial2"],
  dzial3: ["odpis", "dane", "dzial3"],
  danePodmiotu: ["odpis", "dane", "dzial1", "danePodmiotu"],
  identyfikatory: ["odpis", "dane", "dzial1", "danePodmiotu", "identyfikatory"],
  siedzibaIAdres: ["odpis", "dane", "dzial1", "siedzibaIAdres"],
  adres: ["odpis", "dane", "dzial1", "siedzibaIAdres", "adres"],
  kapital: ["odpis", "dane", "dzial1", "kapital"],
  reprezentacja: ["odpis", "dane", "dzial2", "reprezentacja"],
  organNadzoru: ["odpis", "dane", "dzial2", "organNadzoru"],
  prokurenci: ["odpis", "dane", "dzial2", "prokurenci"],
  przedmiotDzialalnosci: [
    "odpis",
    "dane",
    "dzial3",
    "przedmiotDzialalnosci",
  ],
} as const;

function get(obj: unknown, path: readonly string[]): unknown {
  let cur: unknown = obj;
  for (const key of path) {
    if (typeof cur !== "object" || cur === null || !(key in cur)) {
      return undefined;
    }
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

function str(obj: Record<string, unknown>, path: readonly string[]): string {
  const v = get(obj, path);
  return typeof v === "string" ? v : "";
}

function list(obj: Record<string, unknown>, path: readonly string[]): Record<string, unknown>[] {
  const v = get(obj, path);
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is Record<string, unknown> => typeof x === "object" && x !== null);
}

function money(o: unknown): string {
  if (typeof o !== "object" || o === null) return "";
  const rec = o as Record<string, unknown>;
  const wartosc = typeof rec.wartosc === "string" ? rec.wartosc : "";
  const waluta = typeof rec.waluta === "string" ? rec.waluta : "";
  return [wartosc, waluta].filter(Boolean).join(" ");
}

function personLine(p: Record<string, unknown>): string {
  const imiona = p.imiona as Record<string, unknown> | undefined;
  const nazwisko = p.nazwisko as Record<string, unknown> | undefined;
  const identyfikator = p.identyfikator as Record<string, unknown> | undefined;
  const names = imiona
    ? [imiona.imie, imiona.imieDrugie]
        .filter((v): v is string => typeof v === "string")
        .join(" ")
    : "";
  const surnameParts = nazwisko
    ? [nazwisko.nazwiskoICzlon, nazwisko.nazwiskoIICzlon]
        .filter((v): v is string => typeof v === "string")
        .join("-")
    : "";
  const pesel =
    identyfikator && typeof identyfikator.pesel === "string" ? identyfikator.pesel : "";
  const parts = [names, surnameParts].filter(Boolean).join(" ");
  return pesel ? `${parts} (PESEL ${pesel})` : parts;
}

function pkdCode(entry: Record<string, unknown>): string {
  const parts = ["kodDzial", "kodKlasa", "kodPodklasa"]
    .map((k) => entry[k])
    .filter((v): v is string => typeof v === "string");
  return parts.join(".");
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// OdpisPelny wraps every registry field in a change-history array of
// { <fieldName>: value, nrWpisuWprow } entries; Aktualny stores plain values.
// normalize() unwraps those history arrays to the current entry (highest
// numeric nrWpisuWprow) so both shapes share one rendering path. Aktualny
// input passes through unchanged.
const META_KEYS = new Set(["nrWpisuWprow", "nrWpisuWykr"]);

function entryRank(e: Record<string, unknown>): number {
  const n = Number(e.nrWpisuWprow);
  return Number.isFinite(n) ? n : -1;
}

function normalize(value: unknown, key?: string, collapseItems = false): unknown {
  if (Array.isArray(value)) {
    const items = value.map((v) => normalize(v, undefined, collapseItems));
    const isHistory =
      items.length > 0 &&
      items.every(isPlainObject) &&
      items.some((it) => Object.keys(it).some((k) => META_KEYS.has(k)));
    let result: unknown;
    if (!isHistory) {
      result = items;
    } else {
      let best = items[0];
      for (const it of items) {
        if (entryRank(it) > entryRank(best)) best = it;
      }
      const stripped: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(best)) {
        if (!META_KEYS.has(k)) stripped[k] = v;
      }
      const keys = Object.keys(stripped);
      // { nazwa: [...], nrWpisuWprow } under field "nazwa" -> plain value;
      // keep multi-key or differently-keyed objects (e.g. identyfikator -> pesel)
      if (keys.length === 1 && key !== undefined && keys[0] === key) {
        return stripped[keys[0]];
      }
      result = keys.length === 0 ? undefined : stripped;
    }
    if (collapseItems && Array.isArray(result)) {
      // Pelny wraps list entries too (PKD items sit under a "pozycja" key);
      // collapse single-key object wrappers on array items.
      result = result.map((it) => {
        if (!isPlainObject(it)) return it;
        const ks = Object.keys(it);
        if (ks.length === 1 && isPlainObject(it[ks[0]])) return it[ks[0]];
        return it;
      });
    }
    return result;
  }
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = normalize(v, k, collapseItems);
    }
    return out;
  }
  return value;
}

function isPelny(odpisRaw: Record<string, unknown>): boolean {
  const o = odpisRaw.odpis;
  return isPlainObject(o) && !("naglowekA" in o) && "naglowekP" in o;
}

// Pelny keeps some container fields (reprezentacja, kapital*) as arrays where
// aktualny uses an object; take the last (most recent) element.
function asRecord(v: unknown): Record<string, unknown> | undefined {
  if (isPlainObject(v)) return v;
  if (Array.isArray(v)) {
    const last = v[v.length - 1];
    return isPlainObject(last) ? last : undefined;
  }
  return undefined;
}

export function extractBoard(odpisRaw: Record<string, unknown>): string {
  const odpis = normalize(odpisRaw, undefined, isPelny(odpisRaw)) as Record<string, unknown>;
  const lines: string[] = [];

  const rep = asRecord(get(odpis, P.reprezentacja));
  if (rep) {
    lines.push(`## Representation / Board`);
    if (typeof rep.nazwaOrganu === "string") lines.push(`Board: ${rep.nazwaOrganu}`);
    if (typeof rep.sposobReprezentacji === "string") {
      lines.push(`Representation: ${rep.sposobReprezentacji}`);
    }
    for (const member of list(rep, ["sklad"])) {
      const funkcja = typeof member.funkcjaWOrganie === "string" ? member.funkcjaWOrganie : "";
      lines.push(`- ${funkcja ? `${funkcja}: ` : ""}${personLine(member)}`);
    }
  }

  const nadzor = list(odpis, P.organNadzoru);
  if (nadzor.length > 0) {
    lines.push("", `## Supervisory bodies`);
    for (const organ of nadzor) {
      if (typeof organ.nazwa === "string") lines.push(`Supervisory board: ${organ.nazwa}`);
      for (const member of list(organ, ["sklad"])) {
        const funkcja = typeof member.funkcjaWOrganie === "string" ? member.funkcjaWOrganie : "";
        lines.push(`- ${funkcja ? `${funkcja}: ` : ""}${personLine(member)}`);
      }
    }
  }

  if (lines.length === 0) return "No board information found.";
  return lines.join("\n");
}

export function formatSearchResults(r: SearchResult, queryDescription: string): string {
  const lines: string[] = [
    `${r.total} result(s) for "${queryDescription}" — page ${r.page}`,
  ];
  for (const hit of r.hits) {
    const flags =
      (hit.isOpp ? " [OPP]" : "") + (hit.isBankruptcy ? " [BANKRUPTCY]" : "");
    lines.push(`${hit.krs.padStart(10, "0")} | ${hit.name} | ${hit.city} | ${hit.registry}${flags}`);
  }
  if (r.total > r.hits.length) {
    lines.push(
      `(showing ${r.hits.length} of ${r.total} results; use page=${r.page + 1} for more)`,
    );
  }
  return lines.join("\n");
}

export function formatOdpis(
  odpisRaw: Record<string, unknown>,
  kind: "aktualny" | "pelny",
): string {
  const odpis = normalize(odpisRaw, undefined, isPelny(odpisRaw)) as Record<string, unknown>;
  const lines: string[] = [];

  // Header key is naglowekA in aktualny, naglowekP in pelny.
  const hdrStr = (leaf: string): string => {
    const a = str(odpis, ["odpis", "naglowekA", leaf]);
    return a || str(odpis, ["odpis", "naglowekP", leaf]);
  };

  const rodzaj = str(odpis, ["odpis", "rodzaj"]);
  const titleKind = rodzaj || (kind === "pelny" ? "Pełny" : "Aktualny");
  lines.push(`# ODPIS ${titleKind.toUpperCase()}`);

  const stanZDnia = hdrStr("stanZDnia");
  if (stanZDnia) lines.push(`As of: ${stanZDnia}`);

  // Identity
  const nazwa = str(odpis, [...P.danePodmiotu, "nazwa"]);
  const rawKrs = hdrStr("numerKRS");
  const krs = rawKrs ? rawKrs.padStart(10, "0") : "";
  const nip = str(odpis, [...P.identyfikatory, "nip"]);
  const regon = str(odpis, [...P.identyfikatory, "regon"]);
  const formaPrawna = str(odpis, [...P.danePodmiotu, "formaPrawna"]);

  // Address
  const krajSiedziby = str(odpis, [...P.siedzibaIAdres, "siedziba", "kraj"]);
  const adresParts = ["ulica", "nrDomu", "nrLokalu"]
    .map((k) => str(odpis, [...P.adres, k]))
    .filter(Boolean)
    .join(" ");
  const miejscowosc = str(odpis, [...P.adres, "miejscowosc"]);
  const kodPocztowy = str(odpis, [...P.adres, "kodPocztowy"]);
  const poczta = str(odpis, [...P.adres, "poczta"]);
  const addressBits = [adresParts, kodPocztowy && poczta ? `${kodPocztowy} ${poczta}` : miejscowosc]
    .filter(Boolean)
    .join(", ");

  if (nazwa || krs || nip || regon || formaPrawna || addressBits) {
    lines.push("", "## Basic information");
    if (nazwa) lines.push(`Name: ${nazwa}`);
    if (krs) lines.push(`KRS: ${krs}`);
    if (nip) lines.push(`NIP: ${nip}`);
    if (regon) lines.push(`REGON: ${regon}`);
    if (formaPrawna) lines.push(`Legal form: ${formaPrawna}`);
    if (addressBits) {
      const krajBit = krajSiedziby ? `, ${krajSiedziby}` : "";
      lines.push(`Address: ${addressBits}${krajBit}`);
    }
  }

  // Board
  lines.push("", extractBoard(odpis));

  // Prokurenci
  const prokurenci = list(odpis, P.prokurenci);
  if (prokurenci.length > 0) {
    lines.push("", `## Proxies`);
    for (const prokurent of prokurenci) {
      const rodzajProkury =
        typeof prokurent.rodzajProkury === "string" ? ` (${prokurent.rodzajProkury})` : "";
      lines.push(`- proxy: ${personLine(prokurent)}${rodzajProkury}`);
    }
  }

  // Share capital
  const kapitalRaw = asRecord(get(odpis, P.kapital));
  if (kapitalRaw !== undefined) {
    const kapital = kapitalRaw;
    const kwotaZakladowy = money(kapital.wysokoscKapitaluZakladowego);
    const wplacony = money(kapital.czescKapitaluWplaconegoPokrytego);
    const jednaAkcja = money(kapital.wartoscJednejAkcji);
    const liczbaAkcji =
      typeof kapital.lacznaLiczbaAkcjiUdzialow === "string"
        ? kapital.lacznaLiczbaAkcjiUdzialow
        : "";
    if (kwotaZakladowy || liczbaAkcji) {
      lines.push("", `## Share capital`);
      if (kwotaZakladowy) lines.push(`Share capital: ${kwotaZakladowy}`);
      if (wplacony) lines.push(`Paid-in capital: ${wplacony}`);
      if (liczbaAkcji) lines.push(`Number of shares/units: ${liczbaAkcji}`);
      if (jednaAkcja) lines.push(`Nominal value per share: ${jednaAkcja}`);
    }
  }

  // PKD
  const pkdRaw = get(odpis, P.przedmiotDzialalnosci);
  if (typeof pkdRaw === "object" && pkdRaw !== null) {
    const pkd = pkdRaw as Record<string, unknown>;
    const przewazajace = list(pkd, ["przedmiotPrzewazajacejDzialalnosci"]);
    const pozostala = list(pkd, ["przedmiotPozostalejDzialalnosci"]);
    if (przewazajace.length + pozostala.length > 0) {
      lines.push("", `## PKD`);
      const render = (entry: Record<string, unknown>): string => {
        const code = pkdCode(entry);
        const opis = typeof entry.opis === "string" ? entry.opis : "";
        return code ? `${code} — ${opis}` : opis;
      };
      for (const entry of przewazajace) {
        lines.push(`- ${render(entry)} (primary)`);
      }
      for (const entry of pozostala) {
        lines.push(`- ${render(entry)}`);
      }
    }
  }

  return lines.join("\n");
}
