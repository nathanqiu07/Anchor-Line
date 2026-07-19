import Anthropic from "@anthropic-ai/sdk";

import { LetterAnalysisSchema, type LetterAnalysis } from "./schema";
import { extractionPrompt, TRANSCRIPTION_PROMPT } from "./prompts";

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

function textFrom(response: MessageResponse): string {
  const text = response.content.find((block) => block.type === "text")?.text;
  if (!text) throw new ExtractionValidationError("Response did not contain text");
  return text;
}

function parseJson(text: string): unknown {
  return JSON.parse(text);
}

function validationFeedback(error: unknown): string {
  return error instanceof Error ? error.message : "Invalid JSON output";
}

function assertAwardLetter(analysis: LetterAnalysis): LetterAnalysis {
  if (
    analysis.school_name === null &&
    analysis.line_items.length === 0 &&
    analysis.cost_of_attendance.amount === null
  ) {
    throw new NotAwardLetterError();
  }
  return analysis;
}

function provenanceError(message: string): Error {
  return new Error(`Provenance validation failed: ${message}`);
}

const dollarPattern = /\$\s*\d[\d,]*(?:\.\d{1,2})?/g;

function dollarAmounts(text: string): number[] {
  return [...text.matchAll(dollarPattern)].map((match) =>
    Number(match[0].replace(/[$,\s]/g, "")),
  );
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

  const quotes = claims
    .map((claim) => claim.sourceQuote)
    .filter((quote): quote is string => quote !== null);

  for (const quote of quotes) {
    if (!transcription.includes(quote)) {
      throw provenanceError(`source_quote is not verbatim in the transcription: ${quote}`);
    }
  }

  for (const claim of claims) {
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

  const dollarLines = transcription
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && dollarAmounts(line).length > 0);
  const mappedClaimIndexes = new Set<number>();

  for (const line of dollarLines) {
    const matchingClaimIndexes = claims.flatMap((claim, index) =>
      claim.sourceQuote === line ? [index] : [],
    );
    if (matchingClaimIndexes.length !== 1) {
      throw provenanceError(
        `dollar-bearing line must equal one distinct source_quote: ${line}`,
      );
    }

    const claimIndex = matchingClaimIndexes[0];
    if (mappedClaimIndexes.has(claimIndex)) {
      throw provenanceError(`source_quote cannot satisfy multiple dollar lines: ${line}`);
    }
    mappedClaimIndexes.add(claimIndex);
  }

  for (const [index, claim] of claims.entries()) {
    if (claim.sourceQuote && dollarAmounts(claim.sourceQuote).length > 0 && !mappedClaimIndexes.has(index)) {
      throw provenanceError(`monetary source_quote must map to one dollar-bearing line: ${claim.sourceQuote}`);
    }
  }

  return analysis;
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
  const transcription = textFrom(transcriptionResponse);
  let feedback: string | undefined;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const extractionResponse = await client.create({
      model: model(),
      max_tokens: 8_000,
      temperature: 0,
      system: extractionPrompt(transcription, feedback),
      messages: [{ role: "user", content: transcription }],
    });

    try {
      const parsed = LetterAnalysisSchema.parse(parseJson(textFrom(extractionResponse)));
      return assertAwardLetter(assertProvenance(parsed, transcription));
    } catch (error) {
      if (error instanceof NotAwardLetterError) throw error;
      feedback = validationFeedback(error);
    }
  }

  throw new ExtractionValidationError(feedback ?? "Invalid JSON output");
}
