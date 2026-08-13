// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";

import type { StoredSyllabusAnalysis } from "../lib/client-store";
import type { SyllabusAnalysis } from "../lib/schema";

import { SyllabusWorkspace } from "./syllabus-workspace";

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "scrollTo", {
    configurable: true,
    value: vi.fn(),
  });
});

afterEach(cleanup);

const transcription = [
  "Intro to Biology syllabus",
  "Grading breakdown",
  "Midterm Exam 40%",
  "Final Exam 50%",
  "Attendance: 5% lost per absence",
  "Meets in Room 214",
].join("\n");

const analysis: SyllabusAnalysis = {
  document_type: "syllabus",
  course_name: "Intro to Biology",
  term: "Fall 2026",
  items: [
    { raw_label: "Midterm Exam", category: "grade_weight", kind: "percent", value: "40%", source_quote: "Midterm Exam 40%", explanation: "Weight." },
    { raw_label: "Final Exam", category: "grade_weight", kind: "percent", value: "50%", source_quote: "Final Exam 50%", explanation: "Weight." },
    { raw_label: "Attendance", category: "policy_penalty", kind: "percent", value: "5%", source_quote: "Attendance: 5% lost per absence", explanation: "Attendance affects the grade here: missing class can lower what you earn." },
    { raw_label: "Room", category: "other", kind: "count", value: "214", source_quote: "This sentence is absent from the source", explanation: "Uncategorized." },
  ],
  transcription,
  missing_info: [],
};

const offer: StoredSyllabusAnalysis = {
  id: "biology",
  createdAt: "2026-07-18T12:00:00.000Z",
  source: { kind: "sample", label: "Biology sample" },
  analysis,
};

describe("SyllabusWorkspace", () => {
  test("renders each important number with its value and category", () => {
    render(<SyllabusWorkspace offer={offer} />);

    expect(screen.getByText("Grade weights")).toBeTruthy();
    expect(screen.getByText("40%")).toBeTruthy();
    expect(screen.getByText("50%")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Policies & penalties" })).toBeTruthy();
  });

  test("marks a value whose quote is absent as not stated", () => {
    render(<SyllabusWorkspace offer={offer} />);
    expect(screen.getByText("not stated in syllabus")).toBeTruthy();
  });

  test("surfaces the unbalanced grade-weight and attendance warnings", () => {
    render(<SyllabusWorkspace offer={offer} />);
    // 40% + 50% = 90%, so the weights are unbalanced.
    expect(screen.getByText(/do not add up to 100%/)).toBeTruthy();
    expect(screen.getByText(/Attendance affects your grade/)).toBeTruthy();
  });
});
