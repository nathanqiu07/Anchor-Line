import { describe, expect, test } from "vitest";

import type { LetterAnalysis } from "../lib/schema";

import { calculateOffer, financialAidGlossary, warningsFor } from "./financial-aid";

const analysis: LetterAnalysis = {
  school_name: "Northstar College",
  award_year: "2026-2027",
  cost_of_attendance: {
    amount: 40_000,
    source_quote: "Cost of Attendance $40,000",
  },
  line_items: [
    {
      raw_label: "Northstar Grant",
      category: "gift_aid",
      normalized_name: "Northstar Grant",
      amount: 10_000,
      period: "year",
      source_quote: "Northstar Grant $10,000",
      explanation: "",
    },
    {
      raw_label: "Direct Unsub",
      category: "loan",
      normalized_name: "Federal Direct Unsubsidized Loan",
      amount: 5_500,
      period: "year",
      source_quote: "Direct Unsub $5,500",
      explanation: "",
    },
    {
      raw_label: "Federal Work-Study",
      category: "work_study",
      normalized_name: "Federal Work-Study",
      amount: 2_000,
      period: "year",
      source_quote: "Federal Work-Study $2,000",
      explanation: "",
    },
    {
      raw_label: "Parent PLUS Loan",
      category: "loan",
      normalized_name: "Federal Direct Parent PLUS Loan",
      amount: 8_000,
      period: "year",
      source_quote: "Parent PLUS Loan $8,000",
      explanation: "",
    },
  ],
  transcription: "Cost of Attendance $40,000",
  missing_info: [],
};

describe("financial-aid pack", () => {
  test("calculates honest cost and debt totals", () => {
    expect(calculateOffer(analysis)).toEqual({
      costOfAttendance: 40_000,
      giftAid: 10_000,
      loans: 13_500,
      workStudy: 2_000,
      otherAid: 0,
      netPrice: 30_000,
      projectedFourYearDebt: 54_000,
      costHidden: false,
    });
  });

  test("keeps cost hidden when cost of attendance is missing", () => {
    expect(
      calculateOffer({
        ...analysis,
        cost_of_attendance: { amount: null, source_quote: null },
      }),
    ).toMatchObject({ netPrice: null, costHidden: true });
  });

  test("warns about work-study, loans grouped with grants, and Parent PLUS debt", () => {
    const warningIds = warningsFor(analysis).map((warning) => warning.id);

    expect(warningIds).toEqual(
      expect.arrayContaining(["work-study", "loans-not-grants", "parent-plus"]),
    );
  });

  test("includes plain-language definitions for varied loan terminology", () => {
    expect(financialAidGlossary["direct unsub"]).toContain("repay");
    expect(financialAidGlossary["unsubsidized stafford loan dl"]).toContain("interest");
  });
});
