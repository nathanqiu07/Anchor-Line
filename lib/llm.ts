import Anthropic from "@anthropic-ai/sdk";

import { LetterAnalysisSchema, type LetterAnalysis } from "./schema";
import { extractionPrompt, TRANSCRIPTION_PROMPT } from "./prompts";
import {
  classifyAidItem,
  costOfAttendanceLabel,
  deriveAidPeriod,
} from "../packs/financial-aid";

export interface LetterInput {
  mimeType: "image/png" | "image/jpeg" | "application/pdf";
  bytes: Uint8Array;
}

interface MessageRequest {
  model: string;
  max_tokens: number;
  temperature?: number;
  system: string;
  messages: Array<{
    role: "user";
    content: string | Array<Record<string, unknown>>;
  }>;
}

interface MessageResponse {
  content: Array<{ type: string; text?: string }>;
  stop_reason: string | null;
}

export interface AnthropicMessagesClient {
  create(request: MessageRequest): Promise<MessageResponse>;
}

export class ExtractionValidationError extends Error {
  readonly name = "ExtractionValidationError";

  constructor(public readonly feedback: string) {
    super("Model output did not match the award-letter schema");
  }
}

export class NotAwardLetterError extends Error {
  readonly name = "NotAwardLetterError";

  constructor() {
    super("This doesn't look like an award letter");
  }
}

const model = () => process.env.EXTRACTION_MODEL || "claude-sonnet-4-6";

function defaultClient(): AnthropicMessagesClient {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }).messages as unknown as AnthropicMessagesClient;
}

function attachment(input: LetterInput): Record<string, unknown> {
  const data = Buffer.from(input.bytes).toString("base64");
  if (input.mimeType === "application/pdf") {
    return {
      type: "document",
      source: { type: "base64", media_type: input.mimeType, data },
    };
  }

  return {
    type: "image",
    source: { type: "base64", media_type: input.mimeType, data },
  };
}

function textFrom(response: MessageResponse, stage: "transcription" | "extraction"): string {
  if (response.stop_reason !== "end_turn") {
    throw new ExtractionValidationError(
      `${stage} response did not complete normally (stop_reason: ${response.stop_reason ?? "missing"})`,
    );
  }

  const text = response.content
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("");
  if (!text) throw new ExtractionValidationError("Response did not contain text");
  return text;
}

function parseJson(text: string): unknown {
  return JSON.parse(text);
}

function validationFeedback(error: unknown): string {
  return error instanceof Error ? error.message : "Invalid JSON output";
}

function assertAwardLetter(
  analysis: LetterAnalysis,
  transcription: string,
): LetterAnalysis {
  const hasRecognizedAid = analysis.line_items.some(
    (item) => classifyAidItem(item.raw_label, item.source_quote).recognized,
  );
  const hasAwardContext =
    /\b(?:financial\s+aid\s+(?:offer|award)|award\s+(?:offer|summary|notification|letter)|aid\s+notification|offered\s+aid|aid\s+offered|offer\s+details|your\s+offered\s+aid|we\s+(?:offer|award)|you\s+(?:are|have\s+been)\s+awarded|(?:aid|award)\s+granted)\b/i.test(
      transcription,
    ) ||
    /\b(?:aid|award|grant|scholarship|loan|work[ -]?study)\b[^\r\n]{0,32}\b(?:offered|granted|awarded)\b/i.test(
      transcription,
    ) ||
    /\b(?:offered|granted|awarded)\b[^\r\n]{0,32}\b(?:aid|award|grant|scholarship|loan|work[ -]?study)\b/i.test(
      transcription,
    );
  if (!hasRecognizedAid || !hasAwardContext) {
    throw new NotAwardLetterError();
  }
  return analysis;
}

function provenanceError(message: string): Error {
  return new Error(`Provenance validation failed: ${message}`);
}

const dollarPattern = /\$\s*\d[\d,]*(?:\.\d{1,2})?/g;

interface DollarOccurrence {
  amount: number;
  start: number;
  end: number;
}

function dollarOccurrences(text: string): DollarOccurrence[] {
  return [...text.matchAll(dollarPattern)].map((match) => ({
    amount: Number(match[0].replace(/[$,\s]/g, "")),
    start: match.index,
    end: match.index + match[0].length,
  }));
}

