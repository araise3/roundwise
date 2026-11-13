import { Hono, type Context } from "hono";
import { renderToString } from "react-dom/server";
import { App, type PageName, type PageProps, type Payload } from "@/app";
import { THEME_SCRIPT } from "@/components/mode-toggle";
import { runIngest } from "./ingest/run";
import { parsePeriod, periodCutoff } from "./stats/periods";
import * as Q from "./stats/queries";

type C = Context<{ Bindings: Env }>;
const app = new Hono<{ Bindings: Env }>();

const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]!);


/**
 * Server-render a page with React and embed its props for hydration.
 * Props are only what this page displays; there is no JSON API (Open Access ToS 5.2).
 */
function render<P extends PageName>(c: C, page: P, props: PageProps<P>, opts: { title?: string; active?: string; status?: number } = {}) {
  const siteName = c.env.SITE_NAME;
  const payload: Payload<P> = { page, props, siteName, active: opts.active };
  const body = renderToString(<App {...(payload as Payload)} />);
  const docTitle = opts.title ? `${opts.title} · ${siteName}` : `${siteName} · Round-level VALORANT esports stats`;
  const html = `<!DOCTYPE html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(docTitle)}</title>
<meta name="description" content="Round-level VALORANT esports analytics: win conditions, post-plants, retakes, pistol conversions, first-kill impact, side splits.">
<script>${THEME_SCRIPT}</script>
<link rel="preload" href="/fonts/geist.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/geist-mono.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/app.css">
<script type="module" src="/js/main.js"></script>
</head><body><div id="root">${body}</div>
<script id="__data" type="application/json">${JSON.stringify(payload).replace(/</g, "\\u003c")}</script>
</body></html>`;
  c.header("cache-control", "public, max-age=300");
  return c.html(html, (opts.status ?? 200) as 200);
}

const q = (c: C, k: string) => c.req.query(k) ?? undefined;
const notFound = (c: C) => render(c, "notFound", {}, { title: "Not found", status: 404 });

app.get("/", async (c) => {
  const db = c.env.DB;
  const [recent, fkTeams, retakeTeams, kasPlayers, survPlayers, status] = await Promise.all([
    Q.recentSeries(db, 8),
    Q.leaderboard(db, "teams", "90d", "fk_conv", "desc", 8),
    Q.leaderboard(db, "teams", "90d", "retake", "desc", 8),
    Q.leaderboard(db, "players", "90d", "kas", "desc", 300),
    Q.leaderboard(db, "players", "90d", "surv", "desc", 300),
    Q.ingestStatus(db),
  ]);
  const top = (r: Q.Row[]) => r.slice(0, 5);
  return render(c, "home", {
    siteName: c.env.SITE_NAME, recent,
    status: { counts: status.counts, lastIngest: status.lastIngest },
    spot: { fkTeams: top(fkTeams), retakeTeams: top(retakeTeams), kasPlayers: top(kasPlayers), survPlayers: top(survPlayers) },
  });
});

app.get("/matches", async (c) => {
  const page = Math.max(1, Number(q(c, "page")) || 1);
  const per = 30;
  const rows = await Q.recentSeries(c.env.DB, per + 1, (page - 1) * per);
  return render(c, "matches", { rows: rows.slice(0, per), page, hasMore: rows.length > per }, { title: "Matches", active: "/matches" });
});

app.get("/match/:id", async (c) => {
  const data = await Q.seriesDetail(c.env.DB, c.req.param("id"));
  if (!data) return notFound(c);
  return render(c, "match", { data }, { title: `${data.series.t1_name} vs ${data.series.t2_name}`, active: "/matches" });
});

app.get("/teams", async (c) => {
  const period = parsePeriod(q(c, "period"));
  const search = (q(c, "q") ?? "").slice(0, 60);
  const rows = await Q.teamList(c.env.DB, period, search, 1);
  return render(c, "teams", { rows, period, q: search }, { title: "Teams", active: "/teams" });
});

app.get("/team/:id", async (c) => {
  const db = c.env.DB;
  const id = c.req.param("id");
  const period = parsePeriod(q(c, "period"));
  const cutoff = periodCutoff(period);
  const team = await Q.teamInfo(db, id);
  if (!team) return notFound(c);
  const [summary, losses, byMap, roster, recent] = await Promise.all([
    Q.teamSummary(db, id, cutoff), Q.teamLosses(db, id, cutoff), Q.teamByMap(db, id, cutoff),
    Q.teamRoster(db, id, cutoff), Q.teamRecentMaps(db, id),
  ]);
  return render(c, "team", { period, d: { team, summary, losses, byMap, roster, recent } }, { title: team.name, active: "/teams" });
});

