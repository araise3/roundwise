import { describe, expect, it } from "vitest";
import { logoVisibility, nextBackoff, parseBackoff, tilePlan } from "../src/ingest/logos";

/** n RGBA pixels of one colour, plus m fully transparent ones. */
const px = (rgb: [number, number, number], n: number, m = 0) =>
  new Uint8Array([...Array(n).fill([...rgb, 255]).flat(), ...Array(m).fill([0, 0, 0, 0]).flat()]);

describe("logo contrast", () => {
  it("white logo: tile in light mode only", () => {
    const v = logoVisibility(px([255, 255, 255], 50, 50));
    expect(v).toEqual({ onDark: 1, onLight: 0 });
    expect(tilePlan(v)).toEqual({ light: true, dark: false });
  });

  it("black logo: tile in dark mode only", () => {
    expect(tilePlan(logoVisibility(px([0, 0, 0], 10)))).toEqual({ light: false, dark: true });
  });

  it("mid-tone colour logo: no tiles", () => {
    expect(tilePlan(logoVisibility(px([200, 30, 40], 10)))).toEqual({ light: false, dark: false });
  });

  it("neon green (LOUD) is hard to see on white", () => {
    expect(tilePlan(logoVisibility(px([16, 255, 0], 10)))).toEqual({ light: true, dark: false });
  });

  it("ignores transparent pixels and handles empty images", () => {
    expect(logoVisibility(px([0, 0, 0], 0, 10))).toEqual({ onDark: 1, onLight: 1 });
  });
});

describe("Liquipedia backoff", () => {
  const now = new Date("2026-11-13T12:00:00Z");
  const mins = (b: { until: string }) => (Date.parse(b.until) - now.getTime()) / 60_000;

  it("starts at 2 minutes and doubles up to 30", () => {
    let b = nextBackoff(null, now);
    expect(mins(b)).toBe(2);
    const seen = [2];
    for (let i = 0; i < 5; i++) { b = nextBackoff(b, now); seen.push(mins(b)); }
    expect(seen).toEqual([2, 4, 8, 16, 30, 30]);
  });

  it("reads old bare-timestamp rows", () => {
    expect(parseBackoff("2026-11-13T12:15:00.000Z")).toEqual({ until: "2026-11-13T12:15:00.000Z", n: 1 });
    expect(parseBackoff(null)).toBeNull();
  });
});
