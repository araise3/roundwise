# AGENTS.md

Guidance for AI coding agents working in this repository. See `README.md` for the product overview and deploy steps.

## Project

Roundwise: round-level VALORANT esports analytics built on GRID Riot Open Access data.
A single Cloudflare Worker (Hono + React 19 SSR) backed by D1, with a cron that imports matches every minute.

## Commands

```bash
npm install
npm run db:migrate:local   # apply migrations/ to local D1
npm run dev                # wrangler dev on http://127.0.0.1:8787 (runs npm run build first)
npm run backfill:local     # second terminal: triggers the cron importer repeatedly
npm test                   # vitest: transform logic + schema/column sync
npm run typecheck          # tsc --noEmit
npm run types              # regenerate worker-configuration.d.ts after changing wrangler.jsonc bindings
npm run deploy             # apply remote D1 migrations, then wrangler deploy
```

Run `npm test` and `npm run typecheck` before considering a change done.

Deploying: pushes to `main` deploy automatically via Cloudflare Workers Builds (`npm run build`, then `npm run deploy`),
which applies any new `migrations/` to the remote D1 database before the new code goes live. Migrations must be
backward-compatible with the deployed code: add columns/tables, never drop or rename in the same push.

If the shell's `CLOUDFLARE_API_TOKEN` lacks Workers permissions, deploy with the saved OAuth login:
`env -u CLOUDFLARE_API_TOKEN npm run deploy`.

## Architecture

```
src/index.tsx     Hono routes; render() SSRs one page component and embeds its props for hydration; cron handler
src/grid/         GRID GraphQL documents, response types, client
src/ingest/       run.ts (discovery + batch import), transform.ts (pure GRID -> row transform), db.ts,
                  scope.ts (which tournaments are imported: VCT + VCL/Challengers only; no Game Changers or open quals)
src/stats/        columns.ts (stored count columns), metrics.ts (metric registry: SQL + definitions),
                  periods.ts (90d / 12m / all), queries.ts (page queries)
src/web/          React UI shared by server and browser: app.tsx (page registry), pages/, components/,
                  components/ui (shadcn), lib/, app.css (Tailwind v4 + theme tokens)
src/client/       browser entry that hydrates the page (bundled to public/js)
migrations/       D1 schema (SQL)
scripts/          import-vlr.mjs (vlr.gg stats for VCT, see below), layout-audit.js, local helpers
test/             synthetic-data tests
.legacy-ui/       old UI, gitignored; do not edit
```

### vlr.gg stats (VCT only)

Rating, ACS, KAST, clutches, econ, buy-type win rates and map vetoes come from vlr.gg via the nrg-scrapbook scraper
database (`db-snapshot` release). `node scripts/import-vlr.mjs` (remote by default; `--local --persist-to <dir>`,
`--dry-run`) pairs each vlr match with a GRID series (same maps and scores within 36 h, and ≥6 of 10 players by name),
writes the `vlr_*` columns on `game_players`/`game_teams` plus `vlr_series`, `vlr_maps`, `vlr_vetoes`, flags GRID maps
whose score disagrees as `partial`, merges series GRID split in two (`status = 'duplicate'`), fixes series scores, and
forces an aggregate rebuild. It is idempotent: re-run it after the scraper has new matches. Every vlr metric is marked
`source: "vlr"` and its description ends "From vlr.gg; VCT matches only."; show those columns only when `hasVlr()` is true.

Maps with `partial = 1` (GRID data stopped early) stay on match pages but every stats query and aggregate filters
`partial = 0`. Keep that filter on any new query over `game_teams`/`game_players`.

- `@/*` resolves to `src/web/*`.
- Generated, gitignored output: `public/app.css`, `public/js/`, `public/fonts/`. Edit `src/web/app.css` and `src/client/`, never the built files.
- Add shadcn components with `npx shadcn@latest add <name>` (they land in `src/web/components/ui`).

## Adding a stat

