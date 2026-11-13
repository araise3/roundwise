/**
 * Team logos, two small PNGs per team (light mode, dark mode), stored in D1 and served by /logo/:id/:mode.
 *
 * Source 1: Liquipedia (src/ingest/liquipedia.ts), which has separate light-mode and dark-mode icons.
 * Source 2 (fallback): GRID's single Team.logoUrl.
 * Each image is processed once with the Images binding. If a mode's image is still hard to see on that mode's
 * background (e.g. a white GRID logo on a white page), that variant gets a contrasting tile.
 */
import { gridQuery } from "../grid/client";
import { CENTRAL_DATA_URL, teamLogosQuery } from "../grid/queries";
import { LiquipediaClient, LiquipediaRateLimited } from "./liquipedia";

const DAY = 24 * 3600_000;
const SIZE = 96;      // output px (shown at 20-32 px, so sharp on 3x screens)
const TILE_PAD = 10;  // margin inside a tile
export const TILE_ON_LIGHT = "#171717"; // dark tile behind light logos in light mode
export const TILE_ON_DARK = "#f5f5f5";  // light tile behind dark logos in dark mode
const ANALYSE = 48;   // px used to measure contrast
const RECHECK = 30 * DAY; // teams on the GRID fallback (or with no logo) are looked up on Liquipedia again
const LOCK_MS = 3 * 60_000;

const lin = (c: number) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const luminance = (r: number, g: number, b: number) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const contrast = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
const L_DARK_BG = luminance(10, 10, 10);
const L_LIGHT_BG = 1;

/** Share of a logo's visible pixels that stand out (contrast ≥ 2.2) on a dark and on a light page. */
export function logoVisibility(rgba: Uint8Array): { onDark: number; onLight: number } {
  let n = 0, dark = 0, light = 0;
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    if (rgba[i + 3] < 128) continue;
    n++;
    const L = luminance(rgba[i], rgba[i + 1], rgba[i + 2]);
    if (contrast(L, L_DARK_BG) >= 2.2) dark++;
    if (contrast(L, L_LIGHT_BG) >= 2.2) light++;
  }
  return n ? { onDark: dark / n, onLight: light / n } : { onDark: 1, onLight: 1 };
}

/** Which colour modes need a contrasting tile behind the logo. */
export function tilePlan(v: { onDark: number; onLight: number }) {
  return {
    light: v.onLight < 0.5 && v.onDark > v.onLight, // light mode: logo on a dark tile
    dark: v.onDark < 0.5 && v.onLight > v.onDark,   // dark mode: logo on a light tile
  };
}

const isRealLogo = (url: string | null | undefined): url is string => !!url && !/\/generic$/.test(url);

