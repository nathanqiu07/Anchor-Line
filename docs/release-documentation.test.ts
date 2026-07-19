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
    const [readme, writeup, demoScript, progress, humanTodo, evaluation, envExample, gitignore] = await Promise.all([
      text("README.md"),
      text("submission/WRITEUP.md"),
      text("submission/DEMO_SCRIPT.md"),
      text("PROGRESS.md"),
      text("HUMAN_TODO.md"),
      text("eval/last-run.json"),
      text(".env.example"),
      text(".gitignore"),
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
      "4 MB",
      "synthetic",
      "ANTHROPIC_API_KEY",
      "server-only",
      "EXTRACTION_MODEL",
      "claude-sonnet-4-6",
      "Vercel",
      "processes the file bytes in memory",
      "sends it to Anthropic",
      "sessionStorage",
      "x-vercel-forwarded-for",
      "leading file-signature bytes",
      "not financial advice",
      "best-effort",
      "not distributed",
      "checked-in synthetic extraction snapshots",
    ]) {
      expect(readme).toContain(phrase);
    }

    for (const phrase of [
      "455 colleges",
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
    expect(demoScript).toContain("Click **Juniper Technical Institute**");
    expect(demoScript).toContain("activate its **Cost of attendance** card");
    expect(demoScript).toContain("visible amber **not stated in letter** badge");
    expect(demoScript).toContain(`${anchorRate} / ${anchorCount.replace("/", "-of-")}`);
    expect(demoScript).toContain("comparison");
    expect(demoScript).toContain("cost hidden");
    expect(demoScript).toContain("Cedar Ridge Presidential Scholarship");
    expect(demoScript).not.toContain("Cedar Ridge Grant");

    expect(progress).not.toMatch(/^\s*- \[ \]/m);
    expect(progress).toContain("zero-key verified path");
    expect(progress).toContain("ANTHROPIC_API_KEY");
    expect(progress).toContain("documented deviation");
    expect(progress).toContain("4 MiB");
    expect(progress).toContain("390×844");

    expect(envExample).toContain("ANTHROPIC_API_KEY=your_anthropic_api_key_here");
    expect(envExample).toContain("EXTRACTION_MODEL=claude-sonnet-4-6");
    expect(gitignore).toContain("!.env.example");

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