Metrics are defined once in `src/stats/metrics.ts` as SQL over summed counts; that definition drives every page,
leaderboard sort, and the About page's definitions. To add one:

1. Add the count column in `src/stats/columns.ts` and a new migration in `migrations/`.
2. Compute it in `src/ingest/transform.ts`.
3. Add the metric in `src/stats/metrics.ts`.

`test/columns.test.ts` checks that columns and schema stay in sync.

## Hard constraints (GRID Open Access ToS)

- **No JSON API, CSV/JSON exports, or bulk data access** (ToS 5.2). The site serves rendered HTML only; page props embedded for hydration must contain only what that page displays.
- **Never commit or log secrets.** `GRID_API_KEY` lives in `.dev.vars` locally and as a Wrangler secret in production.
- Keep the GRID attribution, not-endorsed notice, and Riot legal notice in the footer.
- `SITE_NAME` must not contain or resemble "GRID" or "Riot Open Access".
- No Riot art; agents and maps are text only. Team logos are shown by the owner's decision although ToS 9.3 grants no
  rights to team marks. Sources: Liquipedia light/dark icons (`src/ingest/liquipedia.ts`; User-Agent with the
  `LIQUIPEDIA_CONTACT` secret, ≥2 s between requests, one cron run at a time via the `logo_lock` meta row), falling back
  to GRID's `Team.logoUrl`. Processed by `src/ingest/logos.ts`, stored in D1, never hotlinked.
- No betting, odds, fantasy, or prediction-market features or links; no paywalls.
- GRID's Open Access tier has no economy, trades, clutches, kill timelines, heatmaps or live data. For VCT matches,
  economy, KAST and clutches come from vlr.gg (above), credited as such; Challengers matches have none of them.

## UI rules (no layout quirks)

Every page must look tidy at 375, 768, 1280 and 1600 px wide, in light and dark mode:

- Numbers, table headers, team/player names and labels in compact UI never wrap onto a second line on tablet/desktop.
  On phones a long team name may wrap only as a last resort (DataTable `minW` columns do this automatically).
- Rows in the same list or table show the same set of values: in `BarList`, give every item a `sub` or none.
- Values that belong together line up in columns (`BarList` uses subgrid; tables right-align numbers with `tabular-nums`).
- Nothing scrolls sideways, spills out of its card, or is clipped before hydration (DataTable hides optional
  columns on phones until it has measured what fits).
- Show tournament names through `eventName()` ("Champions Shanghai · Playoffs"), never the raw GRID string.
- Show teams with `TeamBadge` (logo, or initials tile when there is none; `side` adds the A/B colour ring). In two-team
  comparisons (`CompareTable`) the headers are badges; put full team names in the Section description.
- Logos need light- and dark-mode versions: `/logo/:id/light|dark`. Liquipedia provides both; GRID's single logo (and any image
  still hard to see in a mode) gets a contrasting tile automatically. `teams.logo_ref` records which Liquipedia files were used.

Before finishing a UI change, paste `scripts/layout-audit.js` into the browser console on the running site and run
`await layoutAudit([...pages], [375, 768, 1280, 1600])` (and once with `{ noJs: true }` at 375). It must report `ok`
for every page, apart from long team names wrapping at 375. For realistic data locally, copy the live database:
`wrangler d1 export roundwise --remote --output snap.sql`, then `wrangler d1 execute roundwise --local --persist-to <dir> --file snap.sql`
and run `wrangler dev --persist-to <dir>`.

## D1 and GRID limits

The account is on the Workers Paid plan (50M D1 rows written/month, 1000 subrequests per run). Each imported series
writes ~100 rows. GRID Open Access allows 120 requests per series per hour and ~180 Series State requests/min overall;
the importer fetches 8 series at a time and stops a run on a 429.

## Windows note

If local D1 fails with `internal error`, the project path is too long for the local SQLite file; add `--persist-to C:/rw-state` to both `db:migrate:local` and `dev`.
