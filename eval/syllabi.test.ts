import { existsSync, readdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { anchorQuote } from "../lib/anchor";
import { SyllabusAnalysisSchema } from "../lib/schema";
import {
  classifySyllabusItem,
  deriveMeasureKind,
  gradeWeightsSummary,
} from "../packs/syllabus";

const syllabiDirectory = join(process.cwd(), "eval", "syllabi");

async function loadFixture(file: string) {
  return SyllabusAnalysisSchema.parse(
    JSON.parse(await readFile(join(syllabiDirectory, file), "utf8")),
  );
}

const jsonFiles = existsSync(syllabiDirectory)
  ? readdirSync(syllabiDirectory).filter((file) => file.endsWith(".json")).sort()
  : [];

describe("synthetic syllabus fixtures", () => {
  test("has at least one valid expected syllabus analysis", () => {
    expect(jsonFiles.length).toBeGreaterThanOrEqual(1);
  });

  test.each(jsonFiles)("%s parses, anchors, and matches pack ownership", async (file) => {
    const fixture = await loadFixture(file);

    for (const item of fixture.items) {
      // Every stated value anchors back to an exact place in the transcription.
      expect(anchorQuote(fixture.transcription, item.source_quote)).not.toBeNull();
      expect(item.source_quote.includes(item.value)).toBe(true);

      // Kind and category are exactly what the deterministic pack derives.
      const kind = deriveMeasureKind(item.value);
      const classification = classifySyllabusItem(item.raw_label, item.source_quote, kind);
      expect(item).toMatchObject({
        kind,
        category: classification.category,
        explanation: classification.explanation,
      });
    }
  });

  test("biology-101 grade weights total 100%", async () => {
    const fixture = await loadFixture("biology-101.json");
    const weights = gradeWeightsSummary(fixture);
    expect(weights.total).toBe(100);
    expect(weights.balanced).toBe(true);
  });
});
