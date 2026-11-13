import { ArrowLeft, ArrowRight } from "lucide-react";
import { byKey, PLAYER_METRICS, TEAM_METRICS } from "../../stats/metrics";
import type { Row } from "../../stats/queries";
import { Button } from "@/components/ui/button";
import { CompareTable, mapNotes, RoundStrip, ScoreFlow } from "@/components/charts";
import {
  DataTable, Empty, PageHeader, PlayerLink, Section, Swatch, TeamBadge, TeamLink, type Col,
} from "@/components/site";
import { date, eventName, title } from "@/lib/format";
import { cn } from "@/lib/utils";

const TM = byKey(TEAM_METRICS);
const PM = byKey(PLAYER_METRICS);

/** Map scores from team 1's perspective: "Fracture 9–13 · Lotus 12–14". */
const mapScores = (s: Row) =>
  (s.maps as Row[]).map((m) => `${title(m.map)} ${m.scores[s.team1_id] ?? "?"}–${m.scores[s.team2_id] ?? "?"}`).join(" · ");

export function SeriesList({ rows, page, hasMore }: { rows: Row[]; page: number; hasMore: boolean }) {
  return (
    <>
      <PageHeader crumbs={["Matches"]} title="Matches" meta={[`Page ${page}`, "Newest first"]}
        aside={<>
          {page > 1 && <Button asChild variant="outline" size="sm"><a href={`/matches?page=${page - 1}`}><ArrowLeft />Newer</a></Button>}
          {hasMore && <Button asChild variant="outline" size="sm"><a href={`/matches?page=${page + 1}`}>Older<ArrowRight /></a></Button>}
        </>} />
      <Section title="Results" description={`${rows.length} series`} flush><SeriesTable rows={rows} /></Section>
    </>
  );
}

/** Series results. Team names wrap on narrow screens; date, maps and event drop first. */
const SERIES_COLS: Col[] = [
  { key: "start_time", label: "Date", pin: false, priority: 3,
    render: (s) => <a className="text-muted-foreground hover:underline" href={`/match/${s.id}`}>{date(s.start_time)}</a> },
  { key: "t1_name", label: "Team", pin: true, minW: 110, className: "text-right",
    render: (s) => (
      <span className={cn("inline-flex items-center justify-end gap-2", s.winner_id !== s.team1_id && "text-muted-foreground")}>
        <TeamLink id={s.team1_id} name={s.t1_name} /><span className="hidden sm:contents"><TeamBadge name={s.t1_name} side="a" /></span>
      </span>
    ) },
  { key: "score", label: "Score", pin: true, noSort: true, className: "text-center",
    render: (s) => (
      <a href={`/match/${s.id}`} className="inline-flex gap-1 rounded-md bg-muted px-2 py-0.5 font-mono tabular-nums hover:bg-accent">
        <span className={s.winner_id === s.team1_id ? "font-semibold" : "text-muted-foreground"}>{s.team1_score ?? "–"}</span>
        <span className="text-muted-foreground">:</span>
        <span className={s.winner_id === s.team2_id ? "font-semibold" : "text-muted-foreground"}>{s.team2_score ?? "–"}</span>
      </a>
    ) },
  { key: "t2_name", label: "Team", pin: true, minW: 110,
    render: (s) => (
      <span className={cn("inline-flex items-center gap-2", s.winner_id !== s.team2_id && "text-muted-foreground")}>
        <span className="hidden sm:contents"><TeamBadge name={s.t2_name} side="b" /></span><TeamLink id={s.team2_id} name={s.t2_name} />
      </span>
    ) },
  { key: "maps", label: "Maps", priority: 4, noSort: true, render: (s) => <span className="text-muted-foreground">{mapScores(s)}</span> },
  { key: "tournament", label: "Event", priority: 5,
    render: (s) => <span className="block max-w-[16rem] truncate text-muted-foreground" title={s.tournament}>{eventName(s.tournament)}</span> },
];

/** `compact` (home page) leaves out the event column. */
export function SeriesTable({ rows, compact }: { rows: Row[]; compact?: boolean }) {
  const cols = compact ? SERIES_COLS.filter((c) => c.key !== "tournament") : SERIES_COLS;
  return <DataTable cols={cols} rows={rows} empty="No matches imported yet. The importer runs every minute." />;
}

const COMPARE = [
  TM.atk_rw, TM.def_rw, TM.pistol_wr, TM.conv, TM.fk_conv, TM.fd_rec,
  TM.plant_rate, TM.postplant, TM.retake, TM.flawless, TM.saves, TM.orb_share, TM.dmg_ratio,
];

function topWeapons(json: string) {
  try {
    const w = Object.entries(JSON.parse(json || "{}") as Record<string, number>).sort((a, b) => b[1] - a[1]).slice(0, 3);
    return w.length ? w.map(([k, v]) => `${title(k)} ${v}`).join(", ") : "–";
  } catch {
    return "–";
  }
}

