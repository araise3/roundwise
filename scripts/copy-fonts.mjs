// Copies self-hosted variable fonts into public/fonts (no third-party font requests).
import { copyFileSync, mkdirSync } from "node:fs";

const FONTS = {
  "geist.woff2": "@fontsource-variable/geist/files/geist-latin-wght-normal.woff2",
  "geist-mono.woff2": "@fontsource-variable/geist-mono/files/geist-mono-latin-wght-normal.woff2",
};

mkdirSync("public/fonts", { recursive: true });
for (const [out, src] of Object.entries(FONTS)) copyFileSync(`node_modules/${src}`, `public/fonts/${out}`);
