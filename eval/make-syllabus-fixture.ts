import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { extractSyllabus, type MessagesClient } from "../lib/llm";
import type { SyllabusAnalysis } from "../lib/schema";

/**
 * Generates the checked-in synthetic syllabus fixture by running the real extraction pipeline
 * over a hand-written transcription and a loose candidate output, so the fixture's derived
 * categories, kinds, and explanations always match what the pipeline actually produces.
 * Mirrors the synthetic award-letter fixtures. Run with `tsx eval/make-syllabus-fixture.ts`.
 */

const transcription = [
  "Riverton State University",
  "BIOL 101: Introduction to Biology — Syllabus",
  "Term: Fall 2026 · 3 credit hours",
  "Instructor: Dr. Alex Moreno · Office hours: Tuesdays 10:00 AM",
  "",
  "Grading breakdown",
  "Midterm Exam 25%",
  "Final Exam 30%",
  "Weekly Quizzes 20%",
  "Laboratory Reports 15%",
  "Participation 10%",
  "",
  "Grading scale",
  "A = 93%",
  "B = 83%",
  "C = 73%",
  "",
  "Course policies",
  "Late work: 10% deducted per day",
  "Attendance: 2% of the grade is lost for each unexcused absence",
  "",
  "Key dates",
  "Final exam date: December 14",
].join("\n");

function candidateItem(
  raw_label: string,
  value: string,
  source_quote: string,
): SyllabusAnalysis["items"][number] {
  return {
    raw_label,
    category: "other",
    kind: "number",
    value,
    source_quote,
    explanation: "Model-authored explanation to be re-derived.",
  };
}

const candidate: SyllabusAnalysis = {
  document_type: "syllabus",
  course_name: "Introduction to Biology",
  term: "Fall 2026",
  items: [
    candidateItem("credit hours", "3", "Term: Fall 2026 · 3 credit hours"),
    candidateItem("Office hours", "10:00 AM", "Instructor: Dr. Alex Moreno · Office hours: Tuesdays 10:00 AM"),
    candidateItem("Midterm Exam", "25%", "Midterm Exam 25%"),
    candidateItem("Final Exam", "30%", "Final Exam 30%"),
    candidateItem("Weekly Quizzes", "20%", "Weekly Quizzes 20%"),
    candidateItem("Laboratory Reports", "15%", "Laboratory Reports 15%"),
    candidateItem("Participation", "10%", "Participation 10%"),
    candidateItem("A", "93%", "A = 93%"),
    candidateItem("B", "83%", "B = 83%"),
    candidateItem("C", "73%", "C = 73%"),
    candidateItem("Late work", "10%", "Late work: 10% deducted per day"),
    candidateItem("Attendance", "2%", "Attendance: 2% of the grade is lost for each unexcused absence"),
    candidateItem("Final exam date", "December 14", "Final exam date: December 14"),
  ],
  transcription,
  missing_info: [],
};

const client: MessagesClient = {
  create: async () => ({
    content: [{ type: "text", text: JSON.stringify(candidate) }],
    stop_reason: "end_turn",
  }),
};

async function main(): Promise<void> {
  const result = await extractSyllabus(
    { mimeType: "text/plain", bytes: new TextEncoder().encode(transcription) },
    client,
  );
  const json = `${JSON.stringify(result, null, 2)}\n`;
  await writeFile(join(process.cwd(), "eval", "letters", "biology-101.json"), json);
  await writeFile(join(process.cwd(), "eval", "candidates", "biology-101.json"), json);
  console.log(`Wrote biology-101 syllabus fixture with ${result.items.length} items.`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
