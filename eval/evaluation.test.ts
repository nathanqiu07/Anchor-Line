import { describe, expect, test } from "vitest";

import type { LetterAnalysis } from "../lib/schema";

import {
  evaluateLetter,
  meetsAnchorThreshold,
  meetsEvaluationThresholds,
  summarizeEvaluation,
} from "./evaluation";

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
    const result = evaluateLetter(structuredClone(expected), expected);

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
    const good = evaluateLetter(structuredClone(expected), expected);
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

  test("uses expected anchors as the denominator so omitted actual claims fail", () => {
    const omittedActual: LetterAnalysis = {
      ...expected,
      cost_of_attendance: { amount: null, source_quote: null },
      line_items: [],
      transcription: "",
    };

    const result = evaluateLetter(omittedActual, expected);

    expect(result).toMatchObject({
      anchorVerification: 0,
      verifiedAnchors: 0,
      totalAnchors: 2,
    });
    expect(result.fieldAccuracy).toBeLessThan(1);
    expect(result.totalFields).toBeGreaterThan(result.matchedFields);
    expect(meetsAnchorThreshold(result)).toBe(false);
  });

  test("gives no anchor credit to self-consistent fabricated candidate evidence", () => {
    const fabricated: LetterAnalysis = {
      school_name: "Fabricated University",
      award_year: "2030-2031",
      cost_of_attendance: {
        amount: 1,
        source_quote: "Fabricated Cost of Attendance $1",
      },
      line_items: [
        {
          raw_label: "Fabricated Loan",
          category: "loan",
          normalized_name: "Fabricated Loan Name",
          amount: 2,
          period: "semester",
          source_quote: "Fabricated Loan $2",
          explanation: "Fabricated explanation.",
        },
      ],
      transcription:
        "Fabricated Cost of Attendance $1\nFabricated Loan $2",
      missing_info: ["fabricated"],
    };

    const result = evaluateLetter(fabricated, expected);

    expect(result).toMatchObject({
      matchedFields: 1,
      totalFields: 14,
      fieldAccuracy: 1 / 14,
      verifiedAnchors: 0,
      totalAnchors: 2,
      anchorVerification: 0,
    });
    expect(meetsEvaluationThresholds(result)).toBe(false);
  });

  test("penalizes extra candidate claims in field and anchor denominators", () => {
    const extra: LetterAnalysis["line_items"][number] = {
      raw_label: "Extra Loan",
      category: "loan",
      normalized_name: "Extra Loan",
      amount: 500,
      period: "year",
      source_quote: "Extra Loan $500",
      explanation: "Extra claim.",
    };
    const result = evaluateLetter(
      {
        ...expected,
        line_items: [...expected.line_items, extra],
        transcription: `${expected.transcription}\n${extra.source_quote}`,
      },
      expected,
    );

    expect(result).toMatchObject({
      matchedFields: 12,
      totalFields: 21,
      verifiedAnchors: 2,
      totalAnchors: 3,
    });
    expect(result.fieldAccuracy).toBeLessThan(0.85);
    expect(result.anchorVerification).toBeCloseTo(2 / 3);
  });

  test("requires both field and anchor thresholds", () => {
    const good = evaluateLetter(structuredClone(expected), expected);
    const lowField = {
      ...good,
      fieldAccuracy: 0.84,
    };

    expect(meetsEvaluationThresholds(good)).toBe(true);
    expect(meetsEvaluationThresholds(lowField)).toBe(false);
  });

  test("reports N/A only when expected truth contains no anchor claims", () => {
    const noExpectedAnchors: LetterAnalysis = {
      ...expected,
      cost_of_attendance: { amount: null, source_quote: null },
      line_items: [],
    };
    const result = evaluateLetter(structuredClone(noExpectedAnchors), noExpectedAnchors);

    expect(result.anchorVerification).toBeNull();
    expect(result.totalAnchors).toBe(0);
    expect(meetsAnchorThreshold(result)).toBe(false);
    expect(meetsEvaluationThresholds(result)).toBe(false);
  });
});
