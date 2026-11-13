# Roundwise

Round-level VALORANT esports analytics on GRID Riot Open Access data, covering tier 1 (VCT) and tier 2 (VCL / Challengers) from 2026.
Cloudflare Worker (Hono + React SSR) + D1 + a cron importer that runs every minute.

It focuses on what scoreboard sites don't show:

| Area | What you get |
|---|---|
| **Win conditions** | How every team wins *and loses* rounds per side: elimination, detonation, defuse, time |
| **Spike play** | Plant rate, post-plant win %, retake win %, retakes ending in defuse, abandoned defuses, half-defuses |
| **Pistols** | Attack/defense pistol win %, post-pistol conversion, pistol bounce-back |
| **Openings** | First-kill rate, win % after first kill, win % after first death; per player FK→round-win |
| **Momentum** | Comebacks from −5, blown +5 leads, overtime record, max lead/deficit, longest streaks, score-flow chart |
| **Control** | Ultimate orb control, flawless rounds, survivors per lost round (save discipline) |
| **Players** | Attack vs defense KPR/ADR/survival, survival %, KAS (no trades), damage taken/round, damage ratio, multi-kill rates, pistol performance, weapon mix, agent and map splits |
| **Maps** | Attacker round win %, plant/post-plant rates, how rounds end, OT rate, best teams per map |
| **Match pages** | Round strip (winner, win type, plant, first kill, survivors), score flow, side-by-side team comparison, extended scoreboards |
| **Tools** | Sortable leaderboards with definitions, team-vs-team compare, period filters (90d / 12m / all) |

Not possible with Open Access data: economy/buy types, trades, clutches, kill timelines, heatmaps, live data.

## Run locally

```bash
npm install
cp .env .dev.vars          # .dev.vars must contain GRID_API_KEY=...
npm run db:migrate:local
npm run dev                # http://127.0.0.1:8787
npm run backfill:local     # in a second terminal: triggers the importer 20x
```

On Windows, if local D1 fails with `internal error`, the project path is too long for the
local SQLite file. Move the project to a shorter path, or add `--persist-to C:/rw-state`
to both the `db:migrate:local` and `dev` commands.

Team logos are resized with the Cloudflare Images binding. Local mode can't produce the raw pixels used for the
contrast check, so `wrangler.jsonc` marks the binding `remote: true`: `wrangler dev` calls the real service and needs
`npx wrangler login`. The cron fills in GRID's logo (10 teams per run) for teams that have none.

Liquipedia's light/dark team icons are loaded by hand, from one machine as their API terms ask:

```bash
node scripts/import-logos.mjs            # remote D1; --local --persist-to DIR, --dry-run, --force, --only ids
```

It needs `LIQUIPEDIA_CONTACT=<email>` in `.dev.vars` (sent in the User-Agent), keeps at least 2 s between requests,
caches every response in `.liquipedia-cache.json` (gitignored) and prints the teams it found no logo for. Re-run it
when new teams appear; teams with a Liquipedia logo are skipped unless `--force`.

UI: React 19 + shadcn/ui (Tailwind v4), server-rendered in the Worker with `react-dom/server` and hydrated in the browser
(`src/client/main.tsx`). Each route renders one page component from `src/web/app.tsx` and embeds that page's props for hydration;
there is no JSON API (ToS 5.2). shadcn components live in `src/web/components/ui` (add more with `npx shadcn@latest add <name>`).
`wrangler dev`/`deploy` run `npm run build` (CSS + client bundle) automatically.

Tests: `npm test` (transform logic + schema/column sync). Typecheck: `npm run typecheck`.

## Deploy

```bash
npx wrangler login
npx wrangler d1 create roundwise           # paste the database_id into wrangler.jsonc
npx wrangler secret put GRID_API_KEY       # paste the key at the prompt
npm run deploy                             # applies pending D1 migrations, then deploys
```

