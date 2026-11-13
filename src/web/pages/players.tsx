import { byKey, PLAYER_METRICS } from "../../stats/metrics";
import type { Period } from "../../stats/periods";
import type { Row } from "../../stats/queries";
import { Input } from "@/components/ui/input";
import { BarList } from "@/components/charts";
import {
  DataTable, Empty, hasVlr, KV, Kpis, MapLink, metricCol, MetricKV, PageHeader, PeriodTabs, PlayerLink, Section, TeamLink, wl, type Col,
} from "@/components/site";
import { date, div, fmt, title } from "@/lib/format";

const PM = byKey(PLAYER_METRICS);

export function PlayerList({ rows, period, q }: { rows: Row[]; period: Period; q: string }) {
  const cols: Col[] = [
    { key: "name", label: "Player", render: (r) => <PlayerLink id={r.player_id} name={r.name} /> },
    { key: "team_name", label: "Team", render: (r) => (r.last_team_id ? <TeamLink id={r.last_team_id} name={r.team_name} /> : "–") },
    { key: "rounds", label: "Rounds", num: true },
    ...[...(hasVlr(rows) ? [PM.rating, PM.acs, PM.kast] : []), PM.kpr, PM.adr, PM.surv, PM.kas, PM.fk_pr, PM.fk_conv, PM.dmg_ratio].map((m) => metricCol(m)),
  ];
  return (
    <>
      <PageHeader crumbs={["Players"]} title="Players" meta={[`${rows.length} players`, "Min. 50 rounds"]}
        aside={<>
          <form method="get" action="/players">
            <input type="hidden" name="period" value={period} />
            <Input className="h-8 w-56" type="search" name="q" defaultValue={q} placeholder="Filter…" aria-label="Filter players" />
          </form>
          <PeriodTabs path="/players" period={period} params={{ q }} />
        </>} />
      <Section title="All players" description="Click a header to sort, hover it for the definition." flush><DataTable cols={cols} rows={rows} /></Section>
    </>
  );
}

export interface PlayerPageData {
  player: Row;
  summary: Row | null;
  byMap: Row[];
  byAgent: Row[];
  weapons: Row[];
  recent: Row[];
}

