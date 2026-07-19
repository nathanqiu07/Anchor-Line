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

function quoteRanges(transcription: string, quote: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  let start = transcription.indexOf(quote);
  while (start !== -1) {
    ranges.push([start, start + quote.length]);
    start = transcription.indexOf(quote, start + quote.length);
  }
  return ranges;
}

function dollarLine(transcription: string, index: number): string {
  const start = transcription.lastIndexOf("\n", index) + 1;
  const end = transcription.indexOf("\n", index);
  return transcription.slice(start, end === -1 ? undefined : end);
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

  const quotes = [
    analysis.cost_of_attendance.source_quote,
    ...analysis.line_items.map((item) => item.source_quote),
  ].filter((quote): quote is string => quote !== null);

  for (const quote of quotes) {
    if (!transcription.includes(quote)) {
      throw provenanceError(`source_quote is not verbatim in the transcription: ${quote}`);
    }
  }

  const coveredRanges = quotes.flatMap((quote) => quoteRanges(transcription, quote));
  const dollarPattern = /\$\d[\d,]*(?:\.\d{2})?/g;
  for (const match of transcription.matchAll(dollarPattern)) {
    const index = match.index ?? -1;
    const covered = coveredRanges.some(
      ([start, end]) => start <= index && end >= index + match[0].length,
    );
    if (!covered) {
      throw provenanceError(
        `dollar-bearing line must have a source_quote: ${dollarLine(transcription, index)}`,
      );
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
