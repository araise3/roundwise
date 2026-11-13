import { byKey, MAP_METRICS, TEAM_METRICS } from "../../stats/metrics";
import type { Period } from "../../stats/periods";
import type { Row } from "../../stats/queries";
import { StackedBar, WT } from "@/components/charts";
import { DataTable, Empty, Kpis, MapLink, metricCol, PageHeader, PeriodTabs, Section, TeamLink, type Col } from "@/components/site";
import { title } from "@/lib/format";

const MM = byKey(MAP_METRICS);
const TM = byKey(TEAM_METRICS);

export function MapList({ rows, period }: { rows: Row[]; period: Period }) {
  const cols: Col[] = [
    { key: "map", label: "Map", render: (r) => <MapLink map={r.map} period={period} /> },
    { key: "maps", label: "Played", num: true },
    ...MAP_METRICS.map((m) => metricCol(m)),
  ];
  return (
    <>
      <PageHeader crumbs={["Maps"]} title="Map meta" meta={[`${rows.length} maps`]}
        aside={<PeriodTabs path="/maps" period={period} params={{}} />} />
      <Section title="All maps" description="Click a header to sort, hover it for the definition." flush>
        <DataTable cols={cols} rows={rows} empty="Map aggregates are built every few hours once matches are imported." />
      </Section>
    </>
  );
}

export function MapPage({ map, s, teams, period }: { map: string; s: Row | null; teams: Row[]; period: Period }) {
  const cols: Col[] = [
    { key: "name", label: "Team", render: (r) => <TeamLink id={r.team_id} name={r.name} /> },
    { key: "maps", label: "Played", num: true },
    { key: "wl", label: "W–L", num: true, sortBy: (r) => r.map_wins, render: (r) => `${r.map_wins}–${r.maps - r.map_wins}` },
    ...[TM.map_wr, TM.atk_rw, TM.def_rw, TM.pistol_wr, TM.plant_rate, TM.postplant, TM.retake, TM.fk_conv].map((m) => metricCol(m)),
  ];
  return (
    <>
      <PageHeader crumbs={[["Maps", "/maps"], title(map)]} title={title(map)}
        meta={s ? [`${s.maps} maps`, `${s.atk_rounds} rounds`] : ["No data"]}
        aside={<PeriodTabs path={`/map/${encodeURIComponent(map)}`} period={period} params={{}} />} />
      {!s ? <Section title="Summary"><Empty>No data for this map in the selected period.</Empty></Section> : (
        <div className="space-y-4">
          <Kpis row={s} metrics={[MM.atk_rw, MM.pistol_atk_wr, MM.plant_rate, MM.postplant, MM.fk_conv, MM.conv, MM.ot_rate, MM.avg_rounds]} />
          <div className="grid gap-4 md:grid-cols-2">
            <Section title="How rounds end">
              <StackedBar label="All rounds" total={s.atk_rounds} segments={[
                { label: "Atk elim", value: s.win_elim_atk, cls: WT.elim },
                { label: "Detonate", value: s.win_boom_atk, cls: WT.boom },
                { label: "Def elim", value: s.win_elim_def, cls: WT.elim2 },
                { label: "Defuse", value: s.win_defuse_def, cls: WT.defuse },
                { label: "Time", value: s.win_time_def, cls: WT.time },
              ]} />
            </Section>
            <Section title="After a plant">
              <StackedBar label="Plants" total={s.plants} segments={[
                { label: "Atk holds", value: s.plant_wins, cls: WT.boom },
                { label: "Def retakes", value: s.plants - s.plant_wins, cls: WT.defuse },
              ]} />
            </Section>
          </div>
          <Section title="Teams on this map" description="Min. 3 maps" flush><DataTable cols={cols} rows={teams} /></Section>
        </div>
      )}
    </>
  );
}
