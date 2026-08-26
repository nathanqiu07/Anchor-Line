import { describe, expect, test } from "vitest";

import {
  ExtractionValidationError,
  NotSyllabusError,
  UnreadableLetterError,
  extractDocument,
  extractSyllabus,
  isUsableSyllabusTextLayer,
  type MessagesClient,
} from "./llm";
import type { SyllabusAnalysis } from "./schema";

const transcription = [
  "Introduction to Biology — BIOL 101",
  "Fall 2026 · 3 credit hours",
  "Grading breakdown",
  "Midterm Exam 25%",
  "Final Exam 30%",
  "Homework 20%",
  "Participation 5%",
  "Quizzes 20%",
  "Grading scale",
  "A = 93%",
  "Attendance policy: 2% deducted per absence",
  "Office hours: 10:00 AM",
  "Final exam date: December 14",
].join("\n");

function item(
  raw_label: string,
  value: string,
  source_quote: string,
): SyllabusAnalysis["items"][number] {
  // category/kind are re-derived downstream, so the model's guesses here are intentionally
  // loose — the pipeline should overwrite them from the value and the source context.
  return {
    raw_label,
    category: "other",
    kind: "number",
    value,
    source_quote,
    explanation: "Model-authored explanation.",
  };
}

const analysis: SyllabusAnalysis = {
  document_type: "syllabus",
  course_name: "Introduction to Biology",
  term: "Fall 2026",
  items: [
    item("Midterm Exam", "25%", "Midterm Exam 25%"),
    item("Final Exam", "30%", "Final Exam 30%"),
    item("Homework", "20%", "Homework 20%"),
    item("Participation", "5%", "Participation 5%"),
    item("Quizzes", "20%", "Quizzes 20%"),
    item("A", "93%", "A = 93%"),
    item("credit hours", "3", "Fall 2026 · 3 credit hours"),
    item("Attendance policy", "2%", "Attendance policy: 2% deducted per absence"),
    item("Office hours", "10:00 AM", "Office hours: 10:00 AM"),
    item("Final exam date", "December 14", "Final exam date: December 14"),
  ],
  transcription,
  missing_info: [],
};

function response(text: string, stopReason = "end_turn") {
  return { content: [{ type: "text", text }], stop_reason: stopReason };
}

function fakeClient(...responses: ReturnType<typeof response>[]): MessagesClient {
  let next = 0;
  return { create: async () => responses[next++]! };
}

function uploaded(text: string) {
  return { mimeType: "text/plain" as const, bytes: new TextEncoder().encode(text) };
}

