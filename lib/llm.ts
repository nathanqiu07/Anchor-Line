import { LetterAnalysisSchema, type LetterAnalysis } from "./schema";
import { extractionPrompt } from "./prompts";
import { decodeUploadText } from "./upload-contract";
import {
  hasAnyToken,
  hasDueBalanceOrRepayment,
  hasTokenStem,
  wordTokens,
} from "./token-context";
import {
  classifyAidItem,
  costOfAttendanceLabel,
  deriveAidPeriod,
} from "../packs/financial-aid";
import { createGeminiClient } from "./gemini";
import { extractPdfText } from "./pdf-text";
import {
  ExtractionQuotaError,
  type MessageResponse,
  type MessagesClient,
} from "./provider";

export type { MessagesClient } from "./provider";
export { ExtractionQuotaError } from "./provider";

export interface LetterInput {
  mimeType: "text/plain" | "application/pdf";
  bytes: Uint8Array;
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

/**
 * The upload carries no text that can be recovered exactly, so there is nothing safe to
 * anchor claims to. `kind` lets the route tell a student what to do about it, which differs
 * between a scanned PDF (retype or copy the text out) and a corrupt text file.
 */
export class UnreadableLetterError extends Error {
  readonly name = "UnreadableLetterError";

  constructor(readonly kind: "pdf" | "text") {
    super("This letter has no text that can be read exactly");
  }
}

// Google retires model ids for new keys without warning — 2.5-flash already 404s for them —
// so this needs revisiting when a 403/404 names the model.
const DEFAULT_MODEL = "gemini-3.6-flash";

/** The route turns this into a 503 before it reads any bytes off the request. */
export function isExtractionConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

const model = () => process.env.EXTRACTION_MODEL || DEFAULT_MODEL;

/**
 * Gemini 3.x spends this budget on internal reasoning before it emits any answer, and
 * gemini-3.6-flash rejects thinkingConfig.thinkingBudget: 0, so the cap has to cover both.
 * One Thornfield-sized letter measured 4.3k–7.7k reasoning tokens against a ~2.6k answer;
 * at the previous 8k cap reasoning consumed 7.7k and the response truncated to MAX_TOKENS.
 * This is a ceiling, not a reservation — unused tokens are neither billed nor generated.
 */
const MAX_OUTPUT_TOKENS = 32_000;

function defaultClient(): MessagesClient {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set; extraction cannot run");
  return createGeminiClient(apiKey);
}

function textFrom(response: MessageResponse): string {
  if (response.stop_reason !== "end_turn") {
    throw new ExtractionValidationError(
      `extraction response did not complete normally (stop_reason: ${response.stop_reason ?? "missing"})`,
    );
  }

  const text = response.content
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("");
  if (!text) throw new ExtractionValidationError("Response did not contain text");
  return text;
}

/**
 * Gemini frequently wraps JSON in a markdown code fence despite being told to return JSON
 * only, and does so non-deterministically — the same request succeeds bare on one call and
 * fenced on the next. Stripping the fence here keeps that from burning the corrective retry.
 */
function stripCodeFence(text: string): string {
  const fenced = text.trim().match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/i);
  return fenced ? fenced[1].trim() : text;
}

function parseJson(text: string): unknown {
  return JSON.parse(stripCodeFence(text));
}

function validationFeedback(error: unknown): string {
  // This type's message is a fixed user-facing string; the actionable reason is in feedback,
  // and the corrective retry is worthless without it.
  if (error instanceof ExtractionValidationError) return error.feedback;
  return error instanceof Error ? error.message : "Invalid JSON output";
}

const conditionalIntentTokens = new Set([
  "may",
  "might",
  "could",
  "unless",
  "if",
]);
const noticeTokens = new Set(["notice", "notification", "letter", "statement"]);
const financialSubjectTokens = new Set([
  "aid",
  "award",
  "awards",
  "grant",
  "grants",
  "scholarship",
  "scholarships",
  "loan",
  "loans",
]);
const adverseIntentStems = [
  "cancel",
  "deni",
  "resci",
  "ineligib",
  "overpay",
] as const;
const maxPreambleLines = 8;
const maxAdjacentHeadingLines = 3;

