# Roundwise

Round-level VALORANT esports analytics on GRID Riot Open Access data.
Cloudflare Worker (Hono + React SSR) + D1 + a 10-minute cron importer.

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

UI: React 19 + shadcn/ui (Tailwind v4), server-rendered in the Worker with `react-dom/server` and hydrated in the browser
(`src/client/main.tsx`). Each route renders one page component from `src/web/app.tsx` and embeds that page's props for hydration;
there is no JSON API (ToS 5.2). shadcn components live in `src/web/components/ui` (add more with `npx shadcn@latest add <name>`).
`wrangler dev`/`deploy` run `npm run build` (CSS + client bundle) automatically.

Tests: `npm test` (transform logic + schema/column sync). Typecheck: `npm run typecheck`.

## Deploy

```bash
npx wrangler login
npx wrangler d1 create roundwise           # paste the database_id into wrangler.jsonc
npm run db:migrate:remote
npx wrangler secret put GRID_API_KEY       # paste the key at the prompt
npm run deploy
```

The cron starts importing immediately. Tuning lives in `wrangler.jsonc` → `vars`:

- `BACKFILL_FROM`: earliest match date to import.
- `BATCH_SIZE`: matches fetched per 10-minute run. Each match writes ~100 D1 rows; the
  D1 free tier allows 100k rows written/day, so the default (6 → ~860 matches/day) stays under it.
  On the Workers paid plan you can raise this a lot.
- `DELAY_HOURS`: Open Access data is delayed; matches are requested this long after their start.
- `AGG_EVERY_HOURS`: how often leaderboard/map aggregates are rebuilt.

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
- [ ] Team logos and Riot art aren't used (9.3). Teams show initials badges; agents and maps are text only.
- [ ] If GRID asks you to correct or remove player information, do it promptly (10.3).

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
test/            synthetic-data tests
```

Metrics are defined once in `src/stats/metrics.ts` as SQL over summed counts. That single
definition drives every page, leaderboard sort, and the About page's definitions.
To add a stat, add a column in `columns.ts` + migration, compute it in `transform.ts`, then add a metric.
