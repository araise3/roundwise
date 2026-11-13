/**
 * Which series Roundwise imports: VCT (tier 1) and VCL / Challengers (tier 2) only.
 *
 * Tier 1: VCT international leagues (Americas, EMEA, Pacific, CN), Masters, Champions, Last Chance Qualifiers.
 * Tier 2: Challengers / VCL regional leagues, Ascension, EMEA Clash.
 * Excluded: Game Changers, open qualifiers, and next-season qualifiers played before that season starts
 * (e.g. "... 2027" events scheduled in 2026).
 */

const TIER_PATTERNS = [
  /^VCT\b/i,                     // VCT Americas / EMEA / Pacific / CN
  /^VALORANT Masters\b/i,
  /^Champions\b/i,
  /^Last Chance Qualifier\b/i,
  /^Challengers\b/i,             // VCL regional leagues + Ascension
  /^VCL\b/i,
  /^EMEA Clash\b/i,
];

const EXCLUDE_PATTERNS = [/game changers/i, /open qual/i];

export function inScope(tournamentName: string | null | undefined, startTime: string): boolean {
  if (!tournamentName) return false;
  if (EXCLUDE_PATTERNS.some((re) => re.test(tournamentName))) return false;
  if (!TIER_PATTERNS.some((re) => re.test(tournamentName))) return false;
  // A season year in the name later than the year it's played = next season's qualifier.
  const startYear = Number(startTime.slice(0, 4));
  const years = [...tournamentName.matchAll(/\b(20\d\d)\b/g)].map((m) => Number(m[1]));
  if (years.some((y) => y > startYear)) return false;
  return true;
}