function preambleTokenWindows(transcription: string): string[][] {
  const lines = transcription
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const firstMonetaryLine = lines.findIndex((line) => /\$\s*\d/.test(line));
  const preambleEnd = Math.min(
    firstMonetaryLine === -1 ? lines.length : firstMonetaryLine,
    maxPreambleLines,
  );
  const preamble = lines.slice(0, preambleEnd).map(wordTokens);
  const windows: string[][] = [];

  for (let start = 0; start < preamble.length; start += 1) {
    let adjacent: string[] = [];
    for (
      let width = 0;
      width < maxAdjacentHeadingLines && start + width < preamble.length;
      width += 1
    ) {
      adjacent = [...adjacent, ...preamble[start + width]];
      windows.push(adjacent);
    }
  }
  return windows;
}

function hasAdverseDocumentIntent(transcription: string): boolean {
  return preambleTokenWindows(transcription).some((tokens) => {
    if (hasAnyToken(tokens, conditionalIntentTokens)) return false;

    const hasFinancialSubject = hasAnyToken(tokens, financialSubjectTokens);
    const hasExplicitAdverseIntent = hasTokenStem(tokens, adverseIntentStems);
    const hasCollectionNotice =
      hasTokenStem(tokens, ["collect"]) && hasAnyToken(tokens, noticeTokens);
    return (
      hasFinancialSubject &&
      (hasExplicitAdverseIntent ||
        hasDueBalanceOrRepayment(tokens) ||
        hasCollectionNotice)
    );
  });
}

/** Shared with the text-layer gate, which has to reach this verdict before spending a call. */
function hasAwardContext(text: string): boolean {
  return (
    /\b(?:financial\s+aid\s+(?:offer|award|package|summary)|award\s+(?:offer|summary|notification|letter)|aid\s+notification|offered\s+aid|aid\s+offered|offer\s+details|your\s+offered\s+aid|we\s+(?:offer|award)|you\s+(?:are|have\s+been)\s+awarded|(?:aid|award)\s+granted)\b/i.test(
      text,
    ) ||
    /\b(?:aid|award|grant|scholarship|loan|work[ -]?study)\b[^\r\n]{0,32}\b(?:offered|granted|awarded)\b/i.test(
      text,
    ) ||
    /\b(?:offered|granted|awarded)\b[^\r\n]{0,32}\b(?:aid|award|grant|scholarship|loan|work[ -]?study)\b/i.test(
      text,
    )
  );
}

function assertAwardLetter(
  analysis: LetterAnalysis,
  transcription: string,
): LetterAnalysis {
  const hasRecognizedAid = analysis.line_items.some(
    (item) => classifyAidItem(item.raw_label, item.source_quote).recognized,
  );
  if (
    hasAdverseDocumentIntent(transcription) ||
    !hasRecognizedAid ||
    !hasAwardContext(transcription)
  ) {
    throw new NotAwardLetterError();
  }
  return analysis;
}

function provenanceError(message: string): Error {
  return new Error(`Provenance validation failed: ${message}`);
}

/**
 * Letters state amounts either as "$900" or spelled out as "900 dollars". Both are evidence,
 * so both count as monetary occurrences — a quote that only spells it out would otherwise be
 * unable to support any amount, and the letter's stated figure would be silently dropped.
 */
const dashes = "\\-\u2212\u2013\u2014";

/**
 * Captures the sign as well as the figure. Letters write reductions as "-$300" and, on
 * statement-style lines, as "($300)". Reading either as positive turns a deduction into an
 * award, overstating aid and understating what the student owes.
 *
 * A dash only counts as a minus when it sits tight against the amount. Letters routinely
 * use a spaced dash as a separator — "Federal Pell Grant - $3,200" — and reading that as
 * negative would invert an ordinary grant, which is the same error in the other direction.
 */
const dollarPattern = new RegExp(
  [
    `\\(\\s*\\$\\s*\\d[\\d,]*(?:\\.\\d{1,2})?\\s*\\)`,
    `[${dashes}]\\$\\s*\\d[\\d,]*(?:\\.\\d{1,2})?`,
    `\\$[${dashes}]\\s*\\d[\\d,]*(?:\\.\\d{1,2})?`,
    `\\$\\s*\\d[\\d,]*(?:\\.\\d{1,2})?`,
    `\\b[${dashes}]?\\d[\\d,]*(?:\\.\\d{1,2})?\\s+dollars?\\b`,
  ].join("|"),
  "gi",
);

interface DollarOccurrence {
  amount: number;
  start: number;
  end: number;
}

const signedMatch = new RegExp(`^[${dashes}]|[${dashes}]\\s*\\d|^\\(`);
const strippable = new RegExp(`[$,\\s()${dashes}]`, "g");

