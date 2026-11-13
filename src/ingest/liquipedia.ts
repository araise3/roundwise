/**
 * Team logo lookup on Liquipedia (VALORANT wiki), used before GRID's single logo because Liquipedia has
 * separate light-mode and dark-mode icons. Follows Liquipedia's API terms: a User-Agent with contact info,
 * gzip, and at most one request every 2 seconds (callers must use the shared `LiquipediaClient`).
 * Files are downloaded once at import and served from our own Worker, never hotlinked.
 */

const API = "https://liquipedia.net/valorant/api.php";
const MIN_GAP_MS = 2100;

export class LiquipediaRateLimited extends Error {}

export interface LogoFiles {
  title: string;     // Liquipedia page the logos came from
  light: string;     // file name (without "File:") for light mode
  dark: string;      // file name for dark mode (same as light for allmode logos)
}

interface FileInfo { name: string; timestamp: string }

const norm = (s: string) => s.replace(/_/g, " ").replace(/\s+/g, " ").trim().toLowerCase();

const MODE = /^(.*?)[ _](lightmode|darkmode|allmode)\.(png|svg)$/i;
const SKIP = /\b(full|lp april fools|april fools|std|icon|banner|teamcard)\b/i;

/**
 * Pick the current icon set from the files on a team page. Candidates are "<Team>[ <variant>] <mode>.png" files
 * (not full wordmarks or joke logos); files are grouped by everything before the mode, and the group with the
 * most recent upload wins. Light = lightmode or allmode, dark = darkmode or allmode.
 */
/** The team's own "<name>[ variant] <mode>.png" files among all files on its page (pages also show opponents). */
export function ownFiles(names: string[], files: string[]): string[] {
  const prefixes = [...new Set(names.map(norm))].filter(Boolean);
  return files.filter((f) => {
    const m = f.replace(/^File:/, "").match(MODE);
    if (!m) return false;
    const stem = norm(m[1]);
    return prefixes.some((p) => (stem === p || stem.startsWith(p + " ")) && !SKIP.test(stem.slice(p.length)));
  });
}

export function pickLogoFiles(title: string, files: FileInfo[], aliases: string[] = []): LogoFiles | null {
  const own = new Set(ownFiles([title, ...aliases], files.map((f) => f.name)));
  const groups = new Map<string, { light?: string; dark?: string; all?: string; latest: string }>();
  for (const f of files) {
    if (!own.has(f.name)) continue;
    const name = f.name.replace(/^File:/, "");
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

export class LiquipediaClient {
  private last = 0;
  private readonly contact: string;
  constructor(contact: string) { this.contact = contact; }

  /** Throttled request to liquipedia.net (API calls and image downloads share the 2 s gap). */
  private async request(url: string): Promise<Response> {
    const wait = this.last + MIN_GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    this.last = Date.now();
    const res = await fetch(url, {
      headers: { "user-agent": `Roundwise/1.0 (${this.contact})`, "accept-encoding": "gzip" },
    });
    if (res.status === 429) throw new LiquipediaRateLimited("Liquipedia 429");
    if (!res.ok) throw new Error(`Liquipedia HTTP ${res.status} for ${url}`);
    return res;
  }

  private async get<T>(params: Record<string, string>): Promise<T> {
    return (await this.request(`${API}?${new URLSearchParams({ format: "json", ...params })}`)).json() as Promise<T>;
  }

  /** Download one image file (a thumbnail URL from `findLogo`). */
  async download(url: string): Promise<ArrayBuffer> {
    return (await this.request(url)).arrayBuffer();
  }

  /** Page title (after redirects) and the logo-like files it uses, or null if no page exists. */
  private async pageFiles(title: string): Promise<{ title: string; files: string[] } | null> {
    type R = { query?: { pages?: Record<string, { title: string; missing?: string; images?: { title: string }[] }> } };
    const j = await this.get<R>({ action: "query", titles: title, redirects: "1", prop: "images", imlimit: "max" });
    const page = Object.values(j.query?.pages ?? {})[0];
    if (!page || page.missing !== undefined) return null;
    return { title: page.title, files: (page.images ?? []).map((i) => i.title).filter((t) => MODE.test(t.replace(/^File:/, ""))) };
  }

  private async search(name: string): Promise<string | null> {
    const j = await this.get<[string, string[]]>({ action: "opensearch", search: name, limit: "1", namespace: "0" });
    return j[1]?.[0] ?? null;
  }

  /** Upload timestamps and thumbnail URLs for files (max 50). */
  async fileInfo(files: string[], width: number): Promise<Map<string, { timestamp: string; url: string }>> {
    type R = { query?: { pages?: Record<string, { title: string; imageinfo?: { timestamp: string; thumburl?: string; url: string }[] }> } };
    const out = new Map<string, { timestamp: string; url: string }>();
    if (!files.length) return out;
    const j = await this.get<R>({
      action: "query", titles: files.slice(0, 50).map((f) => `File:${f.replace(/^File:/, "")}`).join("|"),
      prop: "imageinfo", iiprop: "timestamp|url", iiurlwidth: String(width),
    });
    for (const p of Object.values(j.query?.pages ?? {})) {
      const ii = p.imageinfo?.[0];
      if (ii) out.set(p.title.replace(/^File:/, "").replace(/ /g, "_"), { timestamp: ii.timestamp, url: ii.thumburl ?? ii.url });
    }
    return out;
  }

  /** Find a team's current light/dark icon files, with thumbnail URLs. */
  async findLogo(gridName: string, width = 192): Promise<(LogoFiles & { lightUrl: string; darkUrl: string }) | null> {
    let page: { title: string; files: string[] } | null = null;
    for (const t of candidateTitles(gridName)) {
      page = await this.pageFiles(t);
      if (page) break;
    }
    if (!page) {
      const found = await this.search(candidateTitles(gridName).at(-1)!);
      if (found) page = await this.pageFiles(found);
    }
    if (!page) return null;
    const aliases = candidateTitles(gridName);
    const files = ownFiles([page.title, ...aliases], page.files);
    if (!files.length) return null;
    const info = await this.fileInfo(files, width);
    const key = (f: string) => f.replace(/^File:/, "").replace(/ /g, "_");
    const pick = pickLogoFiles(page.title, files.map((f) => ({ name: f, timestamp: info.get(key(f))?.timestamp ?? "" })), aliases);
    if (!pick) return null;
    const lightUrl = info.get(key(pick.light))?.url;
    const darkUrl = info.get(key(pick.dark))?.url;
    if (!lightUrl || !darkUrl) return null;
    return { ...pick, lightUrl, darkUrl };
  }
}
