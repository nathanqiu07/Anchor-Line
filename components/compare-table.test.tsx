import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import type { LetterAnalysis } from "../lib/schema";
import type { StoredAnalysis } from "../lib/client-store";

import { CompareTable } from "./compare-table";

const hiddenCostAnalysis: LetterAnalysis = {
  school_name: "Juniper Technical Institute",
  award_year: "2026-2027",
  cost_of_attendance: { amount: null, source_quote: null },
  line_items: [
    {
      raw_label: "Juniper Opportunity Grant",
      category: "gift_aid",
      normalized_name: "Juniper Opportunity Grant",
      amount: 7_000,
      period: "year",
      source_quote: "Juniper Opportunity Grant $7,000",
      explanation: "Gift aid does not need to be repaid.",
    },
    {
      raw_label: "Federal Work-Study",
      category: "work_study",
      normalized_name: "Federal Work-Study",
      amount: 1_800,
      period: "year",
      source_quote: "Federal Work-Study $1,800",
      explanation: "This is earned through work.",
    },
    {
      raw_label: "Parent PLUS Loan",
      category: "loan",
      normalized_name: "Federal Direct Parent PLUS Loan",
      amount: 10_000,
      period: "year",
      source_quote: "Parent PLUS Loan $10,000",
      explanation: "This is parent debt.",
    },
  ],
  transcription: "Juniper award letter",
  missing_info: ["Cost of attendance was not stated in this letter."],
};

const offer: StoredAnalysis = {
  id: "juniper",
  createdAt: "2026-07-18T12:00:00.000Z",
  source: { kind: "sample", label: "Juniper sample" },
  analysis: hiddenCostAnalysis,
};

describe("CompareTable", () => {
  test("shows a red cost hidden cell when COA is missing", () => {
    const html = renderToStaticMarkup(<CompareTable offers={[offer, offer]} />);

    expect(html).toContain("cost hidden");
    expect(html).toContain("comparison-cell--danger");
  });

  test("renders the required work-study, loan, and Parent PLUS warnings", () => {
    const html = renderToStaticMarkup(<CompareTable offers={[offer, offer]} />);

    expect(html).toContain("Work-study is earned, not bill reduction");
    expect(html).toContain("Loans are not grants");
    expect(html).toContain("Parent PLUS is parent debt");
  });
});
