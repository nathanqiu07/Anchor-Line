import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { LetterAnalysisSchema } from "../lib/schema";

const lettersDirectory = join(process.cwd(), "eval", "letters");
const samplesDirectory = join(process.cwd(), "public", "samples");

describe("synthetic award-letter fixtures", () => {
  test("has three valid hand-written expected analyses", async () => {
    expect(existsSync(lettersDirectory)).toBe(true);
    const jsonFiles = existsSync(lettersDirectory)
      ? readdirSync(lettersDirectory).filter((file) => file.endsWith(".json"))
      : [];
    expect(jsonFiles).toHaveLength(3);

    for (const file of jsonFiles) {
      const fixture = JSON.parse(await import("node:fs/promises").then(({ readFile }) => readFile(join(lettersDirectory, file), "utf8")));
      expect(LetterAnalysisSchema.safeParse(fixture).success).toBe(true);
    }
  });

  test("has a non-trivial rendered PNG for every fixture", () => {
    expect(existsSync(samplesDirectory)).toBe(true);
    const pngs = existsSync(samplesDirectory)
      ? readdirSync(samplesDirectory).filter((file) => file.endsWith(".png"))
      : [];
    expect(pngs).toHaveLength(3);
    for (const png of pngs) {
      expect(statSync(join(samplesDirectory, png)).size).toBeGreaterThan(1_000);
    }
  });
});
