import type { Fmt } from "../../stats/metrics";

export function fmt(v: unknown, f: Fmt): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "–";
  const n = Number(v);
  switch (f) {
    case "pct": return `${(n * 100).toFixed(1)}%`;
    case "dec2": return n.toFixed(2);
    case "dec1": return n.toFixed(1);
    case "int": return String(Math.round(n));
  }
}

const SPECIAL: Record<string, string> = { kayo: "KAY/O", "kay/o": "KAY/O" };

export const title = (s: string | null | undefined) =>
  !s ? "–" : SPECIAL[s.toLowerCase()] ?? s.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * Tidy GRID tournament names: "Champions - Champions Shanghai (Playoffs: Playoffs)" → "Champions Shanghai · Playoffs",
 * "VCT EMEA - Stage 1 2026 (Regular Season: Group Alpha)" → "VCT EMEA Stage 1 2026 · Group Alpha".
 */
export function eventName(raw: string | null | undefined): string {
  if (!raw) return "–";
  const m = raw.match(/^(.*?)(?: \(([^():]*)(?:: ([^()]*))?\))?$/);
  const [, base = raw, stage, group] = m ?? [];
  const [circuit, event] = base.split(" - ", 2);
  const lastWord = circuit.split(" ").pop() ?? "";
  const name = !event ? circuit : event.startsWith(lastWord) ? event : `${circuit} ${event}`;
  const part = group && group !== stage ? group : stage;
  return part ? `${name} · ${part}` : name;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "13 Nov 2026" in UTC. Hand-rolled so server and browser render identical text (hydration). */
export function date(iso: string | null | undefined) {
  if (!iso) return "–";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "–" : `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export const WIN_TYPE: Record<string, { label: string; letter: string }> = {
  opponentEliminated: { label: "Elimination", letter: "E" },
  bombExploded: { label: "Spike detonated", letter: "B" },
  bombDefused: { label: "Spike defused", letter: "D" },
  timeExpired: { label: "Time expired", letter: "T" },
};

/** Build a URL with updated query params, keeping the others. */
export function withParams(path: string, current: Record<string, string | undefined>, patch: Record<string, string | undefined>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...current, ...patch })) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `${path}?${s}` : path;
}

export const div = (a: number, b: number) => (b ? a / b : null);

export const initials = (name: string) =>
  (name || "?").replace(/[^A-Za-z0-9 ]/g, "").split(" ").filter(Boolean).slice(0, 3).map((w) => w[0]).join("").toUpperCase() || "?";
