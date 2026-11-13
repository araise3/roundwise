import { ArrowRight } from "lucide-react";
import { byKey, MAP_METRICS, PLAYER_METRICS, TEAM_METRICS, type Metric } from "../../stats/metrics";
import type { Period } from "../../stats/periods";
import type { Row } from "../../stats/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import {
  DataTable, Empty, flushTable, Hint, KV, Kpi, metricCol, PageHeader, PeriodTabs, PlayerLink, Section, Seg, TeamLink, type Col,
} from "@/components/site";
import { date, fmt, withParams } from "@/lib/format";
import { SeriesTable } from "./matches";

const TM = byKey(TEAM_METRICS);
const PM = byKey(PLAYER_METRICS);

// ------------------------------------------------------------------ home

export interface HomeProps {
  siteName: string;
  recent: Row[];
  spot: { fkTeams: Row[]; retakeTeams: Row[]; kasPlayers: Row[]; survPlayers: Row[] };
  status: { counts: Record<string, number>; lastIngest: string | null };
}

function Leaders({ title, rows, m, kind }: { title: string; rows: Row[]; m: Metric; kind: "team" | "player" }) {
  return (
    <Section title={<Hint text={m.desc}>{title}</Hint>} description="All matches"
      action={<Button asChild variant="ghost" size="sm"><a href={`/leaderboards?kind=${kind}s&sort=${m.key}`}>All<ArrowRight /></a></Button>} flush>
      {rows.length ? (
        <ol className="text-sm">
          {rows.map((r, i) => (
            <li key={i} className="flex items-center gap-3 border-b px-4 py-2 last:border-b-0 sm:px-6">
              <span className="w-4 shrink-0 font-mono text-muted-foreground tabular-nums">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate" title={r.name}>
                {kind === "team" ? <TeamLink id={r.team_id} name={r.name} /> : <PlayerLink id={r.player_id} name={r.name} />}
              </span>
              <span className="shrink-0 font-mono tabular-nums">{fmt(r[m.key], m.fmt)}</span>
            </li>
          ))}
        </ol>
      ) : <Empty>Builds after the next aggregate run.</Empty>}
    </Section>
  );
}

