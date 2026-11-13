import { describe, expect, it } from "vitest";
import { eventName } from "../src/web/lib/format";

describe("eventName", () => {
  it.each([
    ["Champions - Champions Shanghai (Playoffs: Playoffs)", "Champions Shanghai · Playoffs"],
    ["VALORANT Masters - Masters London (Swiss: Swiss)", "Masters London · Swiss"],
    ["VCT EMEA - Stage 1 2026 (Regular Season: Group Alpha)", "VCT EMEA Stage 1 2026 · Group Alpha"],
    ["Challengers NA - Split 3 2026 (Playoffs: Playoffs)", "Challengers NA Split 3 2026 · Playoffs"],
    ["Challengers North//East - Split 3 2025 (Upper Swiss)", "Challengers North//East Split 3 2025 · Upper Swiss"],
    ["Challengers 2025 MENA: Resilience LAN Finals", "Challengers 2025 MENA: Resilience LAN Finals"],
  ])("%s", (raw, want) => expect(eventName(raw)).toBe(want));

  it("handles missing names", () => expect(eventName(null)).toBe("–"));
});
