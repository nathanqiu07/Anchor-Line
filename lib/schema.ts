import { z } from "zod";

import { MEASURE_KINDS, type MeasureKind } from "./measures";

export type DocumentType = "award_letter" | "syllabus";

export type AidCategory = "gift_aid" | "loan" | "work_study" | "other";

export interface LineItem {
  raw_label: string;
  category: AidCategory;
  normalized_name: string;
  amount: number | null;
  period: "year" | "semester" | "total" | "unknown";
  source_quote: string;
  explanation: string;
}

export interface LetterAnalysis {
  // Optional because award letters produced before the multi-document split omit it; the
  // schema defaults it on parse, and routing keys off the syllabus discriminant, never this.
  document_type?: "award_letter";
  school_name: string | null;
  award_year: string | null;
  cost_of_attendance: {
    amount: number | null;
    source_quote: string | null;
  };
  line_items: LineItem[];
  transcription: string;
  missing_info: string[];
}

export type SyllabusCategory =
  | "grade_weight"
  | "grading_scale"
  | "assessment_count"
  | "policy_penalty"
  | "credit_hours"
  | "schedule_date"
  | "schedule_time"
  | "logistics"
  | "other";

export interface SyllabusItem {
  raw_label: string;
  category: SyllabusCategory;
  kind: MeasureKind;
  /** The important number, copied verbatim from its source line (e.g. "25%", "3", "March 12"). */
  value: string;
  source_quote: string;
  explanation: string;
}

export interface SyllabusAnalysis {
  document_type: "syllabus";
  course_name: string | null;
  term: string | null;
  items: SyllabusItem[];
  transcription: string;
  missing_info: string[];
}

export type Analysis = LetterAnalysis | SyllabusAnalysis;

export const AidCategorySchema = z.enum([
  "gift_aid",
  "loan",
  "work_study",
  "other",
]);

export const AidPeriodSchema = z.enum([
  "year",
  "semester",
  "total",
  "unknown",
]);

export const SyllabusCategorySchema = z.enum([
  "grade_weight",
  "grading_scale",
  "assessment_count",
  "policy_penalty",
  "credit_hours",
  "schedule_date",
  "schedule_time",
  "logistics",
  "other",
]);

export const MeasureKindSchema = z.enum(MEASURE_KINDS);

export const LineItemSchema: z.ZodType<LineItem> = z
  .object({
    raw_label: z.string(),
    category: AidCategorySchema,
    normalized_name: z.string(),
    amount: z.number().nullable(),
    period: AidPeriodSchema,
    source_quote: z.string(),
    explanation: z.string(),
  })
  .strict();

export const SyllabusItemSchema: z.ZodType<SyllabusItem> = z
  .object({
    raw_label: z.string(),
    category: SyllabusCategorySchema,
    kind: MeasureKindSchema,
    value: z.string(),
    source_quote: z.string(),
    explanation: z.string(),
  })
  .strict();

export const LetterAnalysisSchema: z.ZodType<LetterAnalysis> = z
  .object({
    // Predates the multi-document split, so award letters written before the discriminant —
    // checked-in fixtures, samples, and sessionStorage entries — omit it and default here.
    document_type: z.literal("award_letter").default("award_letter"),
    school_name: z.string().nullable(),
    award_year: z.string().nullable(),
    cost_of_attendance: z
      .object({
        amount: z.number().nullable(),
        source_quote: z.string().nullable(),
      })
      .strict(),
    line_items: z.array(LineItemSchema),
    transcription: z.string(),
    missing_info: z.array(z.string()),
  })
  .strict();

export const SyllabusAnalysisSchema: z.ZodType<SyllabusAnalysis> = z
  .object({
    document_type: z.literal("syllabus"),
    course_name: z.string().nullable(),
    term: z.string().nullable(),
    items: z.array(SyllabusItemSchema),
    transcription: z.string(),
    missing_info: z.array(z.string()),
  })
  .strict();

/**
 * Parses either document shape. A syllabus is tagged with its discriminant so it is tried
 * first; anything else falls through to the award-letter schema, which defaults the
 * discriminant so documents produced before the split still parse. `z.discriminatedUnion`
 * would be stricter but cannot route award letters that omit the tag, which is exactly the
 * legacy case this must keep accepting.
 */
export const AnalysisSchema: z.ZodType<Analysis> = z.union([
  SyllabusAnalysisSchema,
  LetterAnalysisSchema,
]);

// Derived client-side only when periods are comparable:
// semester amounts are annualized ×2; total/unknown periods stay unprojected.
