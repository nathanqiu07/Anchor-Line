import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

const root = process.cwd();

async function text(path: string): Promise<string> {
  return readFile(join(root, path), "utf8");
}

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

describe("release documentation", () => {
  test("documents the verified sample workflow, submission story, and final milestone state", async () => {
    const [readme, writeup, demoScript, progress, humanTodo, evaluation] = await Promise.all([
      text("README.md"),
      text("submission/WRITEUP.md"),
      text("submission/DEMO_SCRIPT.md"),
      text("PROGRESS.md"),
      text("HUMAN_TODO.md"),
      text("eval/last-run.json"),
    ]);
    const report = JSON.parse(evaluation) as {
      summary: {
        fieldAccuracy: number;
        anchorVerification: number;
        matchedFields: number;
        totalFields: number;
        verifiedAnchors: number;
        totalAnchors: number;
      };
    };
    const fieldRate = percent(report.summary.fieldAccuracy);
    const anchorRate = percent(report.summary.anchorVerification);
    const fieldCount = `${report.summary.matchedFields}/${report.summary.totalFields}`;
    const anchorCount = `${report.summary.verifiedAnchors}/${report.summary.totalAnchors}`;

    for (const phrase of [
      "npm install",
      "npm run dev",
      "npm run typecheck",
      "npm run lint",
      "npm run test",
      "npm run eval",
      "npm run build",
      "PNG",
      "JPG",
      "PDF",
      "10 MB",
      "synthetic",
      "ANTHROPIC_API_KEY",
      "server-only",
      "EXTRACTION_MODEL",
      "claude-sonnet-4-6",
      "Vercel",
      "processed in memory",
      "not financial advice",
    ]) {
      expect(readme).toContain(phrase);
    }

    for (const phrase of [
      "455",
      "136",
      "24",
      "loan",
      "one-third",
      "COA",
      "anchored",
      "normalization",
      "true-cost",
      "two-pass",
      "Next.js",
      "Anthropic",
      "privacy",
      "guardrail",
      fieldRate,
      anchorRate,
      fieldCount,
      anchorCount,
    ]) {
      expect(writeup).toContain(phrase);
    }

    expect(demoScript).toContain("3:00");
    expect(demoScript).toContain("not stated in letter");
    expect(demoScript).toContain(anchorRate);
    expect(demoScript).toContain("comparison");
    expect(demoScript).toContain("cost hidden");

    expect(progress).not.toMatch(/^\s*- \[ \]/m);
    expect(progress).toContain("zero-key verified path");
    expect(progress).toContain("ANTHROPIC_API_KEY");
    expect(progress).toContain("documented deviation");

    for (const phrase of [
      "Collect 15",
      "Register + verify",
      "Vercel deploy + env var",
      "record 3-minute demo video",
      "finalize + submit Devpost",
    ]) {
      expect(humanTodo).toContain(phrase);
    }
  });
});
