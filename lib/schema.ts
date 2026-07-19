import { z } from "zod";

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

export const LetterAnalysisSchema: z.ZodType<LetterAnalysis> = z
  .object({
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

// Derived client-side only when periods are comparable:
// semester amounts are annualized ×2; total/unknown periods stay unprojected.
