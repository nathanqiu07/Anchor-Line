import { describe, expect, test } from "vitest";

import type { SyllabusAnalysis, SyllabusItem } from "../lib/schema";
import {
  classifySyllabusItem,
  deriveMeasureKind,
  explainSyllabusItem,
  gradeWeightsSummary,
  syllabusWarnings,
} from "./syllabus";

describe("deriveMeasureKind", () => {
  test.each([
    ["25%", "percent"],
    ["20 percent", "percent"],
    ["100 points", "points"],
    ["3 credit hours", "hours"],
    ["10:00 AM", "time"],
    ["December 14", "date"],
    ["3", "count"],
    ["12.5", "number"],
  ])("derives %s as %s", (value, expected) => {
    expect(deriveMeasureKind(value)).toBe(expected);
  });
});

describe("classifySyllabusItem", () => {
  test("a weighted assessment is a grade weight", () => {
    expect(classifySyllabusItem("Midterm Exam", "Midterm Exam 25%", "percent")).toMatchObject({
      category: "grade_weight",
      recognized: true,
    });
  });

  test("a letter-grade threshold is a grading scale", () => {
    expect(classifySyllabusItem("A", "A = 93%", "percent")).toMatchObject({
      category: "grading_scale",
      recognized: true,
    });
  });

  test("a late deduction is a policy penalty, not a weight", () => {
    expect(classifySyllabusItem("Late work", "Late work: 10% deducted per day", "percent")).toMatchObject({
      category: "policy_penalty",
      recognized: true,
    });
  });

  test("attendance tied to the grade is flagged as an attendance penalty", () => {
    const classification = classifySyllabusItem(
      "Attendance",
      "Attendance: 2% is lost for each absence",
      "percent",
    );
    expect(classification.category).toBe("policy_penalty");
    expect(classification.explanation).toContain("Attendance affects the grade");
  });

  test("credit hours, times, and dates route to their categories", () => {
    expect(classifySyllabusItem("credit hours", "This course is 3 credit hours", "hours").category).toBe("credit_hours");
    expect(classifySyllabusItem("Office hours", "Office hours 10:00 AM", "time").category).toBe("schedule_time");
    expect(classifySyllabusItem("Final exam date", "Final exam date: December 14", "date").category).toBe("schedule_date");
  });

  test("an assessment count is recognized as such", () => {
    expect(classifySyllabusItem("exams", "There are 3 exams", "count")).toMatchObject({
      category: "assessment_count",
      recognized: true,
    });
  });

  test("a room number is recognized as logistics", () => {
    expect(classifySyllabusItem("Room", "Meets in Room 214", "count")).toMatchObject({
      category: "logistics",
      recognized: true,
    });
  });

  test("a number with no course context falls through to other", () => {
    expect(classifySyllabusItem("Note", "See note 7 for details", "count")).toMatchObject({
      category: "other",
      recognized: false,
    });
  });
});

function analysisWith(items: SyllabusItem[]): SyllabusAnalysis {
  return {
    document_type: "syllabus",
    course_name: null,
    term: null,
    items,
    transcription: items.map((item) => item.source_quote).join("\n"),
    missing_info: [],
  };
}

function weight(raw_label: string, value: string): SyllabusItem {
  return {
    raw_label,
    category: "grade_weight",
    kind: "percent",
    value,
    source_quote: `${raw_label} ${value}`,
    explanation: "x",
  };
}

describe("gradeWeightsSummary", () => {
  test("sums grade-weight percents and flags a balanced set", () => {
    const summary = gradeWeightsSummary(analysisWith([weight("Midterm", "40%"), weight("Final", "60%")]));
    expect(summary).toEqual({ total: 100, count: 2, balanced: true });
  });

  test("reports an unbalanced set", () => {
    const summary = gradeWeightsSummary(analysisWith([weight("Midterm", "40%"), weight("Final", "50%")]));
    expect(summary.total).toBe(90);
    expect(summary.balanced).toBe(false);
  });
});

describe("syllabusWarnings", () => {
  test("warns when grade weights do not total 100%", () => {
    const warnings = syllabusWarnings(analysisWith([weight("Midterm", "40%"), weight("Final", "50%")]));
    expect(warnings.some((warning) => warning.id === "grade-weights-unbalanced")).toBe(true);
  });

  test("warns when attendance affects the grade", () => {
    const item: SyllabusItem = {
      raw_label: "Attendance",
      category: "policy_penalty",
      kind: "percent",
      value: "2%",
      source_quote: "Attendance: 2% is lost per absence",
      explanation: "x",
    };
    const analysis = analysisWith([item]);
    // The pipeline sets the attendance explanation; mirror that here so the warning fires.
    analysis.items[0].explanation = classifySyllabusItem(item.raw_label, item.source_quote, "percent").explanation;
    expect(syllabusWarnings(analysis).some((warning) => warning.id === "attendance-affects-grade")).toBe(true);
  });

  test("warns about uncategorized numbers", () => {
    const other: SyllabusItem = {
      raw_label: "Room",
      category: "other",
      kind: "count",
      value: "214",
      source_quote: "Meets in Room 214",
      explanation: "x",
    };
    expect(syllabusWarnings(analysisWith([other])).some((warning) => warning.id === "unclassified-number")).toBe(true);
  });
});

describe("explainSyllabusItem", () => {
  test("prefers a glossary explanation for a recognized term", () => {
    const item: SyllabusItem = {
      raw_label: "Midterm",
      category: "grade_weight",
      kind: "percent",
      value: "25%",
      source_quote: "Midterm 25%",
      explanation: "fallback",
    };
    expect(explainSyllabusItem(item)).not.toBe("fallback");
  });
});