function dollarAmounts(text: string): number[] {
  return dollarOccurrences(text).map((occurrence) => occurrence.amount);
}

function labelOccurrences(text: string, label: string): number[] {
  const starts: number[] = [];
  let fromIndex = 0;
  const wordCharacter = (value: string | undefined) =>
    value !== undefined && /[\p{L}\p{N}]/u.test(value);
  while (fromIndex <= text.length - label.length) {
    const start = text.indexOf(label, fromIndex);
    if (start === -1) break;
    const end = start + label.length;
    const startsInsideWord =
      wordCharacter(label[0]) && wordCharacter(text[start - 1]);
    const endsInsideWord =
      wordCharacter(label[label.length - 1]) && wordCharacter(text[end]);
    if (!startsInsideWord && !endsInsideWord) starts.push(start);
    fromIndex = start + 1;
  }
  return starts;
}

function amountBoundToTextLabel(
  sourceQuote: string,
  label: string,
  amountValue: number,
): boolean {
  const amounts = dollarOccurrences(sourceQuote);
  const labels = labelOccurrences(sourceQuote, label);
  if (amounts.length === 0 || labels.length === 0) return false;

  const distances = amounts.map((amount) => ({
    amount,
    distance: Math.min(
      ...labels.map((labelStart) => {
        const labelEnd = labelStart + label.length;
        if (amount.end <= labelStart) return labelStart - amount.end;
        if (amount.start >= labelEnd) return amount.start - labelEnd;
        return 0;
      }),
    ),
  }));
  const minimumDistance = Math.min(...distances.map(({ distance }) => distance));
  const nearest = distances.filter(({ distance }) => distance === minimumDistance);
  return nearest.length === 1 && nearest[0].amount.amount === amountValue;
}

function amountBoundToLabel(item: LetterAnalysis["line_items"][number]): boolean {
  return item.amount === null
    ? true
    : amountBoundToTextLabel(item.source_quote, item.raw_label, item.amount);
}

