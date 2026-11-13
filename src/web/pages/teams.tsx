import { useState } from "react";
import { ChevronsUpDown } from "lucide-react";
import { byKey, PLAYER_METRICS, TEAM_METRICS } from "../../stats/metrics";
import type { Period } from "../../stats/periods";
import type { Row } from "../../stats/queries";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CompareTable, TeamWinConditions } from "@/components/charts";
import {
  DataTable, Empty, KV, Kpis, MapLink, metricCol, MetricKV, PageHeader, PeriodTabs, PlayerLink, Section, TeamBadge, TeamLink, wl, type Col,
} from "@/components/site";
import { date, fmt, title, eventName } from "@/lib/format";

const TM = byKey(TEAM_METRICS);
const PM = byKey(PLAYER_METRICS);

export function TeamList({ rows, period, q }: { rows: Row[]; period: Period; q: string }) {
  const cols: Col[] = [
    { key: "name", label: "Team", render: (r) => <span className="inline-flex items-center gap-2"><TeamBadge name={r.name} /><TeamLink id={r.team_id} name={r.name} /></span> },
    { key: "maps", label: "Maps", num: true },
    ...[TM.map_wr, TM.atk_rw, TM.def_rw, TM.pistol_wr, TM.postplant, TM.retake, TM.fk_conv].map((m) => metricCol(m)),
  ];
  return (
    <>
      <PageHeader crumbs={["Teams"]} title="Teams" meta={[`${rows.length} teams`]}
        aside={<>
          <form method="get" action="/teams">
            <input type="hidden" name="period" value={period} />
            <Input className="h-8 w-56" type="search" name="q" defaultValue={q} placeholder="Filter…" aria-label="Filter teams" />
          </form>
          <PeriodTabs path="/teams" period={period} params={{ q }} />
        </>} />
      <Section title="All teams" description="Click a header to sort, hover it for the definition." flush><DataTable cols={cols} rows={rows} /></Section>
    </>
  );
}

export interface TeamPageData {
  team: Row;
  summary: Row | null;
  losses: Row | null;
  byMap: Row[];
  roster: Row[];
  recent: Row[];
}

export function TeamPage({ d, period }: { d: TeamPageData; period: Period }) {
  const s = d.summary;
  const hasData = !!s && s.maps > 0;
  const mapCols: Col[] = [
    { key: "map", label: "Map", render: (r) => <MapLink map={r.map} period={period} /> },
    { key: "maps", label: "Played", num: true },
    { key: "wl", label: "W–L", num: true, sortBy: (r) => r.map_wins, render: (r) => `${r.map_wins}–${r.maps - r.map_wins}` },
    ...[TM.map_wr, TM.atk_rw, TM.def_rw, TM.pistol_wr, TM.conv, TM.plant_rate, TM.postplant, TM.retake, TM.fk_conv, TM.fd_rec, TM.orb_share].map((m) => metricCol(m)),
  ];
  const rosterCols: Col[] = [
    { key: "name", label: "Player", render: (r) => <PlayerLink id={r.player_id} name={r.name} /> },
    { key: "maps", label: "Maps", num: true },
    ...[PM.kpr, PM.adr, PM.dtr, PM.surv, PM.kas, PM.fk_pr, PM.fk_conv, PM.atk_kpr, PM.def_kpr, PM.mk_rate].map((m) => metricCol(m)),
  ];
  const recentCols: Col[] = [
    { key: "start_time", label: "Date", render: (r) => <a className="text-muted-foreground hover:underline" href={`/match/${r.series_id}`}>{date(r.start_time)}</a> },
    { key: "opp_name", label: "Opponent", render: (r) => <TeamLink id={r.opponent_id} name={r.opp_name} /> },
    { key: "map", label: "Map", render: (r) => title(r.map) },
    { key: "score", label: "Score", num: true, render: (r) => <span className={wl(r.won)}>{r.score}–{r.opp_score}</span> },
    { key: "side", label: "Start", render: (r) => <span className="text-muted-foreground capitalize">{r.start_side ?? "–"}</span> },
    { key: "atk", label: "ATK", num: true, sortBy: (r) => r.atk_wins / (r.atk_rounds || 1), render: (r) => `${r.atk_wins}/${r.atk_rounds}` },
    { key: "def", label: "DEF", num: true, sortBy: (r) => r.def_wins / (r.def_rounds || 1), render: (r) => `${r.def_wins}/${r.def_rounds}` },
    { key: "pistols", label: "Pistols", num: true, sortBy: (r) => r.pistol_wins, render: (r) => `${r.pistol_wins}/${r.pistol_rounds}` },
    { key: "lead", label: "Max lead / deficit", num: true, sortBy: (r) => r.max_lead, render: (r) => `+${r.max_lead} / −${r.max_deficit}` },
    { key: "tournament", label: "Event", render: (r) => <span className="text-muted-foreground" title={r.tournament}>{eventName(r.tournament)}</span> },
  ];

  return (
    <>
      <PageHeader
        crumbs={[["Teams", "/teams"], d.team.name]}
        title={<span className="inline-flex items-center gap-2.5"><TeamBadge name={d.team.name} side="a" />{d.team.name}</span>}
        meta={hasData ? [`${s.map_wins}W ${s.maps - s.map_wins}L`, `${s.maps} maps`, `${s.rounds} rounds`] : ["No maps in this period"]}
        aside={<>
          <PeriodTabs path={`/team/${d.team.id}`} period={period} params={{}} />
          <Button asChild variant="outline" size="sm"><a href={`/compare?a=${d.team.id}`}>Compare</a></Button>
        </>}
      />
      {!hasData ? <Section title="Summary"><Empty>No maps for this team in the selected period.</Empty></Section> : (
        <div className="space-y-4">
          <Kpis row={s} metrics={[TM.map_wr, TM.atk_rw, TM.def_rw, TM.pistol_wr, TM.postplant, TM.retake, TM.fk_conv, TM.fd_rec]} />
          <TeamWinConditions s={s} losses={d.losses} />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Section title="Pistols & momentum" flush>
              <MetricKV m={TM.pistol_atk_wr} r={s} /><MetricKV m={TM.pistol_def_wr} r={s} />
              <MetricKV m={TM.conv} r={s} /><MetricKV m={TM.bounce} r={s} />
              <MetricKV m={TM.comebacks} r={s} /><MetricKV m={TM.blown} r={s} />
              <KV label="Overtime record" value={`${s.ot_wins}–${s.overtime - s.ot_wins}`} hint={TM.ot_wr.desc} />
            </Section>
            <Section title="Spike play" flush>
              <MetricKV m={TM.plant_rate} r={s} /><MetricKV m={TM.postplant} r={s} />
              <MetricKV m={TM.retake} r={s} /><MetricKV m={TM.defuse_share} r={s} />
              <MetricKV m={TM.abandoned} r={s} />
              <KV label="Half-defuses / enemy plant" hint="Defuses that reached the halfway checkpoint, per opponent plant"
                value={fmt(s.opp_plants ? s.defuse_halfway / s.opp_plants : null, "dec2")} />
            </Section>
            <Section title="Openings" flush>
              <MetricKV m={TM.fk_rate} r={s} /><MetricKV m={TM.fk_conv} r={s} /><MetricKV m={TM.fd_rec} r={s} />
            </Section>
            <Section title="Control & discipline" flush>
              <MetricKV m={TM.orb_share} r={s} /><MetricKV m={TM.orbs_pr} r={s} />
              <MetricKV m={TM.flawless} r={s} /><MetricKV m={TM.saves} r={s} />
              <MetricKV m={TM.team_adr} r={s} /><MetricKV m={TM.dmg_ratio} r={s} />
            </Section>
          </div>
          <Section title="Map pool" description={`${d.byMap.length} maps`} flush><DataTable cols={mapCols} rows={d.byMap} /></Section>
          <Section title="Roster" description={`${d.roster.length} players`} flush><DataTable cols={rosterCols} rows={d.roster} /></Section>
        </div>
      )}
      <div className="mt-4"><Section title="Recent maps" flush><DataTable cols={recentCols} rows={d.recent} /></Section></div>
    </>
  );
}