describe("syllabus extraction pipeline", () => {
  test("extracts every important number and re-derives kind and category", async () => {
    const result = await extractSyllabus(
      uploaded(transcription),
      fakeClient(response(JSON.stringify(analysis))),
    );

    expect(result.items).toHaveLength(10);
    const byLabel = new Map(result.items.map((entry) => [entry.raw_label, entry]));
    expect(byLabel.get("Midterm Exam")).toMatchObject({ category: "grade_weight", kind: "percent" });
    expect(byLabel.get("A")).toMatchObject({ category: "grading_scale", kind: "percent" });
    expect(byLabel.get("credit hours")).toMatchObject({ category: "credit_hours", kind: "count" });
    expect(byLabel.get("Attendance policy")).toMatchObject({ category: "policy_penalty" });
    expect(byLabel.get("Office hours")).toMatchObject({ category: "schedule_time", kind: "time" });
    expect(byLabel.get("Final exam date")).toMatchObject({ category: "schedule_date", kind: "date" });
  });

  test("rejects a value that is not present verbatim in its source line", async () => {
    const tampered: SyllabusAnalysis = {
      ...analysis,
      items: [{ ...item("Midterm Exam", "40%", "Midterm Exam 25%") }],
    };

    await expect(
      extractSyllabus(uploaded(transcription), fakeClient(response(JSON.stringify(tampered)))),
    ).rejects.toBeInstanceOf(ExtractionValidationError);
  });

  test("rejects a value bound to the wrong label on a multi-number line", async () => {
    const twoWeights = "Midterm Exam 25% Final Exam 30%";
    const source = [transcription, twoWeights].join("\n");
    const misbound: SyllabusAnalysis = {
      document_type: "syllabus",
      course_name: null,
      term: null,
      // Claims 30% belongs to the Midterm, when 25% is the nearer percent to that label.
      items: [item("Midterm Exam", "30%", twoWeights)],
      transcription: source,
      missing_info: [],
    };

    await expect(
      extractSyllabus(uploaded(source), fakeClient(response(JSON.stringify(misbound)))),
    ).rejects.toBeInstanceOf(ExtractionValidationError);
  });

  test("drops one unverifiable item instead of failing the whole extraction", async () => {
    const twoWeights = "Midterm Exam 25% Final Exam 30%";
    const source = [transcription, twoWeights].join("\n");
    const mixed: SyllabusAnalysis = {
      ...analysis,
      // The Attendance policy item is genuinely anchored; the appended item claims a value
      // the provenance check cannot bind to its label. Losing that one item shouldn't cost
      // the rest of an otherwise-good extraction.
      items: [
        item("Attendance policy", "2%", "Attendance policy: 2% deducted per absence"),
        item("Midterm Exam", "30%", twoWeights),
      ],
      transcription: source,
    };

    const result = await extractSyllabus(
      uploaded(source),
      fakeClient(response(JSON.stringify(mixed))),
    );

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ raw_label: "Attendance policy", value: "2%" });
    expect(result.missing_info.some((note) => note.includes("Midterm Exam"))).toBe(true);
  });

  test("still fails when every item is unverifiable, after retrying once", async () => {
    const twoWeights = "Midterm Exam 25% Final Exam 30%";
    const source = [transcription, twoWeights].join("\n");
    const allBad: SyllabusAnalysis = {
      ...analysis,
      items: [item("Midterm Exam", "30%", twoWeights)],
      transcription: source,
    };

    await expect(
      extractSyllabus(
        uploaded(source),
        fakeClient(
          response(JSON.stringify(allBad)),
          response(JSON.stringify(allBad)),
        ),
      ),
    ).rejects.toBeInstanceOf(ExtractionValidationError);
  });

  test("rejects a document with no syllabus context as not a syllabus", async () => {
    const notSyllabus = "Company Picnic Signup\nBring a dish to share by 12:00 PM";
    const output: SyllabusAnalysis = {
      document_type: "syllabus",
      course_name: null,
      term: null,
      items: [item("Bring a dish", "12:00 PM", "Bring a dish to share by 12:00 PM")],
      transcription: notSyllabus,
      missing_info: [],
    };

    await expect(
      extractSyllabus(uploaded(notSyllabus), fakeClient(response(JSON.stringify(output)))),
    ).rejects.toBeInstanceOf(NotSyllabusError);
  });

  test("extractDocument routes by document type", async () => {
    const result = await extractDocument(
      uploaded(transcription),
      "syllabus",
      fakeClient(response(JSON.stringify(analysis))),
    );
    expect(result.document_type).toBe("syllabus");
  });
});

describe("isUsableSyllabusTextLayer", () => {
  test("accepts a syllabus text layer with recognized grading lines", () => {
    expect(isUsableSyllabusTextLayer(transcription)).toBe(true);
  });

  test("rejects a text layer that is not a syllabus", () => {
    expect(isUsableSyllabusTextLayer("Invoice\nAmount due 40%\nPay by Friday")).toBe(false);
  });

  test("a syllabus PDF with no readable text layer is refused before any call", async () => {
    await expect(
      extractSyllabus(
        { mimeType: "application/pdf", bytes: new Uint8Array([1, 2, 3]) },
        fakeClient(response("{}")),
        async () => null,
      ),
    ).rejects.toBeInstanceOf(UnreadableLetterError);
  });
});
