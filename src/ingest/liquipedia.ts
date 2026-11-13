/**
 * Team logo lookup on Liquipedia's VALORANT wiki, used by `scripts/import-logos.mjs` (run locally, not in the
 * Worker). Liquipedia has separate light-mode and dark-mode icons per team.
 *
 * API terms (https://liquipedia.net/api-terms-of-use): custom User-Agent with contact info, gzip, at most one
 * request every 2 seconds (all HTTP requests, including image downloads), one IP address, cache results as long
 * as possible. The client below enforces the gap and takes a cache so re-runs don't repeat requests.
 *
 * Only erasable TypeScript syntax here: Node runs this file directly (type stripping) from the script.
 */

const API = "https://liquipedia.net/valorant/api.php";
const MIN_GAP_MS = 2100;

export class LiquipediaRateLimited extends Error {}

export interface LogoFiles {
  title: string;   // Liquipedia page the logos came from
  light: string;   // file name for light mode
  dark: string;    // file name for dark mode (same as light for allmode logos)
}

interface FileInfo { name: string; timestamp: string }

/** Lower case, no accents ("Leviatán" = "leviatan"), single spaces, no "File:" prefix. */
const norm = (s: string) =>
  s.replace(/^File:/i, "").normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/_/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
const MODE = /^(.*?)[ _](lightmode|darkmode|allmode)\.(png|svg)$/i;
const SKIP = /\b(full|lp april fools|april fools|std|icon|banner|teamcard)\b/i;

/** The name part of a logo file: "Futbolist 2021 lightmode.png" → "Futbolist" (no year, "full" or mode). */
export function fileStem(file: string): string | null {
  const m = file.replace(/^File:/i, "").match(MODE);
  if (!m) return null;
  return m[1].replace(/[ _](full|\d{4})\b/gi, "").replace(/_/g, " ").trim() || null;
}

/** `image` / `imagedark` from a team page's {{Infobox team}}. */
export function infoboxImages(wikitext: string): { image?: string; imagedark?: string } {
  const get = (k: string) => wikitext.match(new RegExp(`^\\s*\\|\\s*${k}\\s*=\\s*([^\\n|}]+)`, "m"))?.[1]?.trim() || undefined;
  return { image: get("image"), imagedark: get("imagedark") };
}

/** The team's own "<name>[ variant] <mode>.png" files among all files on its page (pages also show opponents). */
export function ownFiles(names: string[], files: string[]): string[] {
  const prefixes = [...new Set(names.map(norm))].filter(Boolean);
  return files.filter((f) => {
    const m = f.replace(/^File:/i, "").match(MODE);
    if (!m) return false;
    const stem = norm(m[1]);
    return prefixes.some((p) => (stem === p || stem.startsWith(p + " ")) && !SKIP.test(stem.slice(p.length)));
  });
}

/**
 * Pick the current icon set. Files are grouped by everything before the mode; the group with the most recent
 * upload wins. Light = lightmode or allmode, dark = darkmode or allmode.
 */
export function pickLogoFiles(title: string, files: FileInfo[], aliases: string[] = []): LogoFiles | null {
  const own = new Set(ownFiles([title, ...aliases], files.map((f) => f.name)));
  const groups = new Map<string, { light?: string; dark?: string; all?: string; latest: string }>();
  for (const f of files) {
    if (!own.has(f.name)) continue;
    const name = f.name.replace(/^File:/i, "");
    const m = name.match(MODE)!;
    const stem = norm(m[1]);
    const g = groups.get(stem) ?? { latest: "" };
    const mode = m[2].toLowerCase();
    if (mode === "lightmode") g.light = name; else if (mode === "darkmode") g.dark = name; else g.all = name;
    if (f.timestamp > g.latest) g.latest = f.timestamp;
    groups.set(stem, g);
  }
  const best = [...groups.values()]
    .filter((g) => g.all || (g.light && g.dark))
    .sort((a, b) => b.latest.localeCompare(a.latest))[0];
  if (!best) return null;
  return { title, light: best.light ?? best.all!, dark: best.dark ?? best.all! };
}

