import { describe, expect, it } from "vitest";
import { candidateTitles, fileStem, infoboxImages, ownFiles, pickLogoFiles } from "../src/ingest/liquipedia";

const f = (name: string, timestamp: string) => ({ name: `File:${name}`, timestamp });

describe("Liquipedia logo picking", () => {
  it("picks the newest light/dark set and skips wordmarks and joke logos", () => {
    const pick = pickLogoFiles("Team Vitality", [
      f("Team Vitality allmode.png", "2018-10-14"),
      f("Team Vitality 2021 allmode.png", "2025-05-29"),
      f("Team Vitality 2023 lightmode.png", "2025-06-01"),
      f("Team Vitality 2023 darkmode.png", "2025-05-29"),
      f("Team Vitality 2026 full lightmode.png", "2026-08-05"),
      f("Team Vitality LP April Fools 26 allmode.png", "2026-03-27"),
      f("G2 Esports 2019 lightmode.png", "2026-10-01"), // opponent on the same page
    ]);
    expect(pick).toEqual({ title: "Team Vitality", light: "Team Vitality 2023 lightmode.png", dark: "Team Vitality 2023 darkmode.png" });
  });

  it("uses an allmode file for both modes", () => {
    expect(pickLogoFiles("LOUD", [f("LOUD allmode.png", "2026-04-10")]))
      .toEqual({ title: "LOUD", light: "LOUD allmode.png", dark: "LOUD allmode.png" });
  });

  it("needs both modes or an allmode file", () => {
    expect(pickLogoFiles("NRG", [f("NRG lightmode.png", "2026-01-01")])).toBeNull();
  });

  it("matches files named after the GRID name when the page title differs", () => {
    expect(ownFiles(["Leviatán", "Leviatán Esports"], ["File:Leviatán allmode.png", "File:LOUD allmode.png"]))
      .toEqual(["File:Leviatán allmode.png"]);
  });

  it("tries GRID names without numbered suffixes", () => {
    expect(candidateTitles("Evil Geniuses (1)")).toEqual(["Evil Geniuses (1)", "Evil Geniuses"]);
    expect(candidateTitles("Howlers ")).toEqual(["Howlers"]);
  });
});

describe("Liquipedia infobox aliases", () => {
  it("reads image/imagedark from the team infobox", () => {
    const wt = [
      "{{Infobox team", "|name=FUT Esports", "|image=Futbolist 2021 lightmode.png", "|imagedark=Futbolist 2021 darkmode.png",
      "|location=Turkey", "}}",
    ].join("\n");
    expect(infoboxImages(wt)).toEqual({ image: "Futbolist 2021 lightmode.png", imagedark: "Futbolist 2021 darkmode.png" });
  });

  it("turns a logo file into a name alias", () => {
    expect(fileStem("Futbolist 2021 lightmode.png")).toBe("Futbolist");
    expect(fileStem("Team Vitality 2026 full allmode.png")).toBe("Team Vitality");
    expect(fileStem("photo.jpg")).toBeNull();
  });

  it("finds icons filed under a former name via the infobox alias", () => {
    const pick = pickLogoFiles("FUT Esports", [
      { name: "Futbolist 2021 lightmode.png", timestamp: "2023-01-01" },
      { name: "Futbolist 2021 darkmode.png", timestamp: "2023-01-01" },
    ], ["Futbolist"]);
    expect(pick).toEqual({ title: "FUT Esports", light: "Futbolist 2021 lightmode.png", dark: "Futbolist 2021 darkmode.png" });
  });
});