function amountFromMatch(raw: string): number {
  // Parentheses are the accounting convention for a negative figure.
  const negative = signedMatch.test(raw.trimStart());
  const magnitude = Number(raw.replace(/dollars?/gi, "").replace(strippable, ""));
  return negative ? -magnitude : magnitude;
}

function dollarOccurrences(text: string): DollarOccurrence[] {
  return [...text.matchAll(dollarPattern)].map((match) => ({
    amount: amountFromMatch(match[0]),
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
    throw provenanceError("transcription must exactly match the letter text");
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
      // A recognized term contradicting the model is a real disagreement between two
      // informed opinions, so the corrective retry gets a chance to fix it. An unrecognized
      // one only means the pack does not know this school's wording — downgrading that line
      // to "other" is safe (it asserts nothing about repayment) and beats failing the whole
      // letter over one unfamiliar label.
      if (classification.recognized && item.category !== classification.category) {
        throw provenanceError(
          `${item.raw_label} category must be ${classification.category}, not ${item.category}`,
        );
      }

      return {
        ...item,
        category: classification.category,
        normalized_name: classification.normalizedName,
        explanation: classification.explanation,
        period: deriveAidPeriod(item.source_quote, transcription),
      };
    }),
  };
}

const minimumRecognizedAidLines = 2;

/** A line stripped of its leader dots and monetary occurrences, which is what a model reads as the label. */
function labelFromLine(line: string): string {
  return line
    .replace(dollarPattern, " ")
    .replace(/\.{2,}/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Decides whether a PDF text layer is exact enough to anchor claims to. Each check
 * mirrors an invariant the pipeline enforces later, so a text layer that would fail
 * provenance is rejected before it costs a model call rather than after.
 */
export function isUsableTextLayer(text: string): boolean {
  const dollarLines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => dollarAmounts(line).length > 0);

  // Two amounts on one line means the extractor collapsed adjacent columns, which breaks
  // the one-amount-per-label binding that assertProvenance requires.
  if (dollarLines.some((line) => dollarAmounts(line).length > 1)) return false;
  if (!hasAwardContext(text)) return false;

  const recognized = dollarLines.filter(
    (line) => classifyAidItem(labelFromLine(line), line).recognized,
  );
  return recognized.length >= minimumRecognizedAidLines;
}

/**
 * Produces the transcription every later claim is anchored to, without a model ever reading
 * the letter. A plain-text upload is already the transcription. A digital PDF carries one in
 * its text layer, read deterministically and then gated before it is trusted.
 *
 * There is deliberately no OCR fallback. A scan has no text to recover, and transcribing it
 * by vision would produce a plausible reading that provenance checks would then happily
 * confirm against itself — a confident, fully "anchored", and possibly wrong answer. Failing
 * here instead sends the student back with something they can fix.
 */
async function transcribe(
  input: LetterInput,
  readPdfText: PdfTextReader,
): Promise<string> {
  if (input.mimeType === "text/plain") {
    const text = decodeUploadText(input.bytes);
    if (text === null) throw new UnreadableLetterError("text");
    return text;
  }

  const text = await readPdfText(input.bytes);
  if (text === null || !isUsableTextLayer(text)) {
    throw new UnreadableLetterError("pdf");
  }
  return text;
}

/** Injected the same way the messages client is, so tier selection is testable without a real PDF. */
export type PdfTextReader = (bytes: Uint8Array) => Promise<string | null>;

export async function extractLetter(
  input: LetterInput,
  client: MessagesClient = defaultClient(),
  readPdfText: PdfTextReader = extractPdfText,
): Promise<LetterAnalysis> {
  const transcription = await transcribe(input, readPdfText);
  let feedback: string | undefined;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const extractionResponse = await client.create({
      model: model(),
      max_tokens: MAX_OUTPUT_TOKENS,
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
        parseJson(textFrom(extractionResponse)),
      );
      const proven = assertProvenance(parsed, transcription);
      const award = assertAwardLetter(proven, transcription);
      return normalizeSemantics(award, transcription);
    } catch (error) {
      if (error instanceof NotAwardLetterError) throw error;
      // Retrying an exhausted quota cannot succeed and would waste a second call.
      if (error instanceof ExtractionQuotaError) throw error;
      feedback = validationFeedback(error);
    }
  }

  throw new ExtractionValidationError(feedback ?? "Invalid JSON output");
}
