/** Site-level building blocks on top of the shadcn primitives. */
import type { ReactNode } from "react";
import type { Metric } from "../../stats/metrics";
import { PERIODS, type Period } from "../../stats/periods";
import type { Row } from "../../stats/queries";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { fmt, title, withParams } from "@/lib/format";
import { cn } from "@/lib/utils";

// ------------------------------------------------------------------ page structure

export type Crumb = string | [label: string, href: string];

export function PageHeader({ crumbs, title, meta, aside }: { crumbs: Crumb[]; title: ReactNode; meta?: ReactNode[]; aside?: ReactNode }) {
  const m = meta?.filter(Boolean) ?? [];
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0 space-y-1">
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-muted-foreground">
          {crumbs.map((c, i) => (
            <span key={i} className="flex items-center gap-1.5">
              {i > 0 && <span>/</span>}
              {typeof c === "string" ? <span>{c}</span> : <a className="hover:text-foreground" href={c[1]}>{c[0]}</a>}
            </span>
          ))}
        </nav>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {m.length > 0 && (
          <p className="flex flex-wrap gap-x-3 text-sm text-muted-foreground">
            {m.map((x, i) => <span key={i}>{x}</span>)}
          </p>
        )}
      </div>
      {aside && <div className="flex flex-wrap items-center gap-2">{aside}</div>}
    </header>
  );
}

/** Card with a title. `flush` removes horizontal padding so tables run edge to edge. */
export function Section({ title, description, action, flush, className, children }: {
  title: ReactNode; description?: ReactNode; action?: ReactNode; flush?: boolean; className?: string; children: ReactNode;
}) {
  return (
    <Card className={cn("min-w-0 gap-4", className)}>
      <CardHeader className="px-4 sm:px-6">
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
        {action && <CardAction>{action}</CardAction>}
      </CardHeader>
      <CardContent className={flush ? "px-0" : "px-4 sm:px-6"}>{children}</CardContent>
    </Card>
  );
}

export const Empty = ({ children }: { children: ReactNode }) => (
  <div className="px-4 py-8 text-center text-sm text-muted-foreground sm:px-6">{children}</div>
);

/** Segmented link control. Each option is a full page link. */
export function Seg({ label, items }: { label: string; items: { href: string; label: string; on: boolean }[] }) {
  return (
    <nav aria-label={label} className="inline-flex rounded-md border p-0.5">
      {items.map((i) => (
        <Button key={i.href} asChild size="sm" variant={i.on ? "secondary" : "ghost"} className="h-7">
          <a href={i.href} aria-current={i.on ? "page" : undefined}>{i.label}</a>
        </Button>
      ))}
    </nav>
  );
}

const PERIOD_SHORT: Record<Period, string> = { "90d": "90D", "1y": "12M", all: "All" };

export const PeriodTabs = ({ path, period, params }: { path: string; period: Period; params: Record<string, string | undefined> }) => (
  <Seg label="Period" items={PERIODS.map((p) => ({ href: withParams(path, params, { period: p }), label: PERIOD_SHORT[p], on: p === period }))} />
);

export function Kpis({ row, metrics }: { row: Row | null; metrics: Metric[] }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {metrics.map((m) => <Kpi key={m.key} label={m.short} value={fmt(row?.[m.key], m.fmt)} hint={`${m.label}: ${m.desc}`} />)}
    </div>
  );
}

export const Kpi = ({ label, value, hint }: { label: ReactNode; value: ReactNode; hint?: string }) => (
  <Card className="gap-1 py-4">
    <CardContent className="px-4">
      <div className="text-xs text-muted-foreground"><Hint text={hint}>{label}</Hint></div>
      <div className="truncate font-mono text-lg font-semibold tabular-nums sm:text-2xl">{value}</div>
    </CardContent>
  </Card>
);

/** Label / value row for definition-style lists inside a flush Section. */
export const KV = ({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) => (
  <div className="flex items-center justify-between gap-4 border-b px-4 py-2 text-sm last:border-b-0 sm:px-6">
    <span className="min-w-0 text-muted-foreground"><Hint text={hint}>{label}</Hint></span>
    <span className="shrink-0 whitespace-nowrap font-mono font-medium tabular-nums">{value}</span>
  </div>
);

/**
 * shadcn tooltip for metric definitions. Wraps plain text in a focusable dotted-underline span;
 * with `asChild` the child (a link or button) is the trigger.
 */
export function Hint({ text, children, asChild }: { text?: string; children: ReactNode; asChild?: boolean }) {
  if (!text) return <>{children}</>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {asChild ? children : (
          <span tabIndex={0} className="cursor-help underline decoration-muted-foreground/40 decoration-dotted underline-offset-4">{children}</span>
        )}
      </TooltipTrigger>
      <TooltipContent className="max-w-64 text-pretty">{text}</TooltipContent>
    </Tooltip>
  );
}

export const MetricKV = ({ m, r }: { m: Metric; r: Row | null }) => <KV label={m.label} value={fmt(r?.[m.key], m.fmt)} hint={m.desc} />;

/**
 * Team logo (light- and dark-mode versions from /logo/:id/:mode; an initials tile when the team has none).
 * `side` adds the team A/B colour as a ring so it still matches swatches and comparison bars.
 */
export const TeamBadge = ({ id, side, size = "sm" }: { id: string; name?: string; side?: "a" | "b"; size?: "sm" | "lg" }) => (
  <span aria-hidden="true" className={cn(
    "inline-flex shrink-0 overflow-hidden rounded-md align-middle",
    size === "lg" ? "size-8" : "size-5",
    side && "ring-2 ring-offset-1 ring-offset-background",
    side === "a" && "ring-team-a", side === "b" && "ring-team-b",
  )}>
    <img src={`/logo/${id}/light`} alt="" width={96} height={96} loading="lazy" decoding="async" className="size-full object-contain dark:hidden" />
    <img src={`/logo/${id}/dark`} alt="" width={96} height={96} loading="lazy" decoding="async" className="hidden size-full object-contain dark:block" />
  </span>
);

/** Small colour key for team A / B. */
export const Swatch = ({ side }: { side: "a" | "b" }) => (
  <i aria-hidden="true" className={cn("inline-block size-2.5 shrink-0 rounded-sm", side === "a" ? "bg-team-a" : "bg-team-b")} />
);

/** True when any row has vlr.gg stats (VCT matches only); used to hide columns that would be empty. */
export const hasVlr = (rows: (Row | null | undefined)[]) => rows.some((r) => r?.rating != null || r?.vlr_rating_rounds > 0);

export const wl = (won: unknown) => (won ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400");

const linkCls = "font-medium hover:underline underline-offset-4";
export const TeamLink = ({ id, name }: { id: string; name: string }) => <a className={linkCls} href={`/team/${id}`}>{name}</a>;
export const PlayerLink = ({ id, name }: { id: string; name: string }) => <a className={linkCls} href={`/player/${id}`}>{name}</a>;
export const MapLink = ({ map, period }: { map: string; period?: string }) => (
  <a className={linkCls} href={`/map/${encodeURIComponent(map)}${period ? `?period=${period}` : ""}`}>{title(map)}</a>
);

// ------------------------------------------------------------------ tables

export * from "./data-table";