/** Names to try for a GRID team name: as is, then without " (1)" style suffixes. */
export function candidateTitles(gridName: string): string[] {
  const a = gridName.trim();
  const b = a.replace(/\s*\(\d+\)$/, "").trim();
  return [...new Set([a, b])].filter(Boolean);
}

const GENERIC_WORDS = /\b(e-?sports?|gaming|club|team)\b/gi;

/**
 * Page titles to try for a GRID team name, in order: as is, without " (1)", without generic words
 * ("TYLOO GAMING" → "TYLOO"), and title-cased when written in capitals ("MAYHEM" → "Mayhem").
 * Variants after the first two must turn out to be team pages.
 */
export function titleVariants(gridName: string): string[] {
  const [a, b = a] = candidateTitles(gridName);
  const stripped = b.replace(GENERIC_WORDS, "").replace(/\s+/g, " ").trim();
  const titled = (x: string) => (x === x.toUpperCase() ? x.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase()) : x);
  return [...new Set([a, b, stripped, titled(b), titled(stripped)])].filter(Boolean);
}

export interface Cache { get(key: string): unknown; set(key: string, value: unknown): void }

export interface Page { title: string; files: string[]; wikitext: string }

type QueryPage = { title: string; missing?: string; images?: { title: string }[]; revisions?: { slots?: { main?: { "*"?: string } } }[] };
type QueryResult = {
  continue?: Record<string, string>;
  query?: { normalized?: { from: string; to: string }[]; redirects?: { from: string; to: string }[]; pages?: Record<string, QueryPage> };
};

export class LiquipediaClient {
  private last = 0;
  private readonly contact: string;
  private readonly cache: Cache | null;
  requests = 0;

  constructor(contact: string, cache: Cache | null = null) {
    this.contact = contact;
    this.cache = cache;
  }

  private async throttled(url: string): Promise<Response> {
    const wait = this.last + MIN_GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    this.last = Date.now();
    this.requests++;
    const res = await fetch(url, { headers: { "user-agent": `Roundwise/1.0 (${this.contact})`, "accept-encoding": "gzip" } });
    if (res.status === 429) throw new LiquipediaRateLimited(`Liquipedia 429 for ${url}`);
    if (!res.ok) throw new Error(`Liquipedia HTTP ${res.status} for ${url}`);
    return res;
  }

  private async get<T>(params: Record<string, string>): Promise<T> {
    const url = `${API}?${new URLSearchParams({ format: "json", ...params })}`;
    const hit = this.cache?.get(url);
    if (hit !== undefined) return hit as T;
    const json = (await (await this.throttled(url)).json()) as T;
    this.cache?.set(url, json);
    return json;
  }

  /** Download one image (thumbnail URL from `fileInfo`). Not cached here; the caller stores the result. */
  async download(url: string): Promise<ArrayBuffer> {
    return (await this.throttled(url)).arrayBuffer();
  }

  /**
   * Pages for up to 10 titles in one request (follows redirects): title, files used on the page, wikitext.
   * Returns a map from each requested title to its page, or null when there is no page.
   */
  async pages(titles: string[]): Promise<Map<string, Page | null>> {
    const pages = new Map<string, Page>();
    const alias = new Map<string, string>();
    let cont: Record<string, string> = {};
    do {
      const j = await this.get<QueryResult>({
        action: "query", titles: titles.join("|"), redirects: "1", prop: "images|revisions", rvprop: "content", rvslots: "main",
        imlimit: "max", ...cont,
      });
      for (const n of [...(j.query?.normalized ?? []), ...(j.query?.redirects ?? [])]) alias.set(n.from, n.to);
      for (const p of Object.values(j.query?.pages ?? {})) {
        if (p.missing !== undefined) continue;
        const page = pages.get(p.title) ?? { title: p.title, files: [], wikitext: "" };
        page.files.push(...(p.images ?? []).map((i) => i.title.replace(/^File:/, "")));
        page.wikitext ||= p.revisions?.[0]?.slots?.main?.["*"] ?? "";
        pages.set(p.title, page);
      }
      cont = j.continue ?? {};
    } while (Object.keys(cont).length);
    const out = new Map<string, Page | null>();
    for (const t of titles) {
      let k = t;
      for (let i = 0; i < 3 && alias.has(k); i++) k = alias.get(k)!;
      out.set(t, pages.get(k) ?? null);
    }
    return out;
  }

