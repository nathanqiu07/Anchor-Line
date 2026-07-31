import { describe, expect, test } from "vitest";

import type { LetterAnalysis, LineItem } from "../lib/schema";

import {
  calculateOffer,
  classifyAidItem,
  costOfAttendanceLabel,
  deriveAidPeriod,
  deriveCostOfAttendancePeriod,
  explainAidItem,
  financialAidGlossary,
  warningsFor,
} from "./financial-aid";

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
  transcription: "Annual student budget\nCost of Attendance $40,000",
  missing_info: [],
};

describe("financial-aid pack", () => {
  test("calculates honest cost and debt totals", () => {
    expect(calculateOffer(analysis)).toEqual({
      costOfAttendance: 40_000,
      costOfAttendancePeriod: "year",
      annualCostOfAttendance: 40_000,
      costOfAttendanceComparable: true,
      giftAid: 10_000,
      loans: 13_500,
      workStudy: 2_000,
      otherAid: 0,
      giftAidComparable: true,
      loansComparable: true,
      giftAidIncomplete: false,
      loansIncomplete: false,
      giftAidStatedTotal: 0,
      loanStatedTotal: 0,
      giftAidUnknownPeriodAmount: 0,
      loanUnknownPeriodAmount: 0,
      netPrice: 30_000,
      projectedFourYearDebt: 54_000,
      netPriceComparable: true,
      fourYearDebtComparable: true,
      incomplete: false,
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

  test("warns that unclassifiable amounts are left out of the totals", () => {
    const withUnclassified: LetterAnalysis = {
      ...analysis,
      line_items: [
        ...analysis.line_items,
        {
          raw_label: "Departmental Book Stipend",
          category: "other",
          normalized_name: "Departmental Book Stipend",
          amount: 900,
          period: "semester",
          source_quote: "Departmental Book Stipend $900 per semester",
          explanation: "",
        },
      ],
    };
    const warning = warningsFor(withUnclassified).find(
      (candidate) => candidate.id === "unclassified-aid",
    );

    expect(warning).toBeDefined();
    expect(warning!.message).toContain("Departmental Book Stipend");
    expect(warning!.message).toContain("net price");
    // The amount really is excluded, which is what the warning exists to disclose.
    expect(calculateOffer(withUnclassified).giftAid).toBe(
      calculateOffer(analysis).giftAid,
    );
  });

  test("stays quiet when every line is classified", () => {
    expect(
      warningsFor(analysis).map((warning) => warning.id),
    ).not.toContain("unclassified-aid");
  });

  test("does not warn about an unclassified line that states no amount", () => {
    const noAmount: LetterAnalysis = {
      ...analysis,
      line_items: [
        ...analysis.line_items,
        {
          raw_label: "Tuition Exchange Benefit",
          category: "other",
          normalized_name: "Tuition Exchange Benefit",
          amount: null,
          period: "unknown",
          source_quote: "Tuition Exchange Benefit — see enclosed terms",
          explanation: "",
        },
      ],
    };

    expect(
      warningsFor(noAmount).map((warning) => warning.id),
    ).not.toContain("unclassified-aid");
  });

  test("matches glossary terms on word boundaries, not bare substrings", () => {
    const immigrantServices: LineItem = {
      raw_label: "Immigrant Services Award",
      category: "other",
      normalized_name: "Immigrant Services Award",
      amount: 500,
      period: "year",
      source_quote: "Immigrant Services Award $500",
      explanation: "Classifier-authored explanation.",
    };

    // "immigrant" contains "grant"; the glossary must not hijack the explanation.
    expect(explainAidItem(immigrantServices)).toBe("Classifier-authored explanation.");
  });

  test("still applies a glossary term that appears as a whole word", () => {
    const pell: LineItem = {
      raw_label: "Federal Pell Grant",
      category: "gift_aid",
      normalized_name: "Federal Pell Grant",
      amount: 3_200,
      period: "year",
      source_quote: "Federal Pell Grant $3,200",
      explanation: "Fallback that should be overridden.",
    };

    expect(explainAidItem(pell)).toBe(financialAidGlossary.grant);
  });

  test("includes plain-language definitions for varied loan terminology", () => {
    expect(financialAidGlossary["direct unsub"]).toContain("repay");
    expect(financialAidGlossary["unsubsidized stafford loan dl"]).toContain("interest");
  });

  test.each([
    "Annual cost of Direct Loan $5,500",
    "Annual Cost of Tuition $40,000",
    "Yearly Cost $40,000",
    "Semester Cost $20,000",
    "Total Education Cost of Direct Loan $5,500",
    "Student Budget: Tuition $12,000",
    "Student Budget — Fees $2,000",
    "Cost of Attendance: Housing Only $12,000",
    "Student Budget: Books and Supplies $1,500",
    "Student Budget (Tuition and Fees) $40,000",
  ])("does not treat a component or bare period cost as COA", (sourceQuote) => {
    expect(costOfAttendanceLabel(sourceQuote)).toBeNull();
  });

  test.each([
    ["Annual Cost of Attendance $40,000", "Cost of Attendance"],
    ["Student Budget $40,000", "Student Budget"],
    ["Total Education Cost $40,000", "Total Education Cost"],
    ["Estimated Cost of Attendance: $42,000", "Cost of Attendance"],
    ["Annual student budget $48,500", "Annual student budget"],
    ["Student Budget: $42,000", "Student Budget"],
    ["Student Budget is $42,000", "Student Budget"],
    ["Total student budget totaling $42,000", "Total student budget"],
  ])("keeps explicit full-budget COA semantics", (sourceQuote, label) => {
    expect(costOfAttendanceLabel(sourceQuote)).toBe(label);
  });

  test.each([
    ["Direct Loan", "Direct Loan $5,500", "loan", "Federal Direct Loan"],
    ["Federal Pell Grant", "Federal Pell Grant $3,200", "gift_aid", "Federal Pell Grant"],
    ["Parent PLUS", "Federal Direct Parent PLUS $8,000", "loan", "Federal Direct Parent PLUS Loan"],
    ["Parent Loan for Undergraduate Students (PLUS)", "Parent Loan for Undergraduate Students (PLUS) $8,000", "loan", "Federal Direct Parent PLUS Loan"],
    ["William D. Ford Federal Direct Unsubsidized Stafford Loan", "William D. Ford Federal Direct Unsubsidized Stafford Loan $5,500", "loan", "Federal Direct Unsubsidized Loan"],
    ["Campus Employment Program", "Campus Employment Program $1,800", "work_study", "Campus Employment Program"],
    ["Mystery Tuition Credit", "Mystery Tuition Credit $900", "other", "Mystery Tuition Credit"],
  ])(
    "classifies %s deterministically from its verbatim label and quote",
    (rawLabel, sourceQuote, category, normalizedName) => {
      const result = classifyAidItem(rawLabel, sourceQuote);

      expect(result).toMatchObject({ category, normalizedName });
      expect(result.explanation.length).toBeGreaterThan(20);
    },
  );

  test("derives only explicit, unambiguous aid periods from source text", () => {
    expect(deriveAidPeriod("Fall semester grant $2,000", "Fall semester grant $2,000")).toBe("semester");
    expect(
      deriveAidPeriod(
        "Northstar Grant $4,000",
        "Northstar Grant $4,000\nAll aid amounts are for the academic year.",
      ),
    ).toBe("year");
    expect(deriveAidPeriod("Total program loan $12,000", "Total program loan $12,000")).toBe("total");
    expect(
      deriveAidPeriod(
        "Northstar Grant $4,000",
        "Northstar Grant $4,000\nAll amounts are annual.",
      ),
    ).toBe("year");
    expect(deriveAidPeriod("Northstar Grant $4,000", "Northstar Grant $4,000")).toBe("unknown");
  });

  test("derives COA period from its quote or immediately adjacent heading", () => {
    expect(
      deriveCostOfAttendancePeriod({
        ...analysis,
        cost_of_attendance: {
          amount: 20_000,
          source_quote: "Semester Cost of Attendance $20,000",
        },
        transcription: "Semester Cost of Attendance $20,000",
      }),
    ).toBe("semester");
    expect(deriveCostOfAttendancePeriod(analysis)).toBe("year");
    expect(
      deriveCostOfAttendancePeriod({
        ...analysis,
        cost_of_attendance: {
          amount: 80_000,
          source_quote: "Total program Cost of Attendance $80,000",
        },
        transcription: "Total program Cost of Attendance $80,000",
      }),
    ).toBe("total");
    expect(
      deriveCostOfAttendancePeriod({
        ...analysis,
        transcription: "Cost of Attendance $40,000",
      }),
    ).toBe("unknown");
  });

  test("annualizes semester COA and semester gift aid onto the same basis", () => {
    const semesterCoa: LetterAnalysis = {
      ...analysis,
      cost_of_attendance: {
        amount: 20_000,
        source_quote: "Semester Cost of Attendance $20,000",
      },
      line_items: analysis.line_items.map((item) =>
        item.category === "gift_aid"
          ? { ...item, period: "semester" as const }
          : item,
      ),
      transcription: "Semester Cost of Attendance $20,000",
    };

    expect(calculateOffer(semesterCoa)).toMatchObject({
      costOfAttendance: 20_000,
      costOfAttendancePeriod: "semester",
      annualCostOfAttendance: 40_000,
      costOfAttendanceComparable: true,
      giftAid: 20_000,
      netPrice: 20_000,
      netPriceComparable: true,
    });
  });

  test.each([
    ["Total program Cost of Attendance $80,000", "total"],
    ["Cost of Attendance $40,000", "unknown"],
  ] as const)("does not compare %s on an unsupported COA basis", (sourceQuote, period) => {
    const unsupported: LetterAnalysis = {
      ...analysis,
      cost_of_attendance: { amount: period === "total" ? 80_000 : 40_000, source_quote: sourceQuote },
      transcription: sourceQuote,
    };

    expect(calculateOffer(unsupported)).toMatchObject({
      costOfAttendancePeriod: period,
      annualCostOfAttendance: null,
      costOfAttendanceComparable: false,
      netPrice: null,
      netPriceComparable: false,
      costHidden: false,
    });
  });

  test("does not let another claim on a multi-amount line classify an unknown label", () => {
    expect(
      classifyAidItem(
        "Campus Award",
        "Campus Award $1,000; Federal Direct Loan $5,500",
      ),
    ).toMatchObject({
      category: "other",
      normalizedName: "Campus Award",
      recognized: false,
    });
  });

  test.each([
    ["Federal Pell Grant", "Federal Pell Grant overpayment to be repaid $500"],
    ["Direct Loan", "Direct Loan balance due $5,500"],
    ["Federal Pell Grant", "Federal Pell Grant denied $3,200"],
    ["Federal Pell Grant", "Federal Pell Grant award cancelled $3,200"],
    ["Federal Pell Grant", "Federal Pell Grant not offered $3,200"],
    ["Federal Pell Grant", "Federal Pell Grant not awarded $3,200"],
    ["Federal Pell Grant", "Federal Pell Grant never granted $3,200"],
    ["Federal Pell Grant", "Federal Pell Grant will not be awarded $3,200"],
    ["Federal Pell Grant", "Federal Pell Grant has not been awarded $3,200"],
    ["Federal Pell Grant", "No Federal Pell Grant was awarded $3,200"],
    ["Federal Pell Grant", "Federal Pell Grant without approval $3,200"],
    ["Federal Pell Grant", "Federal Pell Grant is not eligible $3,200"],
    ["Direct Loan", "Direct Loan repayment is due $5,500"],
    ["Direct Loan", "Direct Loan in collection $5,500"],
    ["Federal Pell Grant", "Federal Pell Grant must be repaid $3,200"],
    ["Federal Pell Grant", "Federal Pell Grant repayment is required $3,200"],
  ])("treats adverse aid context as unrecognized", (rawLabel, sourceQuote) => {
    const result = classifyAidItem(rawLabel, sourceQuote);

    expect(result).toMatchObject({ category: "other", recognized: false });
    expect(result.explanation).toContain("not provide enough information");
  });

  test.each([
    "Direct Loan $5,500 — must be repaid with interest",
    "Direct Loan $5,500 — you must repay this loan",
    "Direct Loan repayment is required $5,500",
    "Direct Loan repayment information $5,500",
    "Direct Loan repayment is not due $5,500",
  ])("keeps expected loan repayment semantics recognized", (sourceQuote) => {
    expect(classifyAidItem("Direct Loan", sourceQuote)).toMatchObject({
      category: "loan",
      recognized: true,
    });
  });

  test.each([
    "Federal Pell Grant offered $3,200",
    "Federal Pell Grant granted $3,200",
    "Federal Pell Grant has been awarded $3,200",
    "Federal Pell Grant was offered $3,200",
    "Federal Pell Grant has been approved $3,200",
    "Federal Pell Grant remains eligible $3,200",
  ])("recognizes non-adverse award context", (sourceQuote) => {
    expect(classifyAidItem("Federal Pell Grant", sourceQuote)).toMatchObject({
      category: "gift_aid",
      recognized: true,
    });
  });

  test.each([
    ["Federal Pell Grant", "Federal Pell Grant does not need to be repaid $3,200"],
    ["Merit Scholarship", "Merit Scholarship (does not need to be repaid) $5,000"],
    ["Northstar Grant", "Northstar Grant $4,000 — you will never repay this gift aid"],
    ["Tuition Grant", "Tuition Grant $2,000, no repayment required"],
  ])(
    "keeps gift aid recognized when repayment language is negated",
    (rawLabel, sourceQuote) => {
      expect(classifyAidItem(rawLabel, sourceQuote)).toMatchObject({
        category: "gift_aid",
        recognized: true,
      });
    },
  );

  test.each([
    ["Thornfield Merit Distinction Award", "Thornfield Merit Distinction Award $18,000 per academic year"],
    ["Merit Achievement Award", "Merit Achievement Award $6,000"],
    ["Merit Award", "Merit Award $2,500"],
    ["Thornfield Legacy Tuition Remission", "Thornfield Legacy Tuition Remission $2,250 per semester"],
    ["Employee Tuition Remission", "Employee Tuition Remission $4,000"],
  ])(
    "recognizes institutional gift aid that names neither a grant nor a scholarship",
    (rawLabel, sourceQuote) => {
      expect(classifyAidItem(rawLabel, sourceQuote)).toMatchObject({
        category: "gift_aid",
        recognized: true,
      });
    },
  );

  test.each([
    ["Merit Review Fee", "Merit Review Fee $75"],
    ["Award Notice", "Award Notice mailed on March 14"],
  ])("does not treat unrelated merit or award wording as aid", (rawLabel, sourceQuote) => {
    expect(classifyAidItem(rawLabel, sourceQuote)).toMatchObject({ recognized: false });
  });

  test("annualizes semester gift aid and loans exactly twice", () => {
    const semester = {
      ...analysis,
      line_items: analysis.line_items.map((item) => ({
        ...item,
        period: "semester" as const,
      })),
    };

    expect(calculateOffer(semester)).toMatchObject({
      giftAid: 20_000,
      loans: 27_000,
      workStudy: 4_000,
      netPrice: 20_000,
      projectedFourYearDebt: 108_000,
      netPriceComparable: true,
      fourYearDebtComparable: true,
    });
  });

  test("keeps a total-period loan as a stated total without a four-year projection", () => {
    const totalLoan = {
      ...analysis,
      line_items: analysis.line_items.map((item) =>
        item.category === "loan" ? { ...item, period: "total" as const } : item,
      ),
    };

    expect(calculateOffer(totalLoan)).toMatchObject({
      loans: null,
      loanStatedTotal: 13_500,
      loansComparable: false,
      loansIncomplete: true,
      projectedFourYearDebt: null,
      fourYearDebtComparable: false,
      incomplete: true,
    });
  });

  test("makes net price not comparable when gift-aid period is unknown", () => {
    const unknownGift = {
      ...analysis,
      line_items: analysis.line_items.map((item) =>
        item.category === "gift_aid" ? { ...item, period: "unknown" as const } : item,
      ),
    };

    expect(calculateOffer(unknownGift)).toMatchObject({
      giftAid: null,
      giftAidUnknownPeriodAmount: 10_000,
      giftAidComparable: false,
      giftAidIncomplete: true,
      netPrice: null,
      netPriceComparable: false,
    });
  });

  test("does not blend annual and total-period amounts in a mixed offer", () => {
    const mixed = {
      ...analysis,
      line_items: analysis.line_items.map((item, index) =>
        item.category === "loan" && index === 3
          ? { ...item, period: "total" as const }
          : item,
      ),
    };

    expect(calculateOffer(mixed)).toMatchObject({
      loans: null,
      loanStatedTotal: 8_000,
      loansComparable: false,
      projectedFourYearDebt: null,
    });
  });
});