export function Home({ siteName, recent, spot, status }: HomeProps) {
  return (
    <>
      <PageHeader crumbs={["Overview"]} title={siteName} meta={["VALORANT esports, round by round"]} />
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Kpi label="Matches analysed" value={status.counts.done ?? 0} />
          <Kpi label="Queued" value={status.counts.pending ?? 0} />
          <Kpi label="Latest match" value={date(recent[0]?.start_time)} />
          <Kpi label="Last update" value={date(status.lastIngest)} />
        </div>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
          <Section title="Latest results" action={<Button asChild variant="ghost" size="sm"><a href="/matches">All matches<ArrowRight /></a></Button>} flush>
            <SeriesTable rows={recent} compact />
          </Section>
          <div className="grid content-start gap-4 sm:grid-cols-2 xl:grid-cols-1">
            <Leaders title="Win % after first kill" rows={spot.fkTeams} m={TM.fk_conv} kind="team" />
            <Leaders title="Retake win %" rows={spot.retakeTeams} m={TM.retake} kind="team" />
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Leaders title="KAS (no trades)" rows={spot.kasPlayers} m={PM.kas} kind="player" />
          <Leaders title="Survival rate" rows={spot.survPlayers} m={PM.surv} kind="player" />
        </div>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ leaderboards

export function Leaderboards({ kind, rows, period, sort, dir, min }: {
  kind: "teams" | "players"; rows: Row[]; period: Period; sort: string; dir: "asc" | "desc"; min: number;
}) {
  const params = { kind, period, sort, dir, min: String(min) };
  const nameCol: Col = kind === "teams"
    ? { key: "name", label: "Team", pin: true, minW: 100, render: (r) => <TeamLink id={r.team_id} name={r.name} /> }
    : { key: "name", label: "Player", pin: true, minW: 100, render: (r) => <PlayerLink id={r.player_id} name={r.name} /> };
  const cols: Col[] = [
    { key: "rank", label: "#", num: true, pin: true, render: (r) => <span className="text-muted-foreground">{r.__rank}</span> },
    nameCol,
    ...(kind === "players" ? [{ key: "team_name", label: "Team", render: (r: Row) => (r.last_team_id ? <TeamLink id={r.last_team_id} name={r.team_name} /> : "–") }] : []),
    { key: kind === "teams" ? "maps" : "rounds", label: kind === "teams" ? "Maps" : "Rounds", num: true },
    ...(kind === "teams" ? TEAM_METRICS : PLAYER_METRICS).map((m) => metricCol(m, true)),
  ];
  const ranked = rows.map((r, i) => ({ ...r, __rank: i + 1 }));
  return (
    <>
      <PageHeader crumbs={["Leaders"]} title={kind === "teams" ? "Team leaderboard" : "Player leaderboard"}
        meta={[`${rows.length} ${kind}`, `Sorted by ${sort} ${dir}`]}
        aside={<>
          <Seg label="Leaderboard type" items={[
            { href: withParams("/leaderboards", {}, { kind: "teams", period }), label: "Teams", on: kind === "teams" },
            { href: withParams("/leaderboards", {}, { kind: "players", period }), label: "Players", on: kind === "players" },
          ]} />
          <PeriodTabs path="/leaderboards" period={period} params={params} />
          <form className="flex items-center gap-2" method="get" action="/leaderboards">
            <input type="hidden" name="kind" value={kind} /><input type="hidden" name="period" value={period} />
            <input type="hidden" name="sort" value={sort} /><input type="hidden" name="dir" value={dir} />
            <label className="text-sm text-muted-foreground" htmlFor="lb-min">Min {kind === "teams" ? "maps" : "rounds"}</label>
            <Input id="lb-min" className="h-8 w-20" name="min" type="number" min={1} defaultValue={String(min)} />
            <Button size="sm" variant="outline" type="submit">Apply</Button>
          </form>
        </>} />
      <Section title="Ranking" description="Click a header to sort, hover for its definition." flush>
        <DataTable cols={cols} rows={ranked} sort={{ key: sort, dir }} path="/leaderboards" params={params} />
      </Section>
    </>
  );
}

// ------------------------------------------------------------------ search
// The command palette reads this page's links (data-result) for live results.

export function SearchPage({ q, teams, players }: { q: string; teams: Row[]; players: Row[] }) {
  return (
    <>
      <PageHeader crumbs={["Search"]} title={q ? `“${q}”` : "Search"} meta={[`${teams.length} teams`, `${players.length} players`]}
        aside={
          <form method="get" action="/search">
            <Input className="h-8 w-64" type="search" name="q" defaultValue={q} placeholder="Team or player…" aria-label="Search teams and players" />
          </form>
        } />
      <div className="grid gap-4 md:grid-cols-2">
        <Section title="Teams" description={String(teams.length)} flush>
          {teams.length ? teams.map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-4 border-b px-4 py-2 text-sm last:border-b-0 sm:px-6">
              <a className="font-medium hover:underline" data-result="team" href={`/team/${t.id}`}>{t.name}</a>
              <ArrowRight className="size-3.5 text-muted-foreground" />
            </div>
          )) : <Empty>No teams.</Empty>}
        </Section>
        <Section title="Players" description={String(players.length)} flush>
          {players.length ? players.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-4 border-b px-4 py-2 text-sm last:border-b-0 sm:px-6">
              <a className="font-medium hover:underline" data-result="player" data-sub={p.team_name ?? undefined} href={`/player/${p.id}`}>{p.name}</a>
              <span className="text-muted-foreground">{p.team_name}</span>
            </div>
          )) : <Empty>No players.</Empty>}
        </Section>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ about

export function About({ siteName }: { siteName: string }) {
  const defs = (ms: readonly Metric[]): Row[] => ms.map((m) => ({ label: m.label, short: m.short, desc: m.desc }));
  const cols: Col[] = [
    { key: "short", label: "Column", render: (r) => <span className="font-mono">{r.short}</span> },
    { key: "label", label: "Metric", minW: 130 },
    { key: "desc", label: "Definition", minW: 160, prose: true, pin: true, render: (r) => <span className="text-muted-foreground">{r.desc}</span> },
  ];
  return (
    <>
      <PageHeader crumbs={["About"]} title={`About ${siteName}`} meta={["Non-commercial fan project", "Data delayed"]} />
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <Section title="What this is">
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                {siteName} breaks VALORANT esports matches down to the round: how each round ended, who got the opening kill,
                whether the spike went down, who survived. Stats are aggregated per team, player and map from official match data.
              </p>
              <p>Pistol rounds are rounds 1 and 13. Overtime is any round after 24. “Comeback” and “blown lead” use a 5-round margin.</p>
            </div>
          </Section>
          <Section title="What the data can't show" flush>
            <KV label="Economy / buy types" value="Not available" />
            <KV label="Trades and clutches (kill order)" value="Not available" />
            <KV label="Positions / heatmaps" value="Last position only" />
            <KV label="Live data" value="Delayed a few hours" />
          </Section>
        </div>
        <Section title="Team metrics" flush><DataTable cols={cols} rows={defs(TEAM_METRICS)} /></Section>
        <Section title="Player metrics" flush><DataTable cols={cols} rows={defs(PLAYER_METRICS)} /></Section>
        <Section title="Map metrics" flush><DataTable cols={cols} rows={defs(MAP_METRICS)} /></Section>
      </div>
    </>
  );
}

export const NotFound = () => (
  <>
    <PageHeader crumbs={["404"]} title="Not found" meta={["Page missing or match not imported yet"]} />
    <Section title="404"><Empty>That page doesn't exist. <a className="underline" href="/">Back to the overview</a>.</Empty></Section>
  </>
);
