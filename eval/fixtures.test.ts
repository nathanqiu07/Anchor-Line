import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { LetterAnalysisSchema } from "../lib/schema";
import { classifyAidItem, deriveAidPeriod } from "../packs/financial-aid";

const lettersDirectory = join(process.cwd(), "eval", "letters");
const candidatesDirectory = join(process.cwd(), "eval", "candidates");
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

  test("keeps actual extraction snapshots separate from expected truth", async () => {
    expect(existsSync(candidatesDirectory)).toBe(true);
    const expectedFiles = readdirSync(lettersDirectory)
      .filter((file) => file.endsWith(".json"))
      .sort();
    const candidateFiles = existsSync(candidatesDirectory)
      ? readdirSync(candidatesDirectory).filter((file) => file.endsWith(".json")).sort()
      : [];

    expect(candidateFiles).toEqual(expectedFiles);
    for (const file of candidateFiles) {
      const candidate = JSON.parse(
        await import("node:fs/promises").then(({ readFile }) =>
          readFile(join(candidatesDirectory, file), "utf8"),
        ),
      );
      expect(LetterAnalysisSchema.safeParse(candidate).success).toBe(true);
    }
  });

  test("keeps expected sample semantics aligned with deterministic pack ownership", async () => {
    const jsonFiles = readdirSync(lettersDirectory).filter((file) => file.endsWith(".json"));

    for (const file of jsonFiles) {
      const fixture = LetterAnalysisSchema.parse(
        JSON.parse(
          await import("node:fs/promises").then(({ readFile }) =>
            readFile(join(lettersDirectory, file), "utf8"),
          ),
        ),
      );
      for (const item of fixture.line_items) {
        const classification = classifyAidItem(item.raw_label, item.source_quote);
        expect(item).toMatchObject({
          category: classification.category,
          normalized_name: classification.normalizedName,
          explanation: classification.explanation,
          period: deriveAidPeriod(item.source_quote, fixture.transcription),
        });
      }
    }
  });
});
