/**
 * Team logos. GRID gives one logo per team (PNG/JPEG/WebP, often 600-4000 px) with no light/dark variants.
 * Each logo is processed once with the Images binding into two small PNGs, one per colour mode. If a logo is
 * hard to see on that mode's background (e.g. a white logo on a white page), that variant gets a contrasting tile.
 * Pages only ever load /logo/:id/:mode from this Worker, never GRID's CDN.
 */
import { gridQuery } from "../grid/client";
import { CENTRAL_DATA_URL, teamLogosQuery } from "../grid/queries";

const DAY = 24 * 3600_000;
const SIZE = 96;      // output px (shown at 20-32 px, so sharp on 3x screens)
const TILE_PAD = 10;  // margin inside a tile
export const TILE_ON_LIGHT = "#171717"; // dark tile behind light logos in light mode
export const TILE_ON_DARK = "#f5f5f5";  // light tile behind dark logos in dark mode
const ANALYSE = 48;   // px used to measure contrast

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

/** Two 96 px PNG variants (light mode, dark mode) for one logo. */
export async function processLogo(images: ImagesBinding, src: ArrayBuffer) {
  const input = () => images.input(new Response(src).body!);
  const rgba = await toBytes((await input().transform({ width: ANALYSE, height: ANALYSE, fit: "contain" }).output({ format: "rgba" })).image());
  const tile = tilePlan(logoVisibility(rgba));
  const variant = async (color: string | null) => {
    const t = color
      ? input()
        .transform({ width: SIZE - 2 * TILE_PAD, height: SIZE - 2 * TILE_PAD, fit: "pad", background: color })
        .transform({ border: { color, width: TILE_PAD } })
      : input().transform({ width: SIZE, height: SIZE, fit: "contain" });
    return toBytes((await t.output({ format: "image/png" })).image());
  };
  return {
    light: await variant(tile.light ? TILE_ON_LIGHT : null),
    dark: await variant(tile.dark ? TILE_ON_DARK : null),
    tile,
  };
}

/**
 * Process logos for teams not done yet (new teams, changed logo URL, or an error a week ago).
 * Looks up missing logo URLs in one Central Data request. Never throws: logos must not block the import.
 */
export async function refreshLogos(env: Env, now: Date, limit = 10): Promise<number> {
  const db = env.DB;
  try {
    const due = await db.prepare(
      `SELECT id, logo_url FROM teams
       WHERE logo_status IS NULL OR (logo_status = 'error' AND logo_checked_at < ?)
       ORDER BY id LIMIT ?`,
    ).bind(new Date(now.getTime() - 7 * DAY).toISOString(), limit).all<{ id: string; logo_url: string | null }>();
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
        db.prepare("UPDATE teams SET logo_url = ?, logo_status = ?, logo_light = ?, logo_dark = ?, logo_checked_at = ? WHERE id = ?")
          .bind(url, status, light, dark, nowIso, id).run();
      if (!isRealLogo(url)) { await set("none"); continue; }
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`logo HTTP ${res.status}`);
        const out = await processLogo(env.IMAGES, await res.arrayBuffer());
        await set("ok", out.light, out.dark);
      } catch (e) {
        console.warn("logo", id, String(e));
        await set("error");
      }
    }
    return due.results.length;
  } catch (e) {
    console.warn("refreshLogos", String(e));
    return 0;
  }
}
