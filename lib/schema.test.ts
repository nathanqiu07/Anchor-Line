import { describe, expect, test } from "vitest";

import {
  AidCategorySchema,
  AnalysisSchema,
  LetterAnalysisSchema,
  LineItemSchema,
  SyllabusAnalysisSchema,
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
  test("accepts a complete letter analysis and defaults its document type", () => {
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

    expect(LetterAnalysisSchema.parse(analysis)).toEqual({
      document_type: "award_letter",
      ...analysis,
    });
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

const validSyllabusItem = {
  raw_label: "Midterm Exam",
  category: "grade_weight",
  kind: "percent",
  value: "25%",
  source_quote: "Midterm Exam 25%",
  explanation: "The midterm is worth this share of the final grade.",
} as const;

describe("syllabus schemas", () => {
  test("accepts a complete syllabus analysis", () => {
    const analysis = {
      document_type: "syllabus",
      course_name: "Introduction to Biology",
      term: "Fall 2026",
      items: [validSyllabusItem],
      transcription: "Midterm Exam 25%",
      missing_info: [],
    } as const;

    expect(SyllabusAnalysisSchema.parse(analysis)).toEqual(analysis);
  });

  test("rejects an unsupported syllabus category", () => {
    const result = SyllabusAnalysisSchema.safeParse({
      document_type: "syllabus",
      course_name: null,
      term: null,
      items: [{ ...validSyllabusItem, category: "office_hours" }],
      transcription: "Midterm Exam 25%",
      missing_info: [],
    });

    expect(result.success).toBe(false);
  });

  test("requires the value to be a string, never a parsed number", () => {
    const result = SyllabusAnalysisSchema.safeParse({
      document_type: "syllabus",
      course_name: null,
      term: null,
      items: [{ ...validSyllabusItem, value: 25 }],
      transcription: "Midterm Exam 25%",
      missing_info: [],
    });

    expect(result.success).toBe(false);
  });
});

describe("AnalysisSchema union", () => {
  test("routes a tagged syllabus to the syllabus shape", () => {
    const parsed = AnalysisSchema.parse({
      document_type: "syllabus",
      course_name: null,
      term: null,
      items: [validSyllabusItem],
      transcription: "Midterm Exam 25%",
      missing_info: [],
    });

    expect(parsed.document_type).toBe("syllabus");
  });

  test("routes an untagged legacy letter to the award-letter shape", () => {
    const parsed = AnalysisSchema.parse({
      school_name: null,
      award_year: null,
      cost_of_attendance: { amount: null, source_quote: null },
      line_items: [],
      transcription: "",
      missing_info: [],
    });

    expect(parsed.document_type).toBe("award_letter");
  });
});
