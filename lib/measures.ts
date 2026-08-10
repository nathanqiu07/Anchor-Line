/**
 * Generalizes the dollar-anchoring machinery that `lib/llm.ts` uses for award letters so it
 * can also anchor the numbers that matter on a syllabus — percentages, points, counts,
 * credit hours, dates, and times. The trust model is identical to the money path: a claimed
 * value must be a verbatim token that appears on its own source line, and it must be the
 * *unambiguously nearest* occurrence of its own kind to the claim's label. Only the token
 * shapes differ, so this file owns the token shapes and the label-binding math, and the
 * dollar path reuses the same binding function.
 */

export const MEASURE_KINDS = [
  "percent",
  "points",
  "count",
  "hours",
  "date",
  "time",
  "number",
] as const;

export type MeasureKind = (typeof MEASURE_KINDS)[number];

export interface Occurrence<T> {
  value: T;
  start: number;
  end: number;
}

export interface MeasureOccurrence extends Occurrence<string> {
  /** The verbatim token exactly as it appears in the source line. */
  value: string;
}

/**
 * One regex per kind, each capturing the whole verbatim token (number *and* its unit) so the
 * matched text can be compared directly against a model-authored `value`. `count` and
 * `number` are the fallbacks — a bare integer and a bare decimal respectively — used when a
 * value carries no unit of its own ("3 exams" stores "3"). The unit-bearing kinds are kept
 * distinct so a percent is never mistaken for a nearby point total when binding to a label.
 */
const measurePatterns: Record<MeasureKind, () => RegExp> = {
  percent: () => /\d[\d,]*(?:\.\d+)?\s*(?:%|percent\b)/gi,
  points: () => /\d[\d,]*(?:\.\d+)?\s*(?:points?|pts?|marks?)\b/gi,
  hours: () =>
    /\d+(?:\.\d+)?\s*(?:credit\s+hours?|credit\s+units?|semester\s+hours?|credits?|units?)\b/gi,
  count: () => /\d+/g,
  number: () => /\d[\d,]*(?:\.\d+)?/g,
  date: () =>
    /(?:\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s*\d{4})?)|(?:\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b)/gi,
  time: () => /\b\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)|\b\d{1,2}:\d{2}\b/gi,
};

/** Locates every verbatim token of a given kind, mirroring `dollarOccurrences` in `llm.ts`. */
export function measureOccurrences(text: string, kind: MeasureKind): MeasureOccurrence[] {
  return [...text.matchAll(measurePatterns[kind]())].map((match) => ({
    value: match[0],
    start: match.index,
    end: match.index + match[0].length,
  }));
}

/** Folds case and collapses internal whitespace so "10:00 AM" and "10:00 am" compare equal. */
export function normalizeMeasureValue(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export function measureValuesEqual(left: string, right: string): boolean {
  return normalizeMeasureValue(left) === normalizeMeasureValue(right);
}

/**
 * Every start offset where `label` appears as a whole token in `text` (never inside a longer
 * word). Shared verbatim with the former private helper in `lib/llm.ts` so the dollar and
 * measure paths bind labels identically.
 */
export function labelOccurrences(text: string, label: string): number[] {
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

/**
 * True only when `target` is the single closest occurrence to some occurrence of `label`.
 * This is the exact binding rule the award-letter provenance check has always used for dollar
 * amounts, lifted here so both the money path and the syllabus path enforce it the same way:
 * a label that sits between two values of the same kind cannot silently claim the far one, and
 * a tie (two equally-near occurrences) is treated as ambiguous and rejected.
 */
export function valueBoundToLabel<T>(
  sourceQuote: string,
  label: string,
  occurrences: Occurrence<T>[],
  target: T,
  equals: (candidate: T, target: T) => boolean = Object.is,
): boolean {
  const labels = labelOccurrences(sourceQuote, label);
  if (occurrences.length === 0 || labels.length === 0) return false;

  const distances = occurrences.map((occurrence) => ({
    occurrence,
    distance: Math.min(
      ...labels.map((labelStart) => {
        const labelEnd = labelStart + label.length;
        if (occurrence.end <= labelStart) return labelStart - occurrence.end;
        if (occurrence.start >= labelEnd) return occurrence.start - labelEnd;
        return 0;
      }),
    ),
  }));
  const minimumDistance = Math.min(...distances.map(({ distance }) => distance));
  const nearest = distances.filter(({ distance }) => distance === minimumDistance);
  return nearest.length === 1 && equals(nearest[0].occurrence.value, target);
}