export function SeriesDetail({ data }: { data: { series: Row; games: Row[] } }) {
  const { series: s, games } = data;
  const names: Record<string, string> = { [s.team1_id]: s.t1_name, [s.team2_id]: s.t2_name };
  const t1 = s.winner_id === s.team1_id;
  const t2 = s.winner_id === s.team2_id;
  const playerCols: Col[] = [
    { key: "name", label: "Player", render: (r) => <PlayerLink id={r.player_id} name={r.name} /> },
    { key: "agent", label: "Agent", render: (r) => <span className="text-muted-foreground">{title(r.agent)}</span> },
    { key: "kills", label: "K", num: true },
    { key: "deaths", label: "D", num: true },
    { key: "assists", label: "A", num: true },
    { key: "adr", label: "ADR", num: true, fmt: "dec1", hint: PM.adr.desc },
    { key: "dtr", label: "DTR", num: true, fmt: "dec1", hint: PM.dtr.desc },
    { key: "surv", label: "Surv%", num: true, fmt: "pct", hint: PM.surv.desc },
    { key: "kas", label: "KAS%", num: true, fmt: "pct", hint: PM.kas.desc },
    { key: "fk", label: "FK", num: true, hint: "Opening kills" },
    { key: "fk_conv", label: "FK→W", num: true, fmt: "pct", hint: PM.fk_conv.desc },
    { key: "mk", label: "2K/3K/4K/5K", num: true, sortBy: (r) => r.mk2 + r.mk3 + r.mk4 + r.mk5, render: (r) => `${r.mk2}/${r.mk3}/${r.mk4}/${r.mk5}` },
    { key: "atk_kpr", label: "ATK KPR", num: true, fmt: "dec2", hint: PM.atk_kpr.desc },
    { key: "def_kpr", label: "DEF KPR", num: true, fmt: "dec2", hint: PM.def_kpr.desc },
    { key: "weapons", label: "Top weapons", noSort: true, render: (r) => <span className="text-muted-foreground">{topWeapons(r.weapons)}</span> },
  ];

  return (
    <>
      <PageHeader
        crumbs={[["Matches", "/matches"], s.tournament ? eventName(s.tournament) : "Match"]}
        title={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className={cn("inline-flex items-center gap-2", !t1 && "text-muted-foreground")}>
              <TeamBadge name={s.t1_name} side="a" /><TeamLink id={s.team1_id} name={s.t1_name} />
            </span>
            <span className="rounded-md border px-2 font-mono tabular-nums">
              <span className={t1 ? "" : "text-muted-foreground"}>{s.team1_score}</span>
              <span className="px-1 text-muted-foreground">:</span>
              <span className={t2 ? "" : "text-muted-foreground"}>{s.team2_score}</span>
            </span>
            <span className={cn("inline-flex items-center gap-2", !t2 && "text-muted-foreground")}>
              <TeamLink id={s.team2_id} name={s.t2_name} /><TeamBadge name={s.t2_name} side="b" />
            </span>
          </span>
        }
        meta={[date(s.start_time), s.format ? s.format.toUpperCase() : "", ...games.map((g) => {
          const sc = (id: string) => g.teams.find((t: Row) => t.team_id === id)?.score ?? "?";
          return `${title(g.map)} ${sc(s.team1_id)}–${sc(s.team2_id)}${g.overtime ? " OT" : ""}`;
        })]}
      />
      <div className="space-y-8">
        {games.map((g) => {
          const ta = g.teams.find((t: Row) => t.team_id === s.team1_id) ?? g.teams[0];
          const tb = g.teams.find((t: Row) => t.team_id !== ta?.team_id);
          const teamA = ta?.team_id ?? s.team1_id;
          const notes = [`${names[ta?.team_id]} start ${ta?.start_side ?? "?"}`, ...mapNotes(g.rounds, names)];
          return (
            <section key={g.seq} className="space-y-4">
              <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_440px]">
                <Section title={`Map ${g.seq} · ${title(g.map)}`}
                  action={<span className="font-mono text-sm tabular-nums"><span className="inline-flex items-center gap-1.5"><Swatch side="a" />{ta?.score ?? "?"}</span> – <span className="inline-flex items-center gap-1.5">{tb?.score ?? "?"}<Swatch side="b" /></span>{g.overtime ? " · OT" : ""}</span>}>
                  <RoundStrip rounds={g.rounds} teamA={teamA} names={names} />
                  <div className="mt-4 border-t pt-4"><ScoreFlow rounds={g.rounds} teamA={teamA} names={names} /></div>
                  <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">{notes.map((n) => <li key={n}>{n}</li>)}</ul>
                </Section>
                {ta && tb && (
                  <Section title="Team comparison" description={`${names[ta.team_id]} vs ${names[tb.team_id]}`} flush>
                    <CompareTable a={names[ta.team_id]} b={names[tb.team_id]} rows={[
                      ...COMPARE.map((m) => ({ label: m.label, a: ta[m.key], b: tb[m.key], f: m.fmt, desc: m.desc })),
                      { label: "Biggest lead", a: ta.max_lead, b: tb.max_lead, f: "int" as const },
                      { label: "Longest streak", a: ta.best_streak, b: tb.best_streak, f: "int" as const },
                      { label: "Defuses stopped", a: ta.defuse_stops, b: tb.defuse_stops, f: "int" as const, desc: TM.abandoned.desc },
                    ]} />
                  </Section>
                )}
              </div>
              {[ta, tb].filter(Boolean).map((t) => (
                <Section key={t.team_id} flush description={title(g.map)}
                  title={<span className="inline-flex items-center gap-2"><TeamBadge name={names[t.team_id]} side={t.team_id === teamA ? "a" : "b"} />{names[t.team_id]}</span>}>
                  <DataTable cols={playerCols} rows={g.players.filter((p: Row) => p.team_id === t.team_id)} />
                </Section>
              ))}
            </section>
          );
        })}
      </div>
      {!games.length && <Section title="Maps"><Empty>No round data for this match.</Empty></Section>}
    </>
  );
}