app.get("/compare", async (c) => {
  const db = c.env.DB;
  const period = parsePeriod(q(c, "period"));
  const cutoff = periodCutoff(period);
  const [aId, bId] = [q(c, "a"), q(c, "b")];
  const teams = (await Q.teamList(db, period, "", 3))
    .map((t) => ({ team_id: t.team_id, name: t.name }))
    .sort((x, y) => String(x.name).localeCompare(String(y.name)));
  const [a, b] = await Promise.all([aId ? Q.teamInfo(db, aId) : null, bId ? Q.teamInfo(db, bId) : null]);
  const [sa, sb] = await Promise.all([a ? Q.teamSummary(db, a.id, cutoff) : null, b ? Q.teamSummary(db, b.id, cutoff) : null]);
  return render(c, "compare", { teams, a, b, sa, sb, period }, { title: a && b ? `${a.name} vs ${b.name}` : "Compare", active: "/compare" });
});

app.get("/players", async (c) => {
  const period = parsePeriod(q(c, "period"));
  const search = (q(c, "q") ?? "").slice(0, 60);
  const rows = await Q.playerList(c.env.DB, period, search, 50);
  return render(c, "players", { rows, period, q: search }, { title: "Players", active: "/players" });
});

app.get("/player/:id", async (c) => {
  const db = c.env.DB;
  const id = c.req.param("id");
  const period = parsePeriod(q(c, "period"));
  const cutoff = periodCutoff(period);
  const player = await Q.playerInfo(db, id);
  if (!player) return notFound(c);
  const [summary, byMap, byAgent, weapons, recent] = await Promise.all([
    Q.playerSummary(db, id, cutoff), Q.playerBy(db, id, cutoff, "map"), Q.playerBy(db, id, cutoff, "agent"),
    Q.playerWeapons(db, id, cutoff), Q.playerRecent(db, id),
  ]);
  return render(c, "player", { period, d: { player, summary, byMap, byAgent, weapons, recent } }, { title: player.name, active: "/players" });
});

app.get("/maps", async (c) => {
  const period = parsePeriod(q(c, "period"));
  const rows = await Q.mapList(c.env.DB, period);
  return render(c, "maps", { rows, period }, { title: "Maps", active: "/maps" });
});

app.get("/map/:name", async (c) => {
  const db = c.env.DB;
  const map = c.req.param("name").toLowerCase();
  const period = parsePeriod(q(c, "period"));
  const [s, teams] = await Promise.all([Q.mapSummary(db, map, period), Q.mapTeams(db, map, periodCutoff(period), 3)]);
  return render(c, "map", { map, s, teams, period }, { title: map, active: "/maps" });
});

app.get("/leaderboards", async (c) => {
  const kind = q(c, "kind") === "players" ? "players" : "teams";
  const period = parsePeriod(q(c, "period"));
  const dir = q(c, "dir") === "asc" ? "asc" : "desc";
  const sort = q(c, "sort") ?? (kind === "teams" ? "map_wr" : "kas");
  const defMin = kind === "teams" ? (period === "90d" ? 8 : 15) : (period === "90d" ? 200 : 400);
  const min = Math.max(1, Number(q(c, "min")) || defMin);
  const rows = await Q.leaderboard(c.env.DB, kind, period, sort, dir, min);
  return render(c, "leaderboards", { kind, rows, period, sort, dir, min }, { title: "Leaderboards", active: "/leaderboards" });
});

app.get("/search", async (c) => {
  const term = (q(c, "q") ?? "").trim().slice(0, 60);
  const res = term.length >= 2 ? await Q.search(c.env.DB, term) : { teams: [], players: [] };
  return render(c, "search", { q: term, teams: res.teams, players: res.players }, { title: "Search" });
});

app.get("/about", (c) => render(c, "about", { siteName: c.env.SITE_NAME }, { title: "About", active: "/about" }));

app.notFound((c) => notFound(c as C));

app.onError((err, c) => {
  console.error(err);
  return c.text("Something went wrong.", 500);
});

export default {
  fetch: app.fetch,
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(runIngest(env).then((r) => console.log("ingest", JSON.stringify(r))));
  },
} satisfies ExportedHandler<Env>;