async function toBytes(stream: ReadableStream<Uint8Array>) {
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** One 96 px PNG for one colour mode; adds a contrasting tile if the image is hard to see in that mode. */
async function variant(images: ImagesBinding, src: ArrayBuffer, mode: "light" | "dark") {
  const input = () => images.input(new Response(src).body!);
  const rgba = await toBytes((await input().transform({ width: ANALYSE, height: ANALYSE, fit: "contain" }).output({ format: "rgba" })).image());
  const tile = tilePlan(logoVisibility(rgba))[mode] ? (mode === "light" ? TILE_ON_LIGHT : TILE_ON_DARK) : null;
  const t = tile
    ? input()
      .transform({ width: SIZE - 2 * TILE_PAD, height: SIZE - 2 * TILE_PAD, fit: "pad", background: tile })
      .transform({ border: { color: tile, width: TILE_PAD } })
    : input().transform({ width: SIZE, height: SIZE, fit: "contain" });
  return toBytes((await t.output({ format: "image/png" })).image());
}

/** Light- and dark-mode PNGs from one image (GRID) or a light/dark pair (Liquipedia). */
export async function processLogo(images: ImagesBinding, light: ArrayBuffer, dark: ArrayBuffer = light) {
  return { light: await variant(images, light, "light"), dark: await variant(images, dark, "dark") };
}

/** One cron run at a time touches logos (runs every minute and Liquipedia calls are slow and rate limited). */
async function lock(db: D1Database, now: Date) {
  const until = new Date(now.getTime() + LOCK_MS).toISOString();
  const r = await db.prepare(
    `INSERT INTO meta (key, value) VALUES ('logo_lock', ?1) ON CONFLICT(key) DO UPDATE SET value = ?1 WHERE meta.value < ?2`,
  ).bind(until, now.toISOString()).run();
  return r.meta.changes > 0;
}

/**
 * Process logos for teams that are new, changed, errored a week ago, or on the GRID fallback / without a logo
 * for a month. With LIQUIPEDIA_CONTACT set, 5 teams per run (Liquipedia allows one request per 2 s); otherwise
 * 10 per run from GRID only. Never throws: logos must not block the import.
 */
export async function refreshLogos(env: Env, now: Date): Promise<number> {
  const db = env.DB;
  const contact = (env as { LIQUIPEDIA_CONTACT?: string }).LIQUIPEDIA_CONTACT;
  const lp = contact ? new LiquipediaClient(contact) : null;
  try {
    if (!(await lock(db, now))) return 0;
    const due = await db.prepare(
      `SELECT id, name, logo_url FROM teams
       WHERE logo_status IS NULL
          OR (logo_status = 'error' AND logo_checked_at < ?1)
          OR ((logo_status = 'none' OR logo_source = 'grid') AND logo_checked_at < ?2 AND ?3)
       ORDER BY id LIMIT ?4`,
    ).bind(new Date(now.getTime() - 7 * DAY).toISOString(), new Date(now.getTime() - RECHECK).toISOString(), lp ? 1 : 0, lp ? 5 : 10)
      .all<{ id: string; name: string; logo_url: string | null }>();
    if (!due.results.length) return 0;

    const missing = due.results.filter((t) => !t.logo_url).map((t) => t.id);
    const urls = new Map(due.results.map((t) => [t.id, t.logo_url]));
    if (missing.length) {
      const data = await gridQuery<Record<string, { id: string; logoUrl: string | null } | null>>(
        CENTRAL_DATA_URL, env.GRID_API_KEY, teamLogosQuery(missing), {},
      );
      for (const t of Object.values(data)) if (t) urls.set(t.id, t.logoUrl ?? null);
    }

    const nowIso = now.toISOString();
    let done = 0;
    for (const { id, name } of due.results) {
      const url = urls.get(id) ?? null;
      let ref: string | null = null; // Liquipedia file name(s) used
      const set = (status: string, source: string | null, light: Uint8Array | null = null, dark: Uint8Array | null = null) =>
        db.prepare(
          `UPDATE teams SET logo_url = ?, logo_status = ?, logo_source = ?, logo_light = ?, logo_dark = ?, logo_checked_at = ?,
             logo_ref = ? WHERE id = ?`,
        ).bind(url, status, source, light, dark, nowIso, ref, id).run();
      try {
        const hit = lp ? await lp.findLogo(name) : null;
        if (hit) {
          ref = hit.light === hit.dark ? hit.light : `${hit.light} | ${hit.dark}`;
          const light = await lp!.download(hit.lightUrl);
          const dark = hit.darkUrl === hit.lightUrl ? light : await lp!.download(hit.darkUrl);
          const out = await processLogo(env.IMAGES, light, dark);
          await set("ok", "liquipedia", out.light, out.dark);
        } else if (isRealLogo(url)) {
          const res = await fetch(url);
          if (!res.ok) throw new Error(`logo HTTP ${res.status}`);
          const out = await processLogo(env.IMAGES, await res.arrayBuffer());
          await set("ok", "grid", out.light, out.dark);
        } else {
          await set("none", null);
        }
        done++;
      } catch (e) {
        if (e instanceof LiquipediaRateLimited) { console.warn("logos: Liquipedia rate limit, stopping"); break; }
        console.warn("logo", id, String(e));
        // Keep whatever images the team already has; retry in a week.
        await db.prepare("UPDATE teams SET logo_status = 'error', logo_checked_at = ? WHERE id = ?").bind(nowIso, id).run();
      }
    }
    await db.prepare("DELETE FROM meta WHERE key = 'logo_lock'").run();
    return done;
  } catch (e) {
    console.warn("refreshLogos", String(e));
    return 0;
  }
}
