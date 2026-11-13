#!/usr/bin/env node
/**
 * Import team logos from Liquipedia (separate light-mode and dark-mode icons) into D1.
 * Run by hand from one machine: Liquipedia's API terms ask for one IP address, which a Worker can't guarantee.
 *
 *   node scripts/import-logos.mjs                       # remote D1 (uses your `wrangler login`)
 *   node scripts/import-logos.mjs --local --persist-to DIR
 *   node scripts/import-logos.mjs --dry-run             # look up and report, write nothing
 *   node scripts/import-logos.mjs --force               # also redo teams that already have a Liquipedia logo
 *   node scripts/import-logos.mjs --only 90,96          # just these team ids
 *
 * Needs LIQUIPEDIA_CONTACT (an email) in .dev.vars or the environment; it goes into the User-Agent.
 * Every API response is cached in .liquipedia-cache.json, so re-runs only ask Liquipedia about new teams.
 * Requests are at least 2 s apart (API calls and image downloads). Teams with no Liquipedia icon keep their
 * GRID logo (filled in by the Worker cron). The shell's CLOUDFLARE_API_TOKEN is ignored for wrangler calls
 * (it lacks D1 access here); pass --use-api-token to keep it.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  LiquipediaClient, LiquipediaRateLimited, candidateTitles, fileKey, fileStem, infoboxImages, pickLogoFiles, ownFiles,
} from "../src/ingest/liquipedia.ts";

const SIZE = 96; // stored px (shown at 20-32 px)
const BATCH = 10; // titles per page query

const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const opt = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
const target = flag("--local") ? ["--local", ...(opt("--persist-to") ? ["--persist-to", opt("--persist-to")] : [])] : ["--remote"];
const only = opt("--only")?.split(",").map((s) => s.trim());
const root = join(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");

// ------------------------------------------------------------------ config
const devVars = existsSync(join(root, ".dev.vars")) ? readFileSync(join(root, ".dev.vars"), "utf8") : "";
const contact = process.env.LIQUIPEDIA_CONTACT || devVars.match(/^LIQUIPEDIA_CONTACT=(.+)$/m)?.[1]?.trim();
if (!contact) { console.error("Set LIQUIPEDIA_CONTACT (an email) in .dev.vars or the environment."); process.exit(1); }

// ------------------------------------------------------------------ wrangler / D1
const wranglerBin = join(dirname(createRequire(import.meta.url).resolve("wrangler/package.json")), "bin", "wrangler.js");
const childEnv = { ...process.env };
if (!flag("--use-api-token")) delete childEnv.CLOUDFLARE_API_TOKEN;
function wrangler(...a) {
  const r = spawnSync(process.execPath, [wranglerBin, "d1", "execute", "roundwise", ...target, ...a], { encoding: "utf8", maxBuffer: 1 << 30, env: childEnv });
  if (r.status !== 0) throw new Error(`wrangler failed:\n${r.stderr || r.stdout}`);
  return r.stdout;
}
const query = (sql) => { const out = wrangler("--json", "--command", sql); return JSON.parse(out.slice(out.indexOf("[")))[0].results; };
const q = (v) => (v == null ? "NULL" : `'${String(v).replaceAll("'", "''")}'`);
const hex = (buf) => `X'${Buffer.from(buf).toString("hex")}'`;

// ------------------------------------------------------------------ cache
const cacheFile = join(root, ".liquipedia-cache.json");
const cacheData = existsSync(cacheFile) ? JSON.parse(readFileSync(cacheFile, "utf8")) : {};
const cache = {
  get: (k) => cacheData[k],
  set: (k, v) => { cacheData[k] = v; writeFileSync(cacheFile, JSON.stringify(cacheData)); },
};
const lp = new LiquipediaClient(contact, cache);

// ------------------------------------------------------------------ teams
const teams = query("SELECT id, name, logo_source FROM teams ORDER BY name")
  .filter((t) => (only ? only.includes(t.id) : flag("--force") || t.logo_source !== "liquipedia"));
console.log(`${teams.length} teams to look up`);

/** Find each team's Liquipedia page: exact name, then without "(1)", then search. */
const pageOf = new Map();
async function resolvePages(list, nameOf) {
  for (let i = 0; i < list.length; i += BATCH) {
    const chunk = list.slice(i, i + BATCH);
    const res = await lp.pages(chunk.map(nameOf));
    for (const t of chunk) { const p = res.get(nameOf(t)); if (p) pageOf.set(t.id, p); }
  }
}

