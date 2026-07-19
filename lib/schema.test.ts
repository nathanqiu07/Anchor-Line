import { describe, expect, test } from "vitest";

import {
  AidCategorySchema,
  LetterAnalysisSchema,
  LineItemSchema,
} from "./schema";

const validLineItem = {
  raw_label: "Direct Unsub",
  category: "loan",
  normalized_name: "Federal Direct Unsubsidized Loan",
  amount: 5_500,
  period: "year",
  source_quote: "Direct Unsub $5,500",
  explanation: "You repay this loan, with interest.",
} as const;

describe("financial aid schemas", () => {
  test("accepts a complete letter analysis", () => {
    const analysis = {
      school_name: "Example University",
      award_year: "2026-2027",
      cost_of_attendance: {
        amount: 38_000,
        source_quote: "Estimated Cost of Attendance: $38,000",
      },
      line_items: [validLineItem],
      transcription: "Estimated Cost of Attendance: $38,000",
      missing_info: ["Housing choice"],
    };

    expect(LetterAnalysisSchema.parse(analysis)).toEqual(analysis);
  });

  test("rejects an unsupported aid category", () => {
    expect(AidCategorySchema.safeParse("grant").success).toBe(false);
    expect(
      LineItemSchema.safeParse({ ...validLineItem, category: "grant" }).success,
    ).toBe(false);
  });

  test("rejects malformed nested dollar amounts", () => {
    const result = LetterAnalysisSchema.safeParse({
      school_name: null,
      award_year: null,
      cost_of_attendance: {
        amount: "$38,000",
        source_quote: null,
      },
      line_items: [],
      transcription: "",
      missing_info: [],
    });

    expect(result.success).toBe(false);
  });
});