const VS_METRICS = TEAM_METRICS.filter((m) => !["comebacks", "blown"].includes(m.key));

/** Searchable team picker (shadcn combobox). Submits the team id under `name`. */
function TeamPicker({ name, label, teams, selected }: { name: string; label: string; teams: Row[]; selected?: Row | null }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<{ id: string; name: string } | null>(selected ? { id: selected.id, name: selected.name } : null);
  return (
    <>
      <input type="hidden" name={name} value={value?.id ?? ""} />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" role="combobox" aria-expanded={open} aria-label={label} className="w-56 justify-between font-normal">
            <span className={value ? "truncate" : "text-muted-foreground"}>{value?.name ?? `${label}…`}</span>
            <ChevronsUpDown className="opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-0">
          <Command>
            <CommandInput placeholder="Search teams…" />
            <CommandList>
              <CommandEmpty>No teams match.</CommandEmpty>
              {teams.map((t) => (
                <CommandItem key={t.team_id} value={`${t.name} ${t.team_id}`} onSelect={() => { setValue({ id: t.team_id, name: t.name }); setOpen(false); }}>
                  {t.name}
                </CommandItem>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </>
  );
}

export function ComparePage({ teams, a, b, sa, sb, period }: {
  teams: Row[]; a: Row | null; b: Row | null; sa: Row | null; sb: Row | null; period: Period;
}) {
  const ready = a && b && sa && sb;
  return (
    <>
      <PageHeader crumbs={["Compare"]} title={ready ? `${a.name} vs ${b.name}` : "Team vs team"}
        meta={ready ? [`${sa.maps} vs ${sb.maps} maps`] : ["Pick two teams"]}
        aside={<PeriodTabs path="/compare" period={period} params={{ a: a?.id, b: b?.id }} />} />
      <form className="mb-4 flex flex-wrap items-center gap-2" method="get" action="/compare">
        <input type="hidden" name="period" value={period} />
        <TeamPicker name="a" label="First team" teams={teams} selected={a} />
        <span className="text-sm text-muted-foreground">vs</span>
        <TeamPicker name="b" label="Second team" teams={teams} selected={b} />
        <Button type="submit">Compare</Button>
      </form>
      {ready ? (
        <Section title="Head to head" description={`${a.name} vs ${b.name} · higher value is bold`} flush>
          <CompareTable a={a.name} b={b.name} rows={[
            ...VS_METRICS.map((m) => ({ label: m.label, a: sa[m.key], b: sb[m.key], f: m.fmt, desc: m.desc })),
            { label: "Comebacks (from −5)", a: sa.comebacks, b: sb.comebacks, f: "int" as const },
            { label: "Blown leads (from +5)", a: sa.blown_leads, b: sb.blown_leads, f: "int" as const },
          ]} />
        </Section>
      ) : <Section title="Head to head"><Empty>Pick two teams to compare.</Empty></Section>}
    </>
  );
}
