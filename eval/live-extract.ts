import { readFile, writeFile } from "node:fs/promises";
import { basename, extname, isAbsolute, join } from "node:path";

import {
  ExtractionValidationError,
  extractLetter,
  isExtractionConfigured,
  isUsableTextLayer,
  type LetterInput,
} from "../lib/llm";
import { extractPdfText } from "../lib/pdf-text";
import { LetterAnalysisSchema, type LetterAnalysis } from "../lib/schema";
import { evaluateLetter } from "./evaluation";

/**
 * Live single-letter extraction against whichever provider the environment configures.
 * `npm run eval` stays offline and deterministic; this is the deliberate opposite, so it
 * lives behind its own script and never runs in the test suite.
 */
const mimeTypesByExtension: Record<string, LetterInput["mimeType"]> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".pdf": "application/pdf",
};

interface Arguments {
  letterPath: string;
  expectedPath: string | null;
  outputPath: string | null;
}

function parseArguments(argv: string[]): Arguments {
  const [letterPath, ...rest] = argv;
  if (!letterPath) {
    throw new Error(
      "Usage: npm run eval:live -- <letter.png|jpg|pdf> [--expect <truth.json>] [--out <result.json>]",
    );
  }

  let expectedPath: string | null = null;
  let outputPath: string | null = null;
  for (let index = 0; index < rest.length; index += 2) {
    const flag = rest[index];
    const value = rest[index + 1];
    if (!value) throw new Error(`Flag ${flag} requires a value`);
    if (flag === "--expect") expectedPath = value;
    else if (flag === "--out") outputPath = value;
    else throw new Error(`Unknown flag ${flag}`);
  }
  return { letterPath, expectedPath, outputPath };
}

function mimeTypeFor(letterPath: string): LetterInput["mimeType"] {
  const mimeType = mimeTypesByExtension[extname(letterPath).toLowerCase()];
  if (!mimeType) {
    throw new Error(
      `Unsupported letter type ${extname(letterPath) || "(none)"}; expected one of ${Object.keys(mimeTypesByExtension).join(", ")}`,
    );
  }
  return mimeType;
}

function percent(value: number | null): string {
  return value === null ? "N/A" : `${(value * 100).toFixed(1)}%`;
}

/** Absolute paths are passed through; only repo-relative ones resolve against the cwd. */
function resolvePath(path: string): string {
  return isAbsolute(path) ? path : join(process.cwd(), path);
}

/** Reports which tier the pipeline will pick, so the printed call count is not a guess. */
async function usesTextLayer(bytes: Uint8Array): Promise<boolean> {
  const text = await extractPdfText(bytes);
  return text !== null && isUsableTextLayer(text);
}

function reportAccuracy(
  actual: LetterAnalysis,
  expected: LetterAnalysis,
  usedTextLayer: boolean,
): void {
  const result = evaluateLetter(actual, expected);
  console.log("\nScored against expected truth:");
  console.table([
    {
      "field accuracy": percent(result.fieldAccuracy),
      "anchor verification": percent(result.anchorVerification),
      anchors: `${result.verifiedAnchors}/${result.totalAnchors}`,
    },
  ]);
  if (!usedTextLayer) {
    // Anchor credit needs the candidate quote to equal the fixture quote byte for byte. A
    // vision run writes its own transcription, so spacing and dash characters drift and the
    // anchor number understates correctness. Only the text-layer tier is directly comparable.
    console.log(
      "Note: this letter was transcribed by the vision pass, which authors its own\n" +
      "transcription. Anchor credit requires byte-identical quotes against the checked-in\n" +
      "fixture, so treat the anchor figure as a lower bound rather than a quality score.",
    );
  }
}

async function main(): Promise<void> {
  const { letterPath, expectedPath, outputPath } = parseArguments(
    process.argv.slice(2),
  );
  if (!isExtractionConfigured()) {
    throw new Error("GEMINI_API_KEY is not set. Add it to .env.local and retry.");
  }

  const mimeType = mimeTypeFor(letterPath);
  const bytes = new Uint8Array(await readFile(resolvePath(letterPath)));
  const usedTextLayer =
    mimeType === "application/pdf" && (await usesTextLayer(bytes));
  const tier = usedTextLayer ? "text layer, 1 call" : "vision, 2 calls";
  console.log(
    `Extracting ${basename(letterPath)} (${mimeType}, ${bytes.byteLength} bytes) via ${tier}.`,
  );

  const startedAt = Date.now();
  const analysis = await extractLetter({ mimeType, bytes });
  const elapsedSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);

  console.log(`\nCompleted in ${elapsedSeconds}s.`);
  console.log(`School: ${analysis.school_name ?? "(not stated)"}`);
  console.log(`Award year: ${analysis.award_year ?? "(not stated)"}`);
  console.log(
    `Cost of attendance: ${analysis.cost_of_attendance.amount ?? "(not stated)"}`,
  );
  console.table(
    analysis.line_items.map((item) => ({
      label: item.raw_label,
      category: item.category,
      amount: item.amount,
      period: item.period,
    })),
  );
  if (analysis.missing_info.length > 0) {
    console.log(`Missing info: ${analysis.missing_info.join("; ")}`);
  }

  if (expectedPath) {
    const expected = LetterAnalysisSchema.parse(
      JSON.parse(await readFile(resolvePath(expectedPath), "utf8")),
    );
    reportAccuracy(analysis, expected, usedTextLayer);
  }

  if (outputPath) {
    await writeFile(
      resolvePath(outputPath),
      `${JSON.stringify(analysis, null, 2)}\n`,
    );
    console.log(`\nWrote ${outputPath}`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  // The schema error carries the reason the model output was rejected; without it the
  // message alone gives no way to tell a prompt problem from a bad transcription.
  if (error instanceof ExtractionValidationError) {
    console.error(`Last validation feedback: ${error.feedback}`);
  }
  process.exitCode = 1;
});
