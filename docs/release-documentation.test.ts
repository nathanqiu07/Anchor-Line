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
      "npm run test",
      "npm run eval",
      "npm run build",
      "plain-text",
      ".txt",
      "digital PDF",
      "4 MB",
      "synthetic",
      "GEMINI_API_KEY",
      "server-only",
      "EXTRACTION_MODEL",
      "gemini-3.6-flash",
      "improve their models",
      "text layer",
      "isUsableTextLayer",
      "no transcription call",
      "refused",
      "EXTRACTION_MAX_PER_MINUTE",
      "Vercel",
      "processes the file bytes in memory",
      "sends only that text to the configured model",
      "bytes are never sent to the provider",
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
      "no fuzzy fallback",
      "recoverable exactly",
      "Next.js",
      "Gemini",
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

    expect(envExample).toContain("GEMINI_API_KEY=your_gemini_api_key_here");
    expect(envExample).toContain("EXTRACTION_MODEL=gemini-3.6-flash");
    expect(gitignore).toContain("!.env.example");
    // .env.example is the one committed env file, so a real key here would ship in git.
    expect(envExample).not.toMatch(/=\s*A[A-Za-z0-9]{6,}[-_A-Za-z0-9]{12,}/);

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