Pushes to `main` deploy automatically via Cloudflare Workers Builds, which runs `npm run build` then `npm run deploy`,
so new files in `migrations/` are applied to the remote D1 database before the new code goes live.
Keep migrations backward-compatible with the currently deployed code (add columns/tables; don't drop or rename in the same push).

The cron starts importing immediately. Tuning lives in `wrangler.jsonc` → `vars`:

- `BACKFILL_FROM`: earliest match date to import. Which tournaments are imported (VCT, Masters, Champions, LCQs,
  Challengers/VCL; not Game Changers or open qualifiers) is defined in `src/ingest/scope.ts`.
- `BATCH_SIZE`: matches fetched per run (every minute, 8 in parallel). Each match writes ~100 D1 rows. The default (100) assumes
  the Workers Paid plan; throughput is then capped by GRID (~180 Series State requests/min overall, 120/series/hour). On the free plan use 6 and a
  `*/10` cron: D1 free allows 100k rows written/day
  and a Worker run only 50 subrequests. GRID rate limits are handled: a 429 ends the batch and the next run resumes.
- `DELAY_HOURS`: Open Access data is delayed; matches are requested this long after their start.
- `AGG_EVERY_HOURS`: how often leaderboard/map aggregates are rebuilt.

### vlr.gg stats for VCT

Rating, ACS, KAST, clutches, econ, buy-type win rates and map vetoes for VCT matches come from vlr.gg, scraped by
[nrg-scrapbook](https://github.com/araise3/nrg-scrapbook). After a deploy (the migration must be applied) and whenever
the scraper has new matches, run:

```bash
node scripts/import-vlr.mjs            # downloads the db-snapshot release, aligns it, writes to remote D1
node scripts/import-vlr.mjs --dry-run  # alignment report + SQL file only
```

It also fixes GRID data with vlr.gg's: maps whose GRID score disagrees are marked incomplete and left out of stats,
series GRID split in two are merged, and series scores are corrected. Challengers matches have no vlr.gg stats.

## Before going public: Open Access ToS checklist

- [x] GRID logo + "Official Riot Esports Data powered by GRID" in the footer (ToS 9.5), plus the
      not-endorsed notice (9.6) and Riot's Legal Jibber Jabber notice. The logos in `public/` are GRID's
      own files from grid.gg/brand/. If the Open Access documentation in the GRID portal provides a
      specific attribution asset, swap it in.
- [ ] Set `SITE_NAME`. It must not contain or resemble "GRID" or "Riot Open Access" (9.4).
- [ ] No paywalls, paid features or sponsorships (6.1). Passive ads are allowed if appropriate (6.2).
- [ ] No betting, odds, fantasy or prediction-market use or links (7.1.1).
- [ ] No raw or bulk data access (5.2). The site serves only rendered HTML; don't add CSV/JSON exports or a public API.
- [ ] Don't train, fine-tune or benchmark ML models on the data without written approval (8.3).
      Only use third-party AI tools on the data under a paid business/enterprise plan with training disabled (8.2).
- [ ] Never commit `.dev.vars` / `.env` or expose the key (3.3). Both are in `.gitignore`.
- [ ] Team logos: shown by the site owner's decision (Nov 2026) although ToS 9.3 grants no rights to team marks.
      They come from Liquipedia (separate light/dark icons, loaded by `scripts/import-logos.mjs`; credited in the
      footer) with GRID's `Team.logoUrl` as the fallback, are stored in D1 and served from this Worker (never hotlinked).
      Remove them if GRID, Liquipedia or a team objects. No Riot art is used; agents and maps are text only.
- [ ] If GRID asks you to correct or remove player information, do it promptly (10.3).
- [ ] vlr.gg stats (Rating, ACS, KAST, clutches, economy, vetoes) are credited on the About page and in every metric
      definition. They are not GRID data, so GRID's licence doesn't cover them; remove them if vlr.gg objects.

## Layout

```
src/grid/        GraphQL documents, types, client
src/ingest/      discovery + batch import (run.ts), pure transform (transform.ts)
src/stats/       column lists, metric registry (SQL + definitions), page queries
src/web/         React UI shared by server + browser: app.tsx (page registry), pages/, components/ (site, charts,
                 layout, command menu), components/ui (shadcn), app.css (Tailwind v4 + shadcn theme tokens)
src/client/      browser entry: hydrates the page (bundled to public/js)
migrations/      D1 schema
public/          built CSS, JS, fonts (generated), GRID logos
scripts/         import-vlr.mjs (vlr.gg stats), layout-audit.js, local helpers
test/            synthetic-data tests
```

Metrics are defined once in `src/stats/metrics.ts` as SQL over summed counts. That single
definition drives every page, leaderboard sort, and the About page's definitions.
To add a stat, add a column in `columns.ts` + migration, compute it in `transform.ts`, then add a metric.
