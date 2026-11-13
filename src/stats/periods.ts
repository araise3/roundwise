export const PERIODS = ["90d", "1y", "all"] as const;
export type Period = (typeof PERIODS)[number];

export const PERIOD_LABEL: Record<Period, string> = { "90d": "Last 90 days", "1y": "Last 12 months", all: "All time" };

const DAYS: Record<Period, number | null> = { "90d": 90, "1y": 365, all: null };

export const parsePeriod = (v: string | undefined): Period =>
  (PERIODS as readonly string[]).includes(v ?? "") ? (v as Period) : "90d";

/** ISO timestamp lower bound for a period ('' = no bound; compares below any ISO date). */
export function periodCutoff(p: Period, now = new Date()): string {
  const d = DAYS[p];
  return d === null ? "" : new Date(now.getTime() - d * 86_400_000).toISOString();
}