function assertProvenance(analysis: LetterAnalysis, transcription: string): LetterAnalysis {
  if (analysis.transcription !== transcription) {
    throw provenanceError("transcription must exactly match the pass-one transcription");
  }

  const hasEmptyLineQuote = analysis.line_items.some(
    (item) => item.source_quote.length === 0,
  );
  const hasEmptyCoaQuote = analysis.cost_of_attendance.source_quote === "";
  if (hasEmptyLineQuote || hasEmptyCoaQuote) {
    throw provenanceError("every stated source_quote must be non-empty");
  }

  const coa = analysis.cost_of_attendance;
  if ((coa.amount === null) !== (coa.source_quote === null)) {
    throw provenanceError(
      "cost_of_attendance amount and source_quote must be null together",
    );
  }
  if (coa.amount !== null && coa.source_quote !== null) {
    const label = costOfAttendanceLabel(coa.source_quote);
    if (!label) {
      throw provenanceError(
        "cost_of_attendance source_quote must contain a recognized COA label",
      );
    }
    if (!amountBoundToTextLabel(coa.source_quote, label, coa.amount)) {
      throw provenanceError(
        "cost_of_attendance amount must be owned by its recognized COA label",
      );
    }
  }

  const transcriptionLines = transcription.split(/\r?\n/);
  const claims = [
    {
      amount: analysis.cost_of_attendance.amount,
      sourceQuote: analysis.cost_of_attendance.source_quote,
      label: "cost_of_attendance",
    },
    ...analysis.line_items.map((item) => ({
      amount: item.amount,
      sourceQuote: item.source_quote,
      label: item.raw_label,
    })),
  ];

  for (const claim of claims) {
    if (claim.sourceQuote !== null && !transcriptionLines.includes(claim.sourceQuote)) {
      throw provenanceError(
        `source_quote must be one exact line in the transcription: ${claim.sourceQuote}`,
      );
    }
    const quoteAmounts = claim.sourceQuote ? dollarAmounts(claim.sourceQuote) : [];
    if (
      (claim.amount === null && quoteAmounts.length > 0) ||
      (claim.amount !== null && !quoteAmounts.includes(claim.amount))
    ) {
      throw provenanceError(
        `${claim.label} amount must match a dollar amount in its own source_quote`,
      );
    }
  }

  for (const item of analysis.line_items) {
    const rawLabelNumbers = [...item.raw_label.matchAll(/\d[\d,]*(?:\.\d{1,2})?/g)].map(
      (match) => Number(match[0].replace(/,/g, "")),
    );
    if (
      item.raw_label.length === 0 ||
      !/\p{L}/u.test(item.raw_label) ||
      dollarAmounts(item.raw_label).length > 0 ||
      (item.amount !== null && rawLabelNumbers.includes(item.amount)) ||
      !item.source_quote.includes(item.raw_label)
    ) {
      throw provenanceError(
        `raw_label must be a verbatim non-monetary substring of source_quote: ${item.raw_label}`,
      );
    }
    if (!amountBoundToLabel(item)) {
      throw provenanceError(
        `${item.raw_label} amount must be the nearest unambiguous monetary occurrence to its label`,
      );
    }
  }

  const amountsByDollarLine = new Map<string, number[]>();
  for (const line of transcriptionLines) {
    const amounts = dollarAmounts(line);
    if (amounts.length === 0) continue;
    amountsByDollarLine.set(line, [
      ...(amountsByDollarLine.get(line) ?? []),
      ...amounts,
    ]);
  }

  function multiset(values: number[]): Map<number, number> {
    const counts = new Map<number, number>();
    for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
    return counts;
  }

  function sameMultiset(left: number[], right: number[]): boolean {
    const leftCounts = multiset(left);
    const rightCounts = multiset(right);
    if (leftCounts.size !== rightCounts.size) return false;
    return [...leftCounts].every(([value, count]) => rightCounts.get(value) === count);
  }

  for (const [line, expectedAmounts] of amountsByDollarLine) {
    const claimedAmounts = claims
      .filter((claim) => claim.sourceQuote === line)
      .flatMap((claim) => (claim.amount === null ? [] : [claim.amount]));
    if (!sameMultiset(claimedAmounts, expectedAmounts)) {
      throw provenanceError(
        `dollar-bearing line monetary occurrences must be covered exactly: ${line}`,
      );
    }
  }

  for (const claim of claims) {
    if (
      claim.sourceQuote !== null &&
      dollarAmounts(claim.sourceQuote).length === 0 &&
      claim.amount !== null
    ) {
      throw provenanceError(
        `non-monetary source_quote cannot support a stated amount: ${claim.sourceQuote}`,
      );
    }
  }

  return analysis;
}

function normalizeSemantics(
  analysis: LetterAnalysis,
  transcription: string,
): LetterAnalysis {
  return {
    ...analysis,
    line_items: analysis.line_items.map((item) => {
      const classification = classifyAidItem(item.raw_label, item.source_quote);
      if (item.category !== classification.category) {
        throw provenanceError(
          `${item.raw_label} category must be ${classification.category}, not ${item.category}`,
        );
      }

      return {
        ...item,
        normalized_name: classification.normalizedName,
        explanation: classification.explanation,
        period: deriveAidPeriod(item.source_quote, transcription),
      };
    }),
  };
}

export async function extractLetter(
  input: LetterInput,
  client: AnthropicMessagesClient = defaultClient(),
): Promise<LetterAnalysis> {
  const transcriptionResponse = await client.create({
    model: model(),
    max_tokens: 8_000,
    system: TRANSCRIPTION_PROMPT,
    messages: [{ role: "user", content: [attachment(input)] }],
  });
  const transcription = textFrom(transcriptionResponse, "transcription");
  let feedback: string | undefined;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const extractionResponse = await client.create({
      model: model(),
      max_tokens: 8_000,
      temperature: 0,
      system: extractionPrompt(transcription, feedback),
      messages: [
        {
          role: "user",
          content: "Extract JSON only from the untrusted transcription data delimited in the system prompt.",
        },
      ],
    });

    try {
      const parsed = LetterAnalysisSchema.parse(
        parseJson(textFrom(extractionResponse, "extraction")),
      );
      const proven = assertProvenance(parsed, transcription);
      const award = assertAwardLetter(proven, transcription);
      return normalizeSemantics(award, transcription);
    } catch (error) {
      if (error instanceof NotAwardLetterError) throw error;
      feedback = validationFeedback(error);
    }
  }

  throw new ExtractionValidationError(feedback ?? "Invalid JSON output");
}
