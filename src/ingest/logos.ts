/**
 * Team logos, two small PNGs per team (light mode, dark mode), stored in D1 and served by /logo/:id/:mode.
 *
 * Liquipedia light/dark icons are loaded by `scripts/import-logos.mjs`, run by hand from one machine (Liquipedia's
 * API terms ask for a single IP, which a Worker can't guarantee). This cron only fills in GRID's single
 * Team.logoUrl for teams that have no logo yet, processed once with the Images binding. If that image is hard to
 * see on a mode's background (e.g. a white logo on a white page), that mode's version gets a contrasting tile.
 */
import { gridQuery } from "../grid/client";
import { CENTRAL_DATA_URL, teamLogosQuery } from "../grid/queries";

const DAY = 24 * 3600_000;
const SIZE = 96;      // output px (shown at 20-32 px, so sharp on 3x screens)
const TILE_PAD = 10;  // margin inside a tile
export const TILE_ON_LIGHT = "#171717"; // dark tile behind light logos in light mode
export const TILE_ON_DARK = "#f5f5f5";  // light tile behind dark logos in dark mode
const ANALYSE = 48;   // px used to measure contrast
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

/** Light- and dark-mode PNGs from one image. */
export async function processLogo(images: ImagesBinding, src: ArrayBuffer) {
  return { light: await variant(images, src, "light"), dark: await variant(images, src, "dark") };
}

/** One cron run at a time touches logos (the cron runs every minute). */
async function lock(db: D1Database, now: Date) {
  const until = new Date(now.getTime() + LOCK_MS).toISOString();
  const r = await db.prepare(
    `INSERT INTO meta (key, value) VALUES ('logo_lock', ?1) ON CONFLICT(key) DO UPDATE SET value = ?1 WHERE meta.value < ?2`,
  ).bind(until, now.toISOString()).run();
  return r.meta.changes > 0;
}

/**
 * GRID logos for up to 10 teams per run that have none yet (new teams, a changed GRID logo, or an error a week
 * ago). Teams with a Liquipedia logo (logo_source = 'liquipedia') are never touched. Never throws.
 */
export async function refreshLogos(env: Env, now: Date): Promise<number> {
  const db = env.DB;
  let locked = false;
  try {
    if (!(locked = await lock(db, now))) return 0;
    const due = await db.prepare(
      `SELECT id, logo_url FROM teams
       WHERE (logo_source IS NULL OR logo_source = 'grid')
         AND (logo_status IS NULL OR (logo_status = 'error' AND logo_checked_at < ?))
       ORDER BY id LIMIT 10`,
    ).bind(new Date(now.getTime() - 7 * DAY).toISOString()).all<{ id: string; logo_url: string | null }>();
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
    for (const { id } of due.results) {
      const url = urls.get(id) ?? null;
      const set = (status: string, light: Uint8Array | null = null, dark: Uint8Array | null = null) =>
        db.prepare(
          `UPDATE teams SET logo_url = ?, logo_status = ?, logo_source = ?, logo_light = ?, logo_dark = ?, logo_checked_at = ?
           WHERE id = ?`,
        ).bind(url, status, light ? "grid" : null, light, dark, nowIso, id).run();
      try {
        if (!isRealLogo(url)) { await set("none"); continue; }
        const res = await fetch(url);
        if (!res.ok) throw new Error(`logo HTTP ${res.status}`);
        const out = await processLogo(env.IMAGES, await res.arrayBuffer());
        await set("ok", out.light, out.dark);
      } catch (e) {
        console.warn("logo", id, String(e));
        // Keep whatever images the team already has; retry in a week.
        await db.prepare("UPDATE teams SET logo_status = 'error', logo_checked_at = ? WHERE id = ?").bind(nowIso, id).run();
      }
    }
    return due.results.length;
  } catch (e) {
    console.warn("refreshLogos", String(e));
    return 0;
  } finally {
    if (locked) await db.prepare("DELETE FROM meta WHERE key = 'logo_lock'").run().catch(() => {});
  }
}