const results = []; // { team, status, ref?, reason? }
try {
  await resolvePages(teams, (t) => candidateTitles(t.name)[0]);
  await resolvePages(teams.filter((t) => !pageOf.has(t.id) && candidateTitles(t.name).length > 1), (t) => candidateTitles(t.name)[1]);
  for (const t of teams.filter((t) => !pageOf.has(t.id))) {
    const found = await lp.search(candidateTitles(t.name).at(-1));
    if (found) { const p = (await lp.pages([found])).get(found); if (p) pageOf.set(t.id, p); }
  }

  // Candidate files per team: files named after the page title, the GRID name or the infobox logo's name.
  const plan = [];
  for (const t of teams) {
    const page = pageOf.get(t.id);
    if (!page) { results.push({ team: t, status: "missing", reason: "no Liquipedia page" }); continue; }
    const box = infoboxImages(page.wikitext);
    const aliases = [...candidateTitles(t.name), ...[box.image, box.imagedark].map((f) => f && fileStem(f)).filter(Boolean)];
    const files = ownFiles([page.title, ...aliases], page.files);
    plan.push({ team: t, page, aliases, files, box });
  }
  const info = await lp.fileInfo(plan.flatMap((p) => p.files), SIZE);

  const picks = [];
  for (const p of plan) {
    let pick = pickLogoFiles(p.page.title, p.files.map((f) => ({ name: f, timestamp: info.get(fileKey(f))?.timestamp ?? "" })), p.aliases);
    // Fall back to the infobox logo when it is an icon (not a full wordmark).
    if (!pick && p.box.image && !/\bfull\b/i.test(p.box.image)) {
      pick = { title: p.page.title, light: p.box.image, dark: p.box.imagedark ?? p.box.image };
      const extra = await lp.fileInfo([pick.light, pick.dark], SIZE);
      for (const [k, v] of extra) info.set(k, v);
    }
    if (!pick) { results.push({ team: p.team, status: "missing", reason: `page "${p.page.title}" has no light/dark icon` }); continue; }
    const lightUrl = info.get(fileKey(pick.light))?.url, darkUrl = info.get(fileKey(pick.dark))?.url;
    if (!lightUrl || !darkUrl) { results.push({ team: p.team, status: "missing", reason: `no file info for ${pick.light}` }); continue; }
    picks.push({ team: p.team, pick, lightUrl, darkUrl });
  }

  // Download and write in batches of 20 teams.
  const work = join(tmpdir(), "roundwise-logos");
  mkdirSync(work, { recursive: true });
  const now = new Date().toISOString();
  for (let i = 0; i < picks.length; i += 20) {
    const sql = [];
    for (const x of picks.slice(i, i + 20)) {
      const ref = x.pick.light === x.pick.dark ? x.pick.light : `${x.pick.light} | ${x.pick.dark}`;
      results.push({ team: x.team, status: "ok", ref: `${x.pick.title}: ${ref}` });
      if (flag("--dry-run")) continue; // lookups only: no image downloads
      const light = await lp.download(x.lightUrl);
      const dark = x.darkUrl === x.lightUrl ? light : await lp.download(x.darkUrl);
      sql.push(`UPDATE teams SET logo_light = ${hex(light)}, logo_dark = ${hex(dark)}, logo_source = 'liquipedia', logo_status = 'ok', ` +
        `logo_ref = ${q(ref)}, logo_checked_at = ${q(now)} WHERE id = ${q(x.team.id)};`);
    }
    if (!flag("--dry-run") && sql.length) {
      const file = join(work, `logos-${i}.sql`);
      writeFileSync(file, sql.join("\n") + "\n");
      wrangler("--yes", "--file", file);
      console.log(`wrote ${Math.min(i + 20, picks.length)}/${picks.length}`);
    }
  }
} catch (e) {
  if (e instanceof LiquipediaRateLimited) console.error("\nLiquipedia rate limit (429): stopped. Re-run later; cached lookups are reused.");
  else throw e;
}

// ------------------------------------------------------------------ report
const ok = results.filter((r) => r.status === "ok");
const missing = results.filter((r) => r.status === "missing");
console.log(`\n${ok.length} Liquipedia logos${flag("--dry-run") ? " found (dry run, nothing written)" : " written"}, ` +
  `${missing.length} teams without one, ${lp.requests} requests to Liquipedia`);
if (missing.length) {
  console.log("\nNo Liquipedia logo (they keep GRID's logo or initials):");
  for (const r of missing) console.log(`  ${r.team.id.padStart(6)}  ${r.team.name.trim().padEnd(28)}  ${r.reason}`);
}
