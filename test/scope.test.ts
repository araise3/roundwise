import { describe, expect, it } from "vitest";
import { inScope } from "../src/ingest/scope";

const T = "2026-05-01T12:00:00Z";

describe("inScope", () => {
  it.each([
    "VCT Americas - Kickoff 2026 (Knockouts: Knockouts)",
    "VCT CN - Stage 2 2026 (Seeding Bracket: Seeding Bracket)",
    "VALORANT Masters - Masters London (Playoffs: Playoffs)",
    "Champions - Champions Shanghai (Groups: Group A)",
    "Last Chance Qualifier EMEA - 2026 (Playoffs: Playoffs)",
    "Challengers NA - Split 2 2026 (Swiss: Swiss)",
    "Challengers LATAM N - ACE MASTERS 2026 (Group Stage: Group B)",
    "EMEA Clash - 2026 (Group Stage: Group Stage)",
  ])("keeps tier 1/2: %s", (name) => expect(inScope(name, T)).toBe(true));

  it.each([
    "Game Changers Championship - 2026 (Knockouts: Knockouts)",
    "Challengers NA - Open Qualifier 2026",
    "Some Third-Party Cup 2026",
  ])("drops: %s", (name) => expect(inScope(name, T)).toBe(false));

  it("drops next-season qualifiers played the year before", () => {
    expect(inScope("Challengers NA - Split 1 2027 (Qualifier: Qualifier)", "2026-12-05T18:00:00Z")).toBe(false);
    expect(inScope("Challengers NA - Split 1 2027 (Swiss: Swiss)", "2027-01-20T18:00:00Z")).toBe(true);
  });

  it("drops series without a tournament", () => {
    expect(inScope(null, T)).toBe(false);
  });
});
