/** Server-rendered charts (plain SVG / divs, no chart library). */
import { useId, type ReactNode } from "react";
import type { Metric } from "../../stats/metrics";
import type { Row } from "../../stats/queries";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmt, WIN_TYPE } from "@/lib/format";
import { cn } from "@/lib/utils";
import { flushTable, Hint, Section, Swatch, TeamBadge } from "./site";

/** Colours for how a round ended. */
export const WT = {
  elim: "bg-foreground/80",
  elim2: "bg-foreground/55",
  boom: "bg-foreground/35",
  defuse: "bg-foreground/20",
  time: "bg-transparent ring-1 ring-inset ring-foreground/40",
} as const;

export interface Segment { label: string; value: number; cls: string }

const pct = (v: number, d: number) => (d ? `${((100 * v) / d).toFixed(0)}%` : "–");

/** 100% stacked horizontal bar with legend. */
export function StackedBar({ label, segments, total }: { label: string; segments: Segment[]; total?: number }) {
  const sum = total ?? segments.reduce((n, s) => n + (s.value || 0), 0);
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between text-sm">
        <span>{label}</span>
        <span className="text-xs text-muted-foreground font-mono tabular-nums">{sum} rounds</span>
      </div>
      <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full" role="img"
        aria-label={`${label}: ${segments.map((s) => `${s.label} ${pct(s.value, sum)}`).join(", ")}`}>
        {segments.map((s) => s.value > 0 && (
          <span key={s.label} className={s.cls} style={{ flex: `${s.value} 1 0` }}
            title={`${s.label}: ${s.value} (${pct(s.value, sum)})`} />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {segments.map((s) => (
          <span key={s.label} className="inline-flex items-center gap-1.5">
            <i className={cn("size-2 rounded-full", s.cls)} />{s.label} <b className="font-medium text-foreground font-mono tabular-nums">{pct(s.value, sum)}</b>
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * Horizontal bar list (e.g. weapon mix). Rows share one grid (subgrid), so labels, values and
 * sub-values line up in columns and never wrap. Give either every item a `sub` or none.
 */
export function BarList({ items, max }: { items: { label: string; value: number; sub?: string }[]; max?: number }) {
  const m = max ?? Math.max(1, ...items.map((i) => i.value));
  const hasSub = items.some((i) => i.sub != null);
  return (
    <ul className={cn("grid items-center gap-x-3 gap-y-2 text-sm",
      hasSub ? "grid-cols-[fit-content(8rem)_minmax(2rem,1fr)_auto_auto]" : "grid-cols-[fit-content(8rem)_minmax(2rem,1fr)_auto]")}>
      {items.map((i) => (
        <li key={i.label} className={cn("col-span-full grid grid-cols-subgrid items-center")}>
          <span className="truncate text-muted-foreground" title={i.label}>{i.label}</span>
          <span className="h-2 overflow-hidden rounded-full bg-muted">
            <span className="block h-full rounded-full bg-primary" style={{ width: `${(100 * i.value) / m}%` }} />
          </span>
          <span className="text-right font-mono tabular-nums whitespace-nowrap">{i.value}</span>
          {hasSub && <span className="text-right font-mono text-xs tabular-nums whitespace-nowrap text-muted-foreground">{i.sub ?? ""}</span>}
        </li>
      ))}
    </ul>
  );
}

export interface CmpRow { label: string; a: unknown; b: unknown; f: Metric["fmt"]; desc?: string }

type Team = { id: string; name: string };

/**
 * Two-team comparison: metric | A | split bar | B. Headers show the teams' logos (full names in the tooltip)
 * so the value columns stay narrow; put the full names in the surrounding Section's description.
 */
export function CompareTable({ a, b, rows }: { a: Team; b: Team; rows: CmpRow[] }) {
  return (
    <Table className={cn("[&_td]:px-1.5 [&_th]:px-1.5 sm:[&_td]:px-2 sm:[&_th]:px-2", flushTable)}>
      <TableHeader>
        <TableRow>
          <TableHead>Metric</TableHead>
          <TableHead className="text-right" title={a.name}>
            <span className="inline-flex items-center gap-1.5"><Swatch side="a" /><TeamBadge id={a.id} /></span><span className="sr-only">{a.name}</span>
          </TableHead>
          <TableHead className="hidden w-full min-w-12 sm:table-cell" />
          <TableHead title={b.name}>
            <span className="inline-flex items-center gap-1.5"><TeamBadge id={b.id} /><Swatch side="b" /></span><span className="sr-only">{b.name}</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => {
          const na = Number(r.a) || 0;
          const nb = Number(r.b) || 0;
          const share = na + nb > 0 ? (100 * na) / (na + nb) : 50;
          return (
            <TableRow key={r.label}>
              <TableCell className="whitespace-normal text-muted-foreground sm:whitespace-nowrap"><Hint text={r.desc}>{r.label}</Hint></TableCell>
              <TableCell className={cn("text-right font-mono tabular-nums", na > nb ? "font-semibold" : "text-muted-foreground")}>{fmt(r.a, r.f)}</TableCell>
              <TableCell className="hidden sm:table-cell">
                <div className="flex h-1.5 overflow-hidden rounded-full">
                  <span className="bg-team-a" style={{ width: `${share}%` }} />
                  <span className="bg-team-b" style={{ width: `${100 - share}%` }} />
                </div>
              </TableCell>
              <TableCell className={cn("font-mono tabular-nums", nb > na ? "font-semibold" : "text-muted-foreground")}>{fmt(r.b, r.f)}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

/**
 * Round-by-round strip. Cell colour = round winner (team A/B), letter = win condition,
 * bottom tick = spike planted, top dot = team that got the first kill.
 */
export function RoundStrip({ rounds, teamA, names }: { rounds: Row[]; teamA: string; names: Record<string, string> }) {
  const cw = 20, gap = 2, top = 12;
  const sepAfter = new Set([12, 24]);
  let x = 0;
  const halves: { x: number; label: string }[] = [{ x: 0, label: "1H" }];
  const cells = rounds.map((r) => {
    const cx = x;
    x += cw + gap;
    if (sepAfter.has(r.round_no)) {
      x += 8;
      halves.push({ x, label: r.round_no === 12 ? "2H" : "OT" });
    }
    return { r, cx };
  });
  const width = Math.max(x, cw);
  const h = top + 38;
  return (
    <div className="space-y-2">
      <div>
        <svg className="block h-auto w-full" style={{ maxWidth: width }} viewBox={`0 0 ${width} ${h}`} role="img" aria-label={`Round history: ${rounds.length} rounds`}>
          {halves.filter((hf) => hf.x < width).map((hf) => (
            <text key={hf.label} x={hf.x} y={7} className="fill-muted-foreground text-[8px]">{hf.label}</text>
          ))}
          {cells.map(({ r, cx }) => {
            const wt = WIN_TYPE[r.win_type] ?? { label: r.win_type ?? "Unknown", letter: "·" };
            const aWon = r.winner_id === teamA;
            const side = r.winner_id === r.atk_id ? "attack" : "defense";
            const tip = `R${r.round_no}: ${names[r.winner_id] ?? "?"} (${side}) · ${wt.label}${r.planted ? " · planted" : ""}` +
              ` · first kill: ${names[r.fk_team_id] ?? "–"} · survivors ${r.atk_alive}v${r.def_alive} (atk v def)`;
            return (
              <g key={r.round_no}>
                <title>{tip}</title>
                {r.fk_team_id && <circle cx={cx + cw / 2} cy={top + 2} r={2} className={r.fk_team_id === teamA ? "fill-team-a" : "fill-team-b"} />}
                <rect x={cx} y={top + 7} width={cw} height={22} rx={3} className={aWon ? "fill-team-a" : "fill-team-b"} />
                <text x={cx + cw / 2} y={top + 21.5} textAnchor="middle" className={cn("text-[10px] font-medium", aWon ? "fill-team-a-foreground" : "fill-team-b-foreground")}>{wt.letter}</text>
                {r.planted ? <rect x={cx + 3} y={top + 32} width={cw - 6} height={2} className="fill-foreground" /> : null}
              </g>
            );
          })}
        </svg>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span><b className="text-foreground">E</b> elim</span><span><b className="text-foreground">B</b> detonate</span>
        <span><b className="text-foreground">D</b> defuse</span><span><b className="text-foreground">T</b> time</span>
        <span className="inline-flex items-center gap-1.5"><i className="h-0.5 w-3 bg-foreground" />planted</span>
        <span className="inline-flex items-center gap-1.5"><i className="size-1.5 rounded-full bg-muted-foreground" />first kill</span>
      </div>
    </div>
  );
}

/** Score-difference step chart over a map (team A minus team B), marking each side's biggest lead. */
export function ScoreFlow({ rounds, teamA, names }: { rounds: Row[]; teamA: string; names: Record<string, string> }) {
  const id = useId().replace(/:/g, "");
  if (!rounds.length) return null;
  const teamB = Object.keys(names).find((k) => k !== teamA) ?? "";
  let d = 0;
  const pts = [0, ...rounds.map((r) => (d += r.winner_id === teamA ? 1 : -1))];
  const n = pts.length - 1;
  const maxAbs = Math.max(3, ...pts.map(Math.abs));
  const w = 720, h = 150, padX = 28, padY = 22;
  const sx = (i: number) => padX + (i * (w - padX - 8)) / n;
  const sy = (v: number) => h / 2 - (v * (h / 2 - padY)) / maxAbs;
  let line = `M${sx(0)},${sy(0)}`;
  for (let i = 1; i <= n; i++) line += ` H${sx(i).toFixed(1)} V${sy(pts[i]).toFixed(1)}`;
  const area = `${line} V${h / 2} H${sx(0)} Z`;

  const peak = (sign: 1 | -1) => {
    let best = 0, at = -1;
    pts.forEach((v, i) => { if (v * sign > best) { best = v * sign; at = i; } });
    return best >= 2 ? { at, best } : null;
  };
  const notes = [{ p: peak(1), team: teamA, above: true }, { p: peak(-1), team: teamB, above: false }].filter((x) => x.p);
  const ticks = [1, 12, 24, n].filter((t, i, a) => t <= n && a.indexOf(t) === i);
  const tick = "fill-muted-foreground text-[9px]";
  return (
    <svg className="h-auto w-full" viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Round score difference over the map">
      <defs>
        <clipPath id={`${id}a`}><rect x="0" y="0" width={w} height={h / 2} /></clipPath>
        <clipPath id={`${id}b`}><rect x="0" y={h / 2} width={w} height={h / 2} /></clipPath>
      </defs>
      {[maxAbs, -maxAbs].map((v) => <line key={v} x1={padX} x2={w - 8} y1={sy(v)} y2={sy(v)} className="stroke-border" strokeDasharray="2 3" />)}
      <text x={0} y={sy(maxAbs) + 3} className={tick}>+{maxAbs}</text>
      <text x={0} y={h / 2 + 3} className={tick}>0</text>
      <text x={0} y={sy(-maxAbs) + 3} className={tick}>−{maxAbs}</text>
      <path d={area} className="fill-team-a/15" clipPath={`url(#${id}a)`} />
      <path d={area} className="fill-team-b/40" clipPath={`url(#${id}b)`} />
      <line x1={padX} x2={w - 8} y1={h / 2} y2={h / 2} className="stroke-muted-foreground/40" />
      {[12, 24].filter((t) => t < n).map((t) => <line key={t} x1={sx(t)} x2={sx(t)} y1={padY - 8} y2={h - padY + 8} className="stroke-border" strokeDasharray="2 3" />)}
      <path d={line} className="fill-none stroke-foreground" strokeWidth={1.5} />
      {notes.map(({ p, team, above }) => {
        const x = sx(p!.at), y = sy(pts[p!.at]);
        const anchor = x > w * 0.8 ? "end" : x < w * 0.2 ? "start" : "middle";
        return (
          <g key={team}>
            <circle cx={x} cy={y} r={2.5} className="fill-foreground" />
            <text x={x} y={above || y + 15 > h - 14 ? Math.max(10, y - 8) : y + 15} textAnchor={anchor} className="fill-foreground text-[10px]">
              {`${names[team] ?? "?"} +${p!.best} @R${p!.at}`}
            </text>
          </g>
        );
      })}
      {ticks.map((t) => <text key={t} x={sx(t)} y={h - 3} textAnchor={t === n ? "end" : t === 1 ? "start" : "middle"} className={tick}>R{t}</text>)}
    </svg>
  );
}

/** Short factual notes for a map: pistols and the longest run of rounds. */
export function mapNotes(rounds: Row[], names: Record<string, string>): string[] {
  if (!rounds.length) return [];
  const out: string[] = [];
  const pistols = rounds.filter((r) => r.round_no === 1 || r.round_no === 13).map((r) => names[r.winner_id]).filter(Boolean);
  if (pistols.length === 2) out.push(pistols[0] === pistols[1] ? `Pistols: ${pistols[0]} 2–0` : "Pistols: split 1–1");
  let best = { team: "", len: 0, start: 0 };
  let cur = { team: "", len: 0, start: 0 };
  for (const r of rounds) {
    cur = r.winner_id === cur.team ? { ...cur, len: cur.len + 1 } : { team: r.winner_id, len: 1, start: r.round_no };
    if (cur.len > best.len) best = cur;
  }
  if (best.len >= 3) out.push(`Longest run: ${names[best.team] ?? "?"} ×${best.len} from R${best.start}`);
  return out;
}

export function TeamWinConditions({ s, losses }: { s: Row | null; losses?: Row | null }) {
  if (!s) return null;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Section title="Attack · win conditions">
        <div className="space-y-5">
          <StackedBar label="Rounds won by" segments={[
            { label: "Elim", value: s.win_elim_atk, cls: WT.elim },
            { label: "Detonate", value: s.win_boom_atk, cls: WT.boom },
          ]} />
          {losses && <StackedBar label="Rounds lost by" segments={[
            { label: "Elim", value: losses.atk_loss_elim, cls: WT.elim },
            { label: "Defuse", value: losses.atk_loss_defuse, cls: WT.defuse },
            { label: "Time", value: losses.atk_loss_time, cls: WT.time },
          ]} />}
        </div>
      </Section>
      <Section title="Defense · win conditions">
        <div className="space-y-5">
          <StackedBar label="Rounds won by" segments={[
            { label: "Elim", value: s.win_elim_def, cls: WT.elim },
            { label: "Defuse", value: s.win_defuse_def, cls: WT.defuse },
            { label: "Time", value: s.win_time_def, cls: WT.time },
          ]} />
          {losses && <StackedBar label="Rounds lost by" segments={[
            { label: "Elim", value: losses.def_loss_elim, cls: WT.elim },
            { label: "Detonate", value: losses.def_loss_boom, cls: WT.boom },
          ]} />}
        </div>
      </Section>
    </div>
  );
}
