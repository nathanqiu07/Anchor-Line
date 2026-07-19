import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { LetterAnalysisSchema, type LetterAnalysis } from "../lib/schema";
import { evaluateLetter, summarizeEvaluation, type EvaluationResult } from "./evaluation";

interface NamedEvaluation extends EvaluationResult {
  fixture: string;
}

const lettersDirectory = join(process.cwd(), "eval", "letters");
const reportPath = join(process.cwd(), "eval", "last-run.json");

async function loadFixtures(): Promise<Array<{ fixture: string; analysis: LetterAnalysis }>> {
  const jsonFiles = (await readdir(lettersDirectory)).filter((file) => file.endsWith(".json")).sort();
  return Promise.all(jsonFiles.map(async (file) => ({
    fixture: file.replace(/\.json$/, ""),
    analysis: LetterAnalysisSchema.parse(JSON.parse(await readFile(join(lettersDirectory, file), "utf8"))),
  })));
}

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

async function main(): Promise<void> {
  const fixtures = await loadFixtures();
  const results: NamedEvaluation[] = fixtures.map(({ fixture, analysis }) => ({ fixture, ...evaluateLetter(analysis, analysis) }));
  const summary = summarizeEvaluation(results);

  console.table(results.map((result) => ({ fixture: result.fixture, "field accuracy": percent(result.fieldAccuracy), "anchor verification": percent(result.anchorVerification), anchors: `${result.verifiedAnchors}/${result.totalAnchors}` })));
  console.table([{ fixture: "aggregate", "field accuracy": percent(summary.fieldAccuracy), "anchor verification": percent(summary.anchorVerification), anchors: `${summary.verifiedAnchors}/${summary.totalAnchors}` }]);
  await writeFile(reportPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), results, summary }, null, 2)}\n`);

  if (summary.anchorVerification < 0.85) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
