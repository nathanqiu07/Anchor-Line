import type { SyllabusAnalysis, SyllabusCategory, SyllabusItem } from "../lib/schema";
import { measureOccurrences, normalizeMeasureValue, type MeasureKind } from "../lib/measures";

/**
 * The deterministic, model-free layer for syllabi — the counterpart to
 * `packs/financial-aid.ts`. Once an extraction has passed provenance, everything here is a
 * pure function over already-verified data: it classifies each important number into a typed
 * category, derives the kind of number from the value's own token shape (never trusting the
 * model's label), explains it in plain language, and surfaces the sanity checks a student
 * actually cares about — most importantly, whether the grade weights add up to 100%.
 */

export interface SyllabusClassification {
  category: SyllabusCategory;
  normalizedName: string;
  explanation: string;
  recognized: boolean;
}

const explanations = {
  gradeWeight:
    "This is how much of the final grade this component is worth. Weights should total 100%.",
  gradingScale:
    "This is the score threshold for a letter grade — the minimum needed to earn it.",
  assessmentCount:
    "This is how many of this kind of assessment the course includes.",
  latePenalty:
    "This is a deduction applied to late or missed work, so a late submission is worth less.",
  attendancePenalty:
    "Attendance affects the grade here: missing class can lower what you earn.",
  creditHours:
    "This is the course's credit-hour (or unit) value, which counts toward your enrollment load.",
  scheduleDate:
    "This is a date on the course calendar, such as a due date or an exam date.",
  scheduleTime:
    "This is a time on the course schedule, such as a class meeting or office hours.",
  logistics:
    "This is a course logistics number, such as a section, room, or contact number.",
  other:
    "The syllabus does not give enough context to classify this number.",
} as const;

/**
 * Terms used both by the extraction prompt (so the model knows what to look for) and by
 * `explainSyllabusItem` (so a recognized term always gets a stable, source-independent
 * explanation). Mirrors `financialAidGlossary` in the award-letter pack.
 */
export const syllabusGlossary: Record<string, string> = {
  "grade weight": explanations.gradeWeight,
  midterm: explanations.gradeWeight,
  final: explanations.gradeWeight,
  exam: explanations.gradeWeight,
  quiz: explanations.gradeWeight,
  homework: explanations.gradeWeight,
  participation: explanations.gradeWeight,
  "grading scale": explanations.gradingScale,
  "late penalty": explanations.latePenalty,
  attendance: explanations.attendancePenalty,
  "credit hours": explanations.creditHours,
  "office hours": explanations.scheduleTime,
  "due date": explanations.scheduleDate,
} as const;

