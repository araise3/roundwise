/** Sortable data table that always fits its container: columns drop instead of scrolling sideways. */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Columns3 } from "lucide-react";
import type { Metric } from "../../stats/metrics";
import type { Row } from "../../stats/queries";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmt, withParams } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Empty, Hint } from "./site";

export interface Col {
  key: string;
  label: string;
  hint?: string;
  render?: (r: Row) => ReactNode;
  fmt?: Metric["fmt"];
  num?: boolean;
  /** Extra classes for this column's header and cells. */
  className?: string;
  /** Server-side sort link (leaderboards, which fetch only the top N). Needs DataTable `path`. */
  sortable?: boolean;
  /** In-browser sort key when the cell is rendered from several fields. */
  sortBy?: (r: Row) => unknown;
  noSort?: boolean;
  /** Always shown, never dropped to fit. Defaults to true for the first column. */
  pin?: boolean;
  /** Lower = kept longer when the table is too narrow. Defaults to the column's position. */
  priority?: number;
  /** Wrapping column: budget this width instead of its one-line width. */
  minW?: number;
}

export const metricCol = (m: Metric, sortable = false): Col => ({ key: m.key, label: m.short, hint: m.desc, fmt: m.fmt, num: true, sortable });

/** Edge padding so a flush table lines up with the card header. */
export const flushTable =
  "[&_td:first-child]:pl-4 [&_th:first-child]:pl-4 [&_td:last-child]:pr-4 [&_th:last-child]:pr-4 " +
  "sm:[&_td:first-child]:pl-6 sm:[&_th:first-child]:pl-6 sm:[&_td:last-child]:pr-6 sm:[&_th:last-child]:pr-6";

type Sort = { key: string; dir: "asc" | "desc" };

const blank = (v: unknown) => v === null || v === undefined || v === "";

function compare(a: unknown, b: unknown) {
  if (blank(a) || blank(b)) return blank(a) === blank(b) ? 0 : blank(a) ? 1 : -1;
  return typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b), undefined, { numeric: true });
}

const isPinned = (c: Col, i: number) => c.pin ?? i === 0;

/**
 * Decide which columns fit. Measures each column's one-line width once (again after web fonts load),
 * then keeps pinned / user-chosen / sorted / higher-priority columns until the width runs out.
 * SSR and the first client render show every column, so hydration matches.
 */
function useFitColumns(cols: Col[], keep: string | undefined, forced: Record<string, boolean>) {
  const wrap = useRef<HTMLDivElement>(null);
  const [natural, setNatural] = useState<number[] | null>(null);
  const [avail, setAvail] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = wrap.current;
    const table = el?.querySelector("table");
    if (!el || !table || natural) return;
    const prev = table.style.width;
    table.style.width = "max-content";
    const widths = [...table.querySelectorAll("thead th")].map((th) => Math.ceil(th.getBoundingClientRect().width));
    table.style.width = prev;
    setNatural(widths.map((w, i) => cols[i]?.minW ?? w));
    setAvail(el.clientWidth);
  }, [natural, cols]);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setAvail(el.clientWidth));
    ro.observe(el);
    document.fonts?.ready.then(() => setNatural(null));
    return () => ro.disconnect();
  }, []);

  const visible = useMemo(() => {
    if (!natural || avail === null || natural.length !== cols.length) return new Set(cols.map((c) => c.key));
    const must = (c: Col, i: number) => isPinned(c, i) || forced[c.key] === true || c.key === keep;
    const order = cols
      .map((c, i) => ({ c, i, r: must(c, i) ? -1 : (c.priority ?? i) }))
      .filter(({ c }) => forced[c.key] !== false)
      .sort((a, b) => a.r - b.r);
    const out = new Set<string>();
    const budget = avail - 24; // first/last-column edge padding shifts when columns drop
    let used = 0;
    let full = false;
    for (const { c, i, r } of order) {
      if (r !== -1 && (full || used + natural[i] > budget)) { full = true; continue; }
      out.add(c.key);
      used += natural[i];
    }
    return out;
  }, [natural, avail, cols, keep, forced]);

  return { wrap, visible };
}

/**
 * With `path`, headers are server-side sort links; otherwise they sort in the browser.
 * When columns are dropped to fit, a "Columns" menu lets the reader pick which ones to see.
 */
