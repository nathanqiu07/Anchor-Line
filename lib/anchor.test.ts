import { describe, expect, test } from "vitest";

import { anchorQuote } from "./anchor";

describe("anchorQuote", () => {
  test("returns offsets in the original transcription for an exact quote", () => {
    const transcription = "Award summary: Direct Unsub $5,500 is offered.";
    const quote = "Direct Unsub $5,500";

    expect(anchorQuote(transcription, quote)).toMatchObject({
      start: transcription.indexOf(quote),
      end: transcription.indexOf(quote) + quote.length,
      score: 1,
    });
  });

  test("finds an OCR-noisy dollar amount and preserves original offsets", () => {
    const transcription = "Your Direct Unsub award is $5,5OO for 2026-27.";
    const match = anchorQuote(transcription, "Direct Unsub award is $5,500");

    expect(match).not.toBeNull();
    expect(transcription.slice(match!.start, match!.end)).toContain("$5,5OO");
    expect(match!.score).toBeGreaterThanOrEqual(0.85);
  });

  test("rejects reordered words instead of treating them as a source quote", () => {
    expect(
      anchorQuote(
        "The college offered a $5,500 Direct Unsub award.",
        "Direct Unsub award $5,500",
      ),
    ).toBeNull();
  });

  test("returns null for a quote absent from the transcription", () => {
    expect(anchorQuote("No aid is listed.", "Pell Grant $2,000")).toBeNull();
  });

  test("scans a full letter of unmatched claims without blocking the render", () => {
    // Anchoring runs synchronously inside a useMemo in a client component, so an
    // unbounded fuzzy scan freezes the tab. A letter's worth of quotes that match
    // nothing is the worst case; it once took ~52s. The ceiling is deliberately loose
    // so the test tracks the algorithm's order of growth, not the runner's speed.
    const transcription = Array.from(
      { length: 44 },
      (_, line) => `Line ${line}: an award letter row with some text and $${line},500 stated`,
    ).join("\n");
    const absent = "Completely unrelated sentence appearing nowhere in this document";

    const startedAt = performance.now();
    for (let claim = 0; claim < 18; claim += 1) {
      expect(anchorQuote(transcription, `${absent} ${claim}`)).toBeNull();
    }

    expect(performance.now() - startedAt).toBeLessThan(2_000);
  });
});
