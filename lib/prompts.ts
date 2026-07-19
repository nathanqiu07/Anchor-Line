import { financialAidGlossary } from "../packs/financial-aid";

export const TRANSCRIPTION_PROMPT =
  "Transcribe this financial aid award letter exactly, preserving line breaks and all dollar figures. Output plain text only.";

export const EXTRACTION_PROMPT = `Return only JSON matching the schema below. Use verbatim source_quote values copied from the transcription. Use null for unstated data; make no estimates. classify each dollar line as gift_aid, loan, work_study, or other. Use the pack glossary names and explanations when applicable.

Schema:
{
  "school_name": string | null,
  "award_year": string | null,
  "cost_of_attendance": { "amount": number | null, "source_quote": string | null },
  "line_items": [{ "raw_label": string, "category": "gift_aid" | "loan" | "work_study" | "other", "normalized_name": string, "amount": number | null, "period": "year" | "semester" | "total" | "unknown", "source_quote": string, "explanation": string }],
  "transcription": string,
  "missing_info": string[]
}`;

export function extractionPrompt(
  transcription: string,
  validationFeedback?: string,
): string {
  const glossary = Object.entries(financialAidGlossary)
    .map(([name, explanation]) => `- ${name}: ${explanation}`)
    .join("\n");

  return `${EXTRACTION_PROMPT}\n\nPack glossary:\n${glossary}${validationFeedback ? `\n\nValidation failed: ${validationFeedback}\nReturn corrected JSON only.` : ""}\n\nTranscription:\n${transcription}`;
}
