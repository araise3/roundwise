import { describe, expect, it } from "vitest";
import { isFinalScore, mapName } from "../src/ingest/transform";

describe("map names", () => {
  it("maps GRID codenames to in-game names", () => {
    expect(mapName("Plummet")).toBe("summit");
    expect(mapName(" Haven ")).toBe("haven");
  });
});

describe("isFinalScore", () => {
  it.each([[13, 11], [13, 0], [14, 12], [16, 14], [11, 13]])("%i-%i is a finished map", (a, b) => expect(isFinalScore(a, b)).toBe(true));
  it.each([[12, 6], [11, 10], [13, 12], [15, 12], [9, 7], [0, 0]])("%i-%i is incomplete", (a, b) => expect(isFinalScore(a, b)).toBe(false));
});