export function PlayerPage({ d, period }: { d: PlayerPageData; period: Period }) {
  const s = d.summary;
  const hasData = !!s && s.rounds > 0;
  const vlr = hasData && hasVlr([s]);
  const totalWeaponKills = d.weapons.reduce((n, w) => n + w.kills, 0);
  const splitCols: Col[] = [
    { key: "side", label: "Side" },
    { key: "rounds", label: "Rounds", num: true },
    { key: "kpr", label: "KPR", num: true, fmt: "dec2" },
    { key: "dpr", label: "DPR", num: true, fmt: "dec2" },
    { key: "adr", label: "ADR", num: true, fmt: "dec1" },
    { key: "surv", label: "Survival", num: true, fmt: "pct" },
    ...(vlr ? [{ key: "rating", label: "Rating", num: true, fmt: "dec2", hint: PM.atk_rating.desc } as Col] : []),
  ];
  const splits = hasData ? [
    { side: "Attack", rounds: s.atk_rounds, kpr: div(s.atk_kills, s.atk_rounds), dpr: div(s.atk_deaths, s.atk_rounds), adr: div(s.atk_damage, s.atk_rounds), surv: div(s.atk_survived, s.atk_rounds), rating: s.atk_rating },
    { side: "Defense", rounds: s.def_rounds, kpr: div(s.def_kills, s.def_rounds), dpr: div(s.def_deaths, s.def_rounds), adr: div(s.def_damage, s.def_rounds), surv: div(s.def_survived, s.def_rounds), rating: s.def_rating },
    { side: "Pistol rounds", rounds: s.pistol_rounds, kpr: div(s.pistol_kills, s.pistol_rounds), dpr: null, adr: null, surv: div(s.pistol_survived, s.pistol_rounds), rating: null },
  ] : [];
  const breakdownCols = (label: string, render: (r: Row) => React.ReactNode): Col[] => [
    { key: "k", label, render },
    { key: "maps", label: "Maps", num: true },
    { key: "wr", label: "Map W%", num: true, sortBy: (r) => div(r.map_wins, r.maps), render: (r) => fmt(div(r.map_wins, r.maps), "pct") },
    ...[...(vlr ? [PM.rating, PM.acs] : []), PM.kpr, PM.adr, PM.dtr, PM.surv, PM.kas, PM.fk_pr, PM.fk_conv].map((m) => metricCol(m)),
  ];
  const recentCols: Col[] = [
    { key: "start_time", label: "Date", render: (r) => <a className="text-muted-foreground hover:underline" href={`/match/${r.series_id}`}>{date(r.start_time)}</a> },
    { key: "opp_name", label: "Opponent" },
    { key: "map", label: "Map", render: (r) => title(r.map) },
    { key: "agent", label: "Agent", render: (r) => <span className="text-muted-foreground">{title(r.agent)}</span> },
    { key: "res", label: "Result", sortBy: (r) => r.won_map, render: (r) => <span className={wl(r.won_map)}>{r.won_map ? "W" : "L"}</span> },
    { key: "kda", label: "K/D/A", num: true, sortBy: (r) => r.kills, render: (r) => `${r.kills}/${r.deaths}/${r.assists}` },
    ...[...(hasVlr(d.recent) ? [PM.rating, PM.acs] : []), PM.adr, PM.surv, PM.kas].map((m) => metricCol(m)),
    { key: "fk", label: "FK", num: true },
  ];

  return (
    <>
      <PageHeader
        crumbs={[["Players", "/players"], d.player.name]}
        title={d.player.name}
        meta={[
          d.player.last_team_id ? <TeamLink id={d.player.last_team_id} name={d.player.team_name ?? "Team"} /> : "",
          hasData ? `${s.rounds} rounds` : "No rounds in this period",
          hasData ? `${s.maps} maps` : "",
        ]}
        aside={<PeriodTabs path={`/player/${d.player.id}`} period={period} params={{}} />}
      />
      {!hasData ? <Section title="Summary"><Empty>No rounds for this player in the selected period.</Empty></Section> : (
        <div className="space-y-4">
          <Kpis row={s} metrics={vlr
            ? [PM.rating, PM.acs, PM.kast, PM.adr, PM.kpr, PM.fk_pr, PM.fk_conv, PM.surv]
            : [PM.kpr, PM.adr, PM.kas, PM.surv, PM.fk_pr, PM.fk_conv, PM.dtr, PM.dmg_ratio]} />
          <div className="grid gap-4 lg:grid-cols-3">
            <Section title="Side split" flush className="lg:col-span-2"><DataTable cols={splitCols} rows={splits} /></Section>
            <Section title="Multi-kills" description="Rounds with N kills · per 100 rounds">
              <BarList items={([["2K", s.mk2], ["3K", s.mk3], ["4K", s.mk4], ["Ace", s.mk5]] as const).map(([label, n]) => (
                { label, value: n, sub: fmt(div(n * 100, s.rounds), "dec1") }
              ))} />
            </Section>
          </div>
          <div className="grid items-start gap-4 lg:grid-cols-3">
            <Section title="Weapon mix" description={`${totalWeaponKills} kills`} className={vlr ? "lg:col-span-2" : "lg:col-span-3"}>
              {d.weapons.length
                ? <BarList items={d.weapons.slice(0, 12).map((w) => ({ label: title(w.weapon), value: w.kills, sub: fmt(div(w.kills, totalWeaponKills), "pct") }))} />
                : <Empty>No weapon data.</Empty>}
            </Section>
            {vlr && (
              <Section title="Clutches & economy" description="VCT matches, from vlr.gg" flush>
                <MetricKV m={PM.clutches} r={s} /><MetricKV m={PM.clutch_rate} r={s} /><MetricKV m={PM.econ} r={s} />
                <KV label="Plants / defuses" value={`${s.vlr_plants} / ${s.vlr_defuses}`} />
              </Section>
            )}
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            <Section title="By agent" flush><DataTable cols={breakdownCols("Agent", (r) => title(r.k))} rows={d.byAgent} /></Section>
            <Section title="By map" flush><DataTable cols={breakdownCols("Map", (r) => <MapLink map={r.k} period={period} />)} rows={d.byMap} /></Section>
          </div>
        </div>
      )}
      <div className="mt-4"><Section title="Recent maps" flush><DataTable cols={recentCols} rows={d.recent} /></Section></div>
    </>
  );
}
