import { anchorQuote } from "../lib/anchor";
import type { LetterAnalysis, LineItem } from "../lib/schema";

export interface EvaluationResult {
  fieldAccuracy: number;
  matchedFields: number;
  totalFields: number;
  anchorVerification: number | null;
  verifiedAnchors: number;
  totalAnchors: number;
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function valuesForLineItem(item: LineItem | undefined): unknown[] {
  if (!item) {
    return [undefined, undefined, undefined, undefined, undefined, undefined, undefined];
  }

  return [item.raw_label, item.category, item.normalized_name, item.amount, item.period, item.source_quote, item.explanation];
}

function comparisonPairs(
  actual: LetterAnalysis,
  expected: LetterAnalysis,
): Array<[unknown, unknown]> {
  const actualBase = [
    actual.school_name,
    actual.award_year,
    actual.cost_of_attendance.amount,
    actual.cost_of_attendance.source_quote,
    actual.transcription,
    actual.missing_info,
    actual.line_items.length,
  ];
  const expectedBase = [
    expected.school_name,
    expected.award_year,
    expected.cost_of_attendance.amount,
    expected.cost_of_attendance.source_quote,
    expected.transcription,
    expected.missing_info,
    expected.line_items.length,
  ];
  const pairs = expectedBase.map(
    (expectedValue, index) => [actualBase[index], expectedValue] as [unknown, unknown],
  );

  const lineItemCount = Math.max(
    actual.line_items.length,
    expected.line_items.length,
  );
  for (let index = 0; index < lineItemCount; index += 1) {
    const expectedItem = expected.line_items[index];
    const actualValues = valuesForLineItem(actual.line_items[index]);
    const expectedValues = valuesForLineItem(expectedItem);
    pairs.push(
      ...expectedValues.map(
        (expectedValue, fieldIndex) =>
          [actualValues[fieldIndex], expectedValue] as [unknown, unknown],
      ),
    );
  }

  return pairs;
}

/** Compares a deterministic extracted analysis with its checked-in expectation. */
export function evaluateLetter(actual: LetterAnalysis, expected: LetterAnalysis): EvaluationResult {
  const fields = comparisonPairs(actual, expected);
  const totalFields = fields.length;
  const matchedFields = fields.filter(([actualValue, expectedValue]) =>
    sameValue(actualValue, expectedValue),
  ).length;
  const expectedAnchorClaims = [
    ...(expected.cost_of_attendance.source_quote
      ? [{
          expectedQuote: expected.cost_of_attendance.source_quote,
          actualQuote: actual.cost_of_attendance.source_quote,
        }]
      : []),
    ...expected.line_items.map((expectedItem, index) => ({
      expectedQuote: expectedItem.source_quote,
      actualQuote: actual.line_items[index]?.source_quote,
    })),
  ];
  const verifiedAnchors = expectedAnchorClaims.filter(
    ({ expectedQuote, actualQuote }) =>
      actualQuote === expectedQuote &&
      Boolean(anchorQuote(expected.transcription, expectedQuote)) &&
      Boolean(anchorQuote(actual.transcription, expectedQuote)),
  ).length;
  const extraCoaClaim =
    expected.cost_of_attendance.source_quote === null &&
    actual.cost_of_attendance.source_quote !== null
      ? 1
      : 0;
  const extraLineItemClaims = Math.max(
    0,
    actual.line_items.length - expected.line_items.length,
  );
  const totalAnchors =
    expectedAnchorClaims.length + extraCoaClaim + extraLineItemClaims;

  return {
    fieldAccuracy: totalFields === 0 ? 1 : matchedFields / totalFields,
    matchedFields,
    totalFields,
    anchorVerification: totalAnchors === 0 ? null : verifiedAnchors / totalAnchors,
    verifiedAnchors,
    totalAnchors,
  };
}

export function summarizeEvaluation(results: EvaluationResult[]): EvaluationResult {
  const matchedFields = results.reduce((total, result) => total + result.matchedFields, 0);
  const totalFields = results.reduce((total, result) => total + result.totalFields, 0);
  const verifiedAnchors = results.reduce((total, result) => total + result.verifiedAnchors, 0);
  const totalAnchors = results.reduce((total, result) => total + result.totalAnchors, 0);

  return {
    fieldAccuracy: totalFields === 0 ? 1 : matchedFields / totalFields,
    matchedFields,
    totalFields,
    anchorVerification: totalAnchors === 0 ? null : verifiedAnchors / totalAnchors,
    verifiedAnchors,
    totalAnchors,
  };
}

export function meetsAnchorThreshold(
  result: Pick<EvaluationResult, "anchorVerification" | "totalAnchors">,
  threshold = 0.85,
): boolean {
  return result.totalAnchors > 0 && (result.anchorVerification ?? 0) >= threshold;
}

export function meetsEvaluationThresholds(
  result: Pick<
    EvaluationResult,
    "anchorVerification" | "totalAnchors" | "fieldAccuracy"
  >,
  fieldThreshold = 0.85,
  anchorThreshold = 0.85,
): boolean {
  return (
    result.fieldAccuracy >= fieldThreshold &&
    meetsAnchorThreshold(result, anchorThreshold)
  );
}
