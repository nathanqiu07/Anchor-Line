import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { LetterAnalysisSchema, type LetterAnalysis } from "../lib/schema";
import {
  evaluateLetter,
  meetsAnchorThreshold,
  summarizeEvaluation,
  type EvaluationResult,
} from "./evaluation";

interface NamedEvaluation extends EvaluationResult {
  fixture: string;
}

const lettersDirectory = join(process.cwd(), "eval", "letters");
const candidatesDirectory = join(process.cwd(), "eval", "candidates");
const reportPath = join(process.cwd(), "eval", "last-run.json");

async function loadAnalyses(
  directory: string,
): Promise<Array<{ fixture: string; analysis: LetterAnalysis }>> {
  const jsonFiles = (await readdir(directory))
    .filter((file) => file.endsWith(".json"))
    .sort();
  return Promise.all(jsonFiles.map(async (file) => ({
    fixture: file.replace(/\.json$/, ""),
    analysis: LetterAnalysisSchema.parse(
      JSON.parse(await readFile(join(directory, file), "utf8")),
    ),
  })));
}

function percent(value: number | null): string {
  return value === null ? "N/A" : `${(value * 100).toFixed(1)}%`;
}

async function main(): Promise<void> {
  const [expected, candidates] = await Promise.all([
    loadAnalyses(lettersDirectory),
    loadAnalyses(candidatesDirectory),
  ]);
  const expectedByFixture = new Map(
    expected.map(({ fixture, analysis }) => [fixture, analysis]),
  );
  if (
    candidates.length !== expected.length ||
    candidates.some(({ fixture }) => !expectedByFixture.has(fixture))
  ) {
    throw new Error("Candidate extraction snapshots must match expected fixture names");
  }

  const results: NamedEvaluation[] = candidates.map(({ fixture, analysis }) => ({
    fixture,
    ...evaluateLetter(analysis, expectedByFixture.get(fixture)!),
  }));
  const summary = summarizeEvaluation(results);

  console.log("Offline evaluation: checked-in synthetic extraction snapshots vs checked-in expected truth.");
  console.table(results.map((result) => ({ fixture: result.fixture, "field accuracy": percent(result.fieldAccuracy), "anchor verification": percent(result.anchorVerification), anchors: `${result.verifiedAnchors}/${result.totalAnchors}` })));
  console.table([{ fixture: "aggregate", "field accuracy": percent(summary.fieldAccuracy), "anchor verification": percent(summary.anchorVerification), anchors: `${summary.verifiedAnchors}/${summary.totalAnchors}` }]);
  await writeFile(reportPath, `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    methodology: "Offline comparison of checked-in synthetic extraction snapshots against separate checked-in expected truth; not a live-provider benchmark.",
    results,
    summary,
  }, null, 2)}\n`);

  if (!meetsAnchorThreshold(summary)) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
