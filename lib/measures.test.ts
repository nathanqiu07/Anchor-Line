import { describe, expect, test } from "vitest";

import {
  labelOccurrences,
  measureOccurrences,
  measureValuesEqual,
  normalizeMeasureValue,
  valueBoundToLabel,
} from "./measures";

describe("measureOccurrences", () => {
  test("captures percent tokens with their symbol or word", () => {
    expect(measureOccurrences("Midterm 25% and 20 percent bonus", "percent").map((o) => o.value)).toEqual([
      "25%",
      "20 percent",
    ]);
  });

  test("captures points, credit hours, times, and dates by kind", () => {
    expect(measureOccurrences("Final worth 100 points", "points")[0]?.value).toBe("100 points");
    expect(measureOccurrences("This course is 3 credit hours", "hours")[0]?.value).toBe("3 credit hours");
    expect(measureOccurrences("Office hours 10:00 AM", "time")[0]?.value).toBe("10:00 AM");
    expect(measureOccurrences("Exam on December 14", "date")[0]?.value).toBe("December 14");
  });

  test("count matches bare integers, number matches decimals too", () => {
    expect(measureOccurrences("3 exams and 2 quizzes", "count").map((o) => o.value)).toEqual(["3", "2"]);
    expect(measureOccurrences("weight 12.5 units", "number").map((o) => o.value)).toContain("12.5");
  });
});

describe("normalizeMeasureValue / measureValuesEqual", () => {
  test("folds case and internal whitespace", () => {
    expect(normalizeMeasureValue("10:00  AM")).toBe("10:00 am");
    expect(measureValuesEqual("10:00 AM", "10:00  am")).toBe(true);
    expect(measureValuesEqual("25%", "30%")).toBe(false);
  });
});

describe("labelOccurrences", () => {
  test("only matches whole-token labels, never inside a longer word", () => {
    expect(labelOccurrences("A grade and a B grade", "A")).toEqual([0]);
    expect(labelOccurrences("Immigration status", "grant")).toEqual([]);
  });
});

describe("valueBoundToLabel", () => {
  const line = "Midterm Exam 25% Final Exam 30%";

  test("binds a value to its nearest label occurrence", () => {
    // Midterm's own weight (25%) is nearer to its label than the Final's 30%.
    expect(
      valueBoundToLabel(line, "Midterm Exam", measureOccurrences(line, "percent"), "25%", measureValuesEqual),
    ).toBe(true);
    const finalLine = "Final Exam 30%";
    expect(
      valueBoundToLabel(finalLine, "Final Exam", measureOccurrences(finalLine, "percent"), "30%", measureValuesEqual),
    ).toBe(true);
  });

  test("rejects a value that is not the nearest occurrence to the label", () => {
    expect(
      valueBoundToLabel(line, "Midterm Exam", measureOccurrences(line, "percent"), "30%", measureValuesEqual),
    ).toBe(false);
  });

  test("treats a label equidistant between two occurrences as ambiguous", () => {
    // "Final Exam" sits one space from 25% before it and one from 30% after it.
    expect(
      valueBoundToLabel(line, "Final Exam", measureOccurrences(line, "percent"), "30%", measureValuesEqual),
    ).toBe(false);
  });

  test("rejects when there is no label or no occurrence", () => {
    expect(valueBoundToLabel(line, "Absent Label", measureOccurrences(line, "percent"), "25%", measureValuesEqual)).toBe(
      false,
    );
    expect(valueBoundToLabel("no numbers here", "Label", [], "25%", measureValuesEqual)).toBe(false);
  });
});