export function DataTable({ cols, rows, sort, path, params, empty }: {
  cols: Col[];
  rows: Row[];
  sort?: Sort;
  path?: string;
  params?: Record<string, string | undefined>;
  empty?: string;
}) {
  const [local, setLocal] = useState<Sort | null>(null);
  const [forced, setForced] = useState<Record<string, boolean>>({});
  const active = path ? sort : local ?? undefined;
  const { wrap, visible } = useFitColumns(cols, active?.key, forced);
  const value = (c: Col, r: Row) => (c.sortBy ? c.sortBy(r) : r[c.key]);
  const canSort = (c: Col) => !path && !c.noSort && (!!c.sortBy || rows.some((r) => !blank(r[c.key])));
  const sorted = useMemo(() => {
    const c = local && cols.find((x) => x.key === local.key);
    if (!c) return rows;
    return [...rows].sort((a, b) => {
      const va = value(c, a), vb = value(c, b);
      if (blank(va) || blank(vb)) return compare(va, vb);
      return local!.dir === "asc" ? compare(va, vb) : compare(vb, va);
    });
  }, [rows, cols, local]);

  if (!rows.length) return <Empty>{empty ?? "No data for this selection yet."}</Empty>;
  const shown = cols.filter((c) => visible.has(c.key));
  const hidden = cols.length - shown.length;
  const customised = Object.keys(forced).length > 0;
  const arrow = (on: boolean) => on && (active?.dir === "desc" ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />);
  const btnCls = (c: Col) => cn("inline-flex items-center gap-1 hover:text-foreground", c.num && "flex-row-reverse");

  return (
    <div ref={wrap} className="min-w-0">
      <Table className={flushTable}>
        <TableHeader>
          <TableRow>
            {shown.map((c) => {
              const on = active?.key === c.key;
              let label: ReactNode = <Hint text={c.hint}>{c.label}</Hint>;
              if (c.sortable && path) {
                const next = on && sort?.dir === "desc" ? "asc" : "desc";
                label = (
                  <Hint text={c.hint} asChild>
                    <a className={btnCls(c)} href={withParams(path, params ?? {}, { sort: c.key, dir: next })}>{arrow(on)}{c.label}</a>
                  </Hint>
                );
              } else if (canSort(c)) {
                const next: Sort["dir"] = on ? (local?.dir === "desc" ? "asc" : "desc") : c.num ? "desc" : "asc";
                label = (
                  <Hint text={c.hint} asChild>
                    <button type="button" className={btnCls(c)} onClick={() => setLocal({ key: c.key, dir: next })}>{arrow(on)}{c.label}</button>
                  </Hint>
                );
              }
              return (
                <TableHead key={c.key} className={cn(c.num && "text-right", c.className)}
                  aria-sort={on ? (active?.dir === "desc" ? "descending" : "ascending") : undefined}>
                  {label}
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((r, i) => (
            <TableRow key={i}>
              {shown.map((c) => (
                <TableCell key={c.key} className={cn(c.num && "text-right font-mono tabular-nums", c.minW && "whitespace-normal", c.className)}>
                  {c.render ? c.render(r) : c.fmt ? fmt(r[c.key], c.fmt) : (r[c.key] ?? "–")}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {(hidden > 0 || customised) && (
        <div className="flex items-center justify-between gap-4 border-t px-4 pt-3 text-xs sm:px-6 text-muted-foreground">
          <span>{hidden > 0 ? `${hidden} of ${cols.length} columns hidden to fit` : "Custom columns"}</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-7"><Columns3 />Columns</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-80 overflow-y-auto">
              <DropdownMenuLabel>Show columns</DropdownMenuLabel>
              {cols.map((c, i) => (
                <DropdownMenuCheckboxItem key={c.key} checked={visible.has(c.key)} disabled={isPinned(c, i)}
                  onSelect={(e) => e.preventDefault()}
                  onCheckedChange={(v) => setForced((f) => ({ ...f, [c.key]: !!v }))}>
                  {c.label}
                </DropdownMenuCheckboxItem>
              ))}
              {customised && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => setForced({})}>Reset to fit</DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  );
}