function searchable(value: string): string {
  return value
    .toLowerCase()
    .replace(/[‐-―]/g, "-")
    .replace(/[^a-z0-9%:/.-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const assessmentPattern =
  /\b(?:exams?|midterms?|finals?|quiz(?:zes)?|tests?|homeworks?|assignments?|projects?|papers?|essays?|labs?|laboratory|reports?|participation|discussions?|presentations?|portfolios?|problem\s+sets?|reading\s+responses?)\b/;
const penaltyPattern =
  /\b(?:late|penalt(?:y|ies)|deduct(?:ion|ed)?|per\s+day|per\s+diem|drop(?:ped|s)?\s+(?:the\s+)?lowest|no\s+credit)\b/;
const attendancePattern = /\battend(?:ance|ing)?\b|\babsences?\b|\bmissed?\s+class/;
const creditPattern = /\b(?:credit\s+hours?|credit\s+units?|semester\s+hours?|credits?|units?)\b/;
const gradingScalePattern =
  /\b(?:grading\s+scale|letter\s+grade|grade\s+scale)\b|(?:^|[\s(])[a-f][+-]?\s*[=:]|(?:^|[\s(])[a-f][+-]?\s*\d{2,3}\s*(?:-|to|–)\s*\d{2,3}/;
const singleLetterGrade = /^[a-f][+-]?$/;
const logisticsPattern = /\b(?:section|room|building|phone|call|office\s+number|crn|catalog)\b/;
const scheduleDatePattern = /\b(?:due|deadline|dates?|by|on|week\s+of|scheduled)\b/;
/** A bare lecture/section code label ("LEC", "SEC 2", "DIS") — the number beside it identifies
 * a section, not a count of anything, even when the surrounding sentence mentions an exam. */
const sectionCodePattern = /^(?:lec|sec|dis|lab|rec|sect(?:ion)?)\.?$/i;
/** A raw_label that is itself a comparison qualifier ("more than", "below", "at least") names an
 * eligibility threshold, not a graded component — regardless of assessment words elsewhere in
 * the sentence it was pulled from. */
const thresholdQualifierPattern =
  /^(?:more than|less than|below|above|at least|at most|up to|over|under|within)$/;

/** Classifies an important number from its label and source context, never from model semantics. */
export function classifySyllabusItem(
  rawLabel: string,
  sourceQuote: string,
  kind: MeasureKind,
): SyllabusClassification {
  const label = searchable(rawLabel);
  const source = searchable(sourceQuote);
  const context = `${label} ${source}`;

  // A lecture/section code wins before anything else: "LEC 001" in a sentence about a final
  // exam would otherwise match the assessment-count pattern below on "exam" alone, mislabeling
  // a section number as a count of assessments.
  if (sectionCodePattern.test(rawLabel.trim()) && (kind === "count" || kind === "number")) {
    return {
      category: "logistics",
      normalizedName: rawLabel,
      explanation: explanations.logistics,
      recognized: true,
    };
  }

  // A penalty reads as an assessment weight otherwise ("Late work: 10%"), so it wins first.
  if (penaltyPattern.test(context) && (kind === "percent" || kind === "points" || kind === "count")) {
    const attendance = attendancePattern.test(context);
    return {
      category: "policy_penalty",
      normalizedName: rawLabel,
      explanation: attendance ? explanations.attendancePenalty : explanations.latePenalty,
      recognized: true,
    };
  }

  if (attendancePattern.test(context) && (kind === "percent" || kind === "points")) {
    return {
      category: "policy_penalty",
      normalizedName: rawLabel,
      explanation: explanations.attendancePenalty,
      recognized: true,
    };
  }

  if (kind === "hours" || (creditPattern.test(context) && (kind === "count" || kind === "number"))) {
    return {
      category: "credit_hours",
      normalizedName: rawLabel,
      explanation: explanations.creditHours,
      recognized: true,
    };
  }

  const looksLikeGradingScale =
    gradingScalePattern.test(source) || singleLetterGrade.test(label);
  if (looksLikeGradingScale && (kind === "percent" || kind === "number" || kind === "count")) {
    return {
      category: "grading_scale",
      normalizedName: rawLabel,
      explanation: explanations.gradingScale,
      recognized: true,
    };
  }

  if (kind === "percent" || kind === "points") {
    // The model's own label is a comparison qualifier ("more than", "below", "at least"), which
    // marks an eligibility threshold (e.g. extra-credit participation) rather than a graded
    // component's weight — even when the surrounding sentence happens to also mention "final"
    // or another assessment word. Label wins over the wider sentence context here.
    if (thresholdQualifierPattern.test(label)) {
      return {
        category: "grade_weight",
        normalizedName: rawLabel,
        explanation: explanations.gradeWeight,
        recognized: false,
      };
    }
    if (assessmentPattern.test(context)) {
      return {
        category: "grade_weight",
        normalizedName: rawLabel,
        explanation: explanations.gradeWeight,
        recognized: true,
      };
    }
    // A bare percentage without a recognizable component is still most likely a weight, but
    // we cannot vouch for it, so it stays classified yet unrecognized (kept out of warnings).
    return {
      category: "grade_weight",
      normalizedName: rawLabel,
      explanation: explanations.gradeWeight,
      recognized: false,
    };
  }

  if (kind === "count" && assessmentPattern.test(context)) {
    return {
      category: "assessment_count",
      normalizedName: rawLabel,
      explanation: explanations.assessmentCount,
      recognized: true,
    };
  }

  if (kind === "date") {
    return {
      category: "schedule_date",
      normalizedName: rawLabel,
      explanation: explanations.scheduleDate,
      recognized: scheduleDatePattern.test(context) || assessmentPattern.test(context),
    };
  }

  if (kind === "time") {
    return {
      category: "schedule_time",
      normalizedName: rawLabel,
      explanation: explanations.scheduleTime,
      recognized: true,
    };
  }

  if (logisticsPattern.test(context)) {
    return {
      category: "logistics",
      normalizedName: rawLabel,
      explanation: explanations.logistics,
      recognized: true,
    };
  }

  return {
    category: "other",
    normalizedName: rawLabel,
    explanation: explanations.other,
    recognized: false,
  };
}

const KIND_PRIORITY: MeasureKind[] = ["percent", "hours", "points", "time", "date"];

/**
 * Derives the kind of number from the value token's own shape rather than trusting the model.
 * A unit-bearing token ("25%", "3 credits", "10:00 AM") names its own kind; a bare integer is
 * a count and anything else a plain number. This is re-derived after extraction so the kind
 * always agrees with the verbatim value the provenance check anchored.
 */
export function deriveMeasureKind(value: string): MeasureKind {
  const trimmed = value.trim();
  for (const kind of KIND_PRIORITY) {
    if (measureOccurrences(trimmed, kind).some((occurrence) => occurrence.value.trim() === trimmed)) {
      return kind;
    }
  }
  return /^\d+$/.test(trimmed) ? "count" : "number";
}

export function explainSyllabusItem(item: SyllabusItem): string {
  const haystack = ` ${searchable(`${item.raw_label} ${item.source_quote}`)} `;
  const glossaryEntry = Object.entries(syllabusGlossary).find(([term]) =>
    haystack.includes(` ${searchable(term)} `),
  );
  return glossaryEntry?.[1] ?? item.explanation;
}

/** Parses the numeric magnitude out of a percent token like "25%" or "20 percent". */
function percentValue(value: string): number | null {
  const match = normalizeMeasureValue(value).match(/(\d[\d,]*(?:\.\d+)?)\s*(?:%|percent)/);
  return match ? Number(match[1].replace(/,/g, "")) : null;
}

export interface GradeWeightSummary {
  /** The sum of every recognized grade-weight percentage across every detected scheme, or null when none are stated. */
  total: number | null;
  count: number;
  /** How many distinct weighting schemes were detected (see gradeWeightsSummary). */
  schemeCount: number;
  /** True only when at least one weight is stated and every detected scheme totals 100% (±0.5 for rounding). */
  balanced: boolean;
}

/**
 * Sums recognized grade-weight percentages, grouped into weighting schemes rather than one
 * grand total. A syllabus legitimately offers more than one grading method ("the better of
 * two methods below"), each independently weighted to 100% — summing all of them together
 * would report e.g. 200% as broken. Consecutive percents are grouped by resetting whenever a
 * running total crosses ~100%, so multiple valid 100% schemes are recognized as separate
 * schemes instead of one bad total. Items classifySyllabusItem could not confidently tie to a
 * graded component (a bare percentage like an extra-credit eligibility threshold) are excluded
 * entirely, since they are not grade weights even though the model may have labeled them so.
 */
export function gradeWeightsSummary(analysis: SyllabusAnalysis): GradeWeightSummary {
  const percents = analysis.items
    .filter((item) => item.category === "grade_weight" && item.kind === "percent")
    .filter((item) => classifySyllabusItem(item.raw_label, item.source_quote, item.kind).recognized)
    .map((item) => percentValue(item.value))
    .filter((value): value is number => value !== null);

  if (percents.length === 0) return { total: null, count: 0, schemeCount: 0, balanced: false };

  const schemes: number[][] = [];
  let current: number[] = [];
  let runningTotal = 0;
  for (const value of percents) {
    current.push(value);
    runningTotal += value;
    if (runningTotal >= 99.5) {
      schemes.push(current);
      current = [];
      runningTotal = 0;
    }
  }
  if (current.length > 0) schemes.push(current);

  const total = percents.reduce((sum, value) => sum + value, 0);
  const balanced = schemes.every(
    (scheme) => Math.abs(scheme.reduce((sum, value) => sum + value, 0) - 100) <= 0.5,
  );
  return { total, count: percents.length, schemeCount: schemes.length, balanced };
}

export interface SyllabusWarning {
  id: "grade-weights-unbalanced" | "attendance-affects-grade" | "unclassified-number";
  title: string;
  message: string;
}

/** Highlights syllabus patterns a student should double-check, mirroring `warningsFor`. */
export function syllabusWarnings(analysis: SyllabusAnalysis): SyllabusWarning[] {
  const warnings: SyllabusWarning[] = [];

  const weights = gradeWeightsSummary(analysis);
  if (weights.count > 1 && !weights.balanced && weights.total !== null) {
    const message =
      weights.schemeCount > 1
        ? `This syllabus appears to list ${weights.schemeCount} grading schemes, and at least one does not total 100%. Ask the instructor whether a component is missing or weighted differently.`
        : `The stated grade weights total ${weights.total}%, not 100%. Ask the instructor whether a component is missing or weighted differently.`;
    warnings.push({
      id: "grade-weights-unbalanced",
      title: "Grade weights do not add up to 100%",
      message,
    });
  }

  if (analysis.items.some((item) => item.explanation === explanations.attendancePenalty)) {
    warnings.push({
      id: "attendance-affects-grade",
      title: "Attendance affects your grade",
      message:
        "This course ties part of the grade to attendance. Missing class can lower what you earn, so check the exact policy.",
    });
  }

  const unclassified = analysis.items.filter((item) => item.category === "other");
  if (unclassified.length > 0) {
    warnings.push({
      id: "unclassified-number",
      title: "Some numbers are not categorized",
      message: `This syllabus lists ${unclassified.length === 1 ? "a number" : `${unclassified.length} numbers`} Anchor Lines could not categorize (${unclassified
        .map((item) => item.raw_label)
        .join(", ")}). Check the source line to see what ${unclassified.length === 1 ? "it refers" : "they refer"} to.`,
    });
  }

  return warnings;
}
