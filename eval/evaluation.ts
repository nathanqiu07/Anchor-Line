import { anchorQuote } from "../lib/anchor";
import type { LetterAnalysis, LineItem } from "../lib/schema";

export interface EvaluationResult {
  fieldAccuracy: number;
  matchedFields: number;
  totalFields: number;
  anchorVerification: number;
  verifiedAnchors: number;
  totalAnchors: number;
}

export type EvaluationSummary = EvaluationResult;

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function valuesForLineItem(item: LineItem | undefined): unknown[] {
  if (!item) {
    return [undefined, undefined, undefined, undefined, undefined, undefined, undefined];
  }

  return [item.raw_label, item.category, item.normalized_name, item.amount, item.period, item.source_quote, item.explanation];
}

function comparisonFields(analysis: LetterAnalysis): unknown[] {
  return [analysis.school_name, analysis.award_year, analysis.cost_of_attendance.amount, analysis.cost_of_attendance.source_quote, analysis.transcription, analysis.missing_info, analysis.line_items.length, ...analysis.line_items.flatMap(valuesForLineItem)];
}

function sourceQuotes(analysis: LetterAnalysis): string[] {
  return [...(analysis.cost_of_attendance.source_quote ? [analysis.cost_of_attendance.source_quote] : []), ...analysis.line_items.map((item) => item.source_quote)];
}

/** Compares a deterministic extracted analysis with its checked-in expectation. */
export function evaluateLetter(actual: LetterAnalysis, expected: LetterAnalysis): EvaluationResult {
  const actualFields = comparisonFields(actual);
  const expectedFields = comparisonFields(expected);
  const totalFields = Math.max(actualFields.length, expectedFields.length);
  const matchedFields = Array.from({ length: totalFields }, (_, index) => sameValue(actualFields[index], expectedFields[index])).filter(Boolean).length;
  const quotes = sourceQuotes(actual);
  const verifiedAnchors = quotes.filter((quote) => anchorQuote(actual.transcription, quote)).length;
  const totalAnchors = quotes.length;

  return {
    fieldAccuracy: totalFields === 0 ? 1 : matchedFields / totalFields,
    matchedFields,
    totalFields,
    anchorVerification: totalAnchors === 0 ? 1 : verifiedAnchors / totalAnchors,
    verifiedAnchors,
    totalAnchors,
  };
}

export function summarizeEvaluation(results: EvaluationResult[]): EvaluationSummary {
  const matchedFields = results.reduce((total, result) => total + result.matchedFields, 0);
  const totalFields = results.reduce((total, result) => total + result.totalFields, 0);
  const verifiedAnchors = results.reduce((total, result) => total + result.verifiedAnchors, 0);
  const totalAnchors = results.reduce((total, result) => total + result.totalAnchors, 0);

  return {
    fieldAccuracy: totalFields === 0 ? 1 : matchedFields / totalFields,
    matchedFields,
    totalFields,
    anchorVerification: totalAnchors === 0 ? 1 : verifiedAnchors / totalAnchors,
    verifiedAnchors,
    totalAnchors,
  };
}
