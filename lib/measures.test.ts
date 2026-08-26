import { describe, expect, test } from "vitest";

import {
  labelOccurrences,
  measureOccurrences,
  measureValuesEqual,
  normalizeMeasureValue,
  resolveAnchorScope,
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

  test("an anchor_span lets the model correct a case where nearest-distance is wrong", () => {
    // Syntax, not proximity, ties "30%" to "Final Exam" here: the modifier comes before its
    // subject. A pure distance check picks "25%" (physically closer) and would reject the true
    // claim; scoping to a model-chosen anchor_span that contains only "30%" fixes that.
    const line = "30% will come from the Final Exam, and 25% from the Midterm.";
    const wholeLine = measureOccurrences(line, "percent");
    expect(valueBoundToLabel(line, "Final Exam", wholeLine, "30%", measureValuesEqual)).toBe(
      false,
    );

    const anchorSpan = "30% will come from the Final Exam";
    const scope = resolveAnchorScope(line, "Final Exam", anchorSpan);
    expect(scope).toBe(anchorSpan);
    expect(
      valueBoundToLabel(
        scope!,
        "Final Exam",
        measureOccurrences(scope!, "percent"),
        "30%",
        measureValuesEqual,
      ),
    ).toBe(true);
  });

  test("binds each value to its own occurrence of a label repeated for two different figures", () => {
    // "Best" qualifies two separate counts here, once per assessment. Pooling distances across
    // both "Best"s would make 11 and 7 look tied for nearest-to-"Best"; each is actually the
    // unambiguous nearest count to its own occurrence.
    const bestOfLine =
      "7% Homework (Best 11 out of 13), 13% Quizzes (Best 7 out of 10)";
    const counts = measureOccurrences(bestOfLine, "count");
    expect(valueBoundToLabel(bestOfLine, "Best", counts, "11", measureValuesEqual)).toBe(true);
    expect(valueBoundToLabel(bestOfLine, "Best", counts, "7", measureValuesEqual)).toBe(true);
    expect(valueBoundToLabel(bestOfLine, "Best", counts, "13", measureValuesEqual)).toBe(false);
    expect(valueBoundToLabel(bestOfLine, "Best", counts, "10", measureValuesEqual)).toBe(false);
  });
});

describe("resolveAnchorScope", () => {
  const line = "Midterm Exam 25% Final Exam 30%";

  test("falls back to the whole source_quote when anchor_span is omitted", () => {
    expect(resolveAnchorScope(line, "Midterm Exam", undefined)).toBe(line);
  });

  test("accepts a real substring that contains its label", () => {
    expect(resolveAnchorScope(line, "Midterm Exam", "Midterm Exam 25%")).toBe(
      "Midterm Exam 25%",
    );
  });

  test("rejects a span that is not actually present in source_quote", () => {
    expect(resolveAnchorScope(line, "Midterm Exam", "Midterm Exam 40%")).toBeNull();
  });

  test("rejects a span that does not contain its own label", () => {
    expect(resolveAnchorScope(line, "Midterm Exam", "Final Exam 30%")).toBeNull();
  });

  test("rejects an empty span", () => {
    expect(resolveAnchorScope(line, "Midterm Exam", "")).toBeNull();
  });
});
