import { describe, expect, it } from "vitest";
import { logoVisibility, tilePlan } from "../src/ingest/logos";

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