  /** Best page title for a name via Liquipedia's title search, or null. */
  async search(name: string): Promise<string | null> {
    const j = await this.get<[string, string[]]>({ action: "opensearch", search: name, limit: "1", namespace: "0" });
    return j[1]?.[0] ?? null;
  }

  /** Full-text search: page titles, best first. */
  async searchText(name: string, limit = 5): Promise<string[]> {
    type R = { query?: { search?: { title: string }[] } };
    const j = await this.get<R>({ action: "query", list: "search", srsearch: name, srnamespace: "0", srlimit: String(limit) });
    return (j.query?.search ?? []).map((s) => s.title);
  }

  /** Upload timestamp and a thumbnail URL (fits size × size) per file, 50 files per request. */
  async fileInfo(files: string[], size: number): Promise<Map<string, { timestamp: string; url: string }>> {
    const out = new Map<string, { timestamp: string; url: string }>();
    const uniq = [...new Set(files.map((f) => f.replace(/^File:/, "")))];
    for (let i = 0; i < uniq.length; i += 50) {
      type R = { query?: { normalized?: { from: string; to: string }[]; pages?: Record<string, { title: string; imageinfo?: { timestamp: string; thumburl?: string; url: string }[] }> } };
      const j = await this.get<R>({
        action: "query", titles: uniq.slice(i, i + 50).map((f) => `File:${f}`).join("|"),
        prop: "imageinfo", iiprop: "timestamp|url", iiurlwidth: String(size), iiurlheight: String(size),
      });
      for (const p of Object.values(j.query?.pages ?? {})) {
        const ii = p.imageinfo?.[0];
        if (ii) out.set(norm(p.title), { timestamp: ii.timestamp, url: ii.thumburl ?? ii.url });
      }
    }
    return out;
  }
}

/** Key for `fileInfo` results. */
export const fileKey = norm;

const GENERIC = new Set(["esports", "esport", "e-sports", "gaming", "team", "club", "the", "gg", "of"]);
const tokens = (s: string) => new Set(norm(s).split(/[^a-z0-9.]+/).filter((t) => t && !GENERIC.has(t)));

/**
 * How well a search-result page title matches a GRID team name: shared distinctive words (sponsors and words like
 * "Esports" don't count), or 0. "Dplus" for "Dplus KIA" = 1, "Raze" for "MAYHEM" = 0.
 */
export function titleMatch(gridName: string, title: string): number {
  const a = tokens(gridName), b = tokens(title);
  let n = 0;
  for (const t of b) if (a.has(t)) n++;
  // Every distinctive word of the title must appear in the name ("DRX Academy" fits "KIWOOM DRX Academy").
  return n > 0 && n === b.size ? n : 0;
}

export const isTeamPage = (wikitext: string) => /\{\{\s*Infobox team\b/i.test(wikitext);

/** Usual icon file names to try for a team, from its page title and infobox logo: "<name>[ <year>] <mode>.png". */
export function guessIconFiles(title: string, infobox: { image?: string; imagedark?: string }): string[] {
  const bases = new Set<string>([title]);
  for (const f of [infobox.image, infobox.imagedark]) {
    const m = f?.replace(/^File:/i, "").match(MODE);
    if (!m) continue;
    const withYear = m[1].replace(/[ _]full\b/gi, "").replace(/_/g, " ").trim();
    bases.add(withYear);
    const stem = fileStem(f!);
    if (stem) bases.add(stem);
  }
  return [...bases].flatMap((b) => ["lightmode", "darkmode", "allmode"].map((m) => `${b} ${m}.png`));
}
