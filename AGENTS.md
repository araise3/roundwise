# AGENTS.md

Guidance for AI coding agents working in this repository. See `README.md` for the product overview and deploy steps.

## Project

Roundwise: round-level VALORANT esports analytics built on GRID Riot Open Access data.
A single Cloudflare Worker (Hono + React 19 SSR) backed by D1, with a 10-minute cron that imports matches.

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
src/ingest/       run.ts (discovery + batch import), transform.ts (pure GRID -> row transform), db.ts
src/stats/        columns.ts (stored count columns), metrics.ts (metric registry: SQL + definitions),
                  periods.ts (90d / 12m / all), queries.ts (page queries)
src/web/          React UI shared by server and browser: app.tsx (page registry), pages/, components/,
                  components/ui (shadcn), lib/, app.css (Tailwind v4 + theme tokens)
src/client/       browser entry that hydrates the page (bundled to public/js)
migrations/       D1 schema (SQL)
test/             synthetic-data tests
.legacy-ui/       old UI, gitignored; do not edit
```

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
- No team logos or Riot art; teams use initials badges, agents and maps are text only.
- No betting, odds, fantasy, or prediction-market features or links; no paywalls.
- Data the Open Access tier does not provide (economy, trades, clutches, kill timelines, heatmaps, live data) cannot be added.

## D1 limits

Each imported series writes ~100 rows; the free tier allows 100k rows written/day. `BATCH_SIZE` in `wrangler.jsonc` is tuned for that. Keep new per-round or per-player writes cheap.

## Windows note

If local D1 fails with `internal error`, the project path is too long for the local SQLite file; add `--persist-to C:/rw-state` to both `db:migrate:local` and `dev`.
