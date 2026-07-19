import { describe, expect, test } from "vitest";

import type { LetterAnalysis } from "../lib/schema";

import { evaluateLetter, summarizeEvaluation } from "./evaluation";

const expected: LetterAnalysis = {
  school_name: "Northstar College",
  award_year: "2026-2027",
  cost_of_attendance: { amount: 20_000, source_quote: "Cost of Attendance $20,000" },
  line_items: [
    {
      raw_label: "Northstar Grant",
      category: "gift_aid",
      normalized_name: "Northstar Grant",
      amount: 5_000,
      period: "year",
      source_quote: "Northstar Grant $5,000",
      explanation: "Gift aid does not need to be repaid.",
    },
  ],
  transcription: "Cost of Attendance $20,000\nNorthstar Grant $5,000",
  missing_info: [],
};

describe("deterministic fixture evaluation", () => {
  test("reports field accuracy and source-quote anchor verification", () => {
    const result = evaluateLetter(expected, expected);

    expect(result.fieldAccuracy).toBe(1);
    expect(result.anchorVerification).toBe(1);
    expect(result).toMatchObject({ matchedFields: result.totalFields, verifiedAnchors: 2, totalAnchors: 2 });
  });

  test("counts a changed extracted field without hiding anchor failures", () => {
    const actual = {
      ...expected,
      school_name: "Wrong School",
      line_items: [{ ...expected.line_items[0], source_quote: "Missing quote" }],
    };
    const result = evaluateLetter(actual, expected);

    expect(result.fieldAccuracy).toBeLessThan(1);
    expect(result.anchorVerification).toBe(0.5);
  });

  test("requires aggregate anchor verification of at least 85 percent", () => {
    const good = evaluateLetter(expected, expected);
    const poor = evaluateLetter(
      {
        ...expected,
        line_items: [
          { ...expected.line_items[0], source_quote: "Missing quote" },
        ],
      },
      expected,
    );

    expect(
      summarizeEvaluation([good, good, good, good, good, poor])
        .anchorVerification,
    ).toBeGreaterThanOrEqual(0.85);
  });
});
