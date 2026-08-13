import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Generates a synthetic syllabus testing set with a small Claude model (Claude Haiku 4.5).
 * These are *input documents* to exercise the syllabus extractor against — the analogue of
 * the "collect real letters" task in HUMAN_TODO.md, but synthetic and reproducible. Output
 * lands in the git-ignored test-syllabi/ directory; feed one to the pipeline with
 * `npm run eval:live -- test-syllabi/<file> --type syllabus` (needs GEMINI_API_KEY), or
 * upload it in the app in Syllabus mode.
 *
 * Uses the Anthropic REST API through fetch rather than the vendor SDK, matching how
 * lib/gemini.ts calls its provider — no new dependency for one request shape.
 * Run with: npm run gen:syllabi   (reads ANTHROPIC_API_KEY from .env.local)
 */

const MODEL = "claude-haiku-4-5";
const ENDPOINT = "https://api.anthropic.com/v1/messages";

interface Brief {
  slug: string;
  course: string;
  twist: string;
}

// Each brief pushes the model toward a different shape or edge case, so the set exercises
// the extractor's breadth: clean weights, unbalanced weights, per-term figures, a missing
// grading scale, points instead of percentages, dense tables, and non-grading numbers.
const briefs: Brief[] = [
  {
    slug: "intro-psychology",
    course: "Introduction to Psychology (PSYC 101), a large lecture course",
    twist: "Grade weights are clean percentages that total exactly 100%. Include a full letter-grade scale, 3 credit hours, weekly office-hours times, and a couple of exam dates.",
  },
  {
    slug: "organic-chemistry",
    course: "Organic Chemistry I (CHEM 210)",
    twist: "Grade weights should total 95%, not 100% (leave a component slightly off on purpose). Include a late-work penalty of 10% per day and an attendance policy that affects the grade.",
  },
  {
    slug: "calculus-ii",
    course: "Calculus II (MATH 152)",
    twist: "State grades in POINTS rather than percentages (e.g. Midterm 200 points, Final 300 points, out of 1000 total). Include credit hours and a grading scale expressed as point ranges.",
  },
  {
    slug: "world-history",
    course: "Modern World History (HIST 240), a seminar",
    twist: "Break some components across two terms (e.g. 'Midterm 15% + 15%'). Include several assignment due dates written as month-and-day, and office hours by appointment with a specific time.",
  },
  {
    slug: "cs-data-structures",
    course: "Data Structures and Algorithms (CS 261)",
    twist: "Present the grade breakdown as a compact table with a percentage per row. Include number of programming assignments (e.g. '6 projects'), 4 credit hours, and a drop-lowest-quiz policy.",
  },
  {
    slug: "art-history-survey",
    course: "Art History Survey (ARTH 100)",
    twist: "Deliberately OMIT any letter-grade scale. Include grade weights that total 100%, a participation/attendance component, room numbers, and the instructor's phone number (a non-grading number that should NOT be treated as a grade).",
  },
  {
    slug: "nursing-fundamentals",
    course: "Fundamentals of Nursing (NURS 110), with a clinical component",
    twist: "Include a minimum passing threshold (e.g. 'must earn at least 75% to pass'), several exam dates, credit hours split as lecture + clinical, and a strict attendance-affects-grade policy.",
  },
  {
    slug: "econ-microeconomics",
    course: "Principles of Microeconomics (ECON 201)",
    twist: "Include quizzes counted as a group (e.g. 'best 8 of 10 quizzes = 20%'), a clean 100% total, a grading scale with plus/minus grades, and 3 credit hours.",
  },
];

const SYSTEM = `You generate realistic but entirely fictional college course syllabi as plain text, for testing a syllabus-parsing tool. Output ONLY the syllabus text — no preamble, no markdown code fences, no commentary. Invent a plausible fictional university, instructor, and term. Write it the way a real syllabus reads: headings, a grading breakdown, a grading scale (unless told to omit it), course policies, credit hours, and a few key dates and times. Use realistic numbers. Do not include any real person's or institution's name.`;

async function generate(apiKey: string, brief: Brief): Promise<string> {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2000,
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: `Write a syllabus for: ${brief.course}.\n\nConstraints for this one: ${brief.twist}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Anthropic request failed (HTTP ${response.status}): ${detail.slice(0, 300)}`);
  }

  const body = (await response.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };
  const text = (body.content ?? [])
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("")
    .trim();
  if (!text) throw new Error("Response contained no text");
  return text;
}

async function main(): Promise<void> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Add it to .env.local (or the environment) and retry.",
    );
  }

  const outputDir = join(process.cwd(), "test-syllabi");
  await mkdir(outputDir, { recursive: true });

  let index = 0;
  for (const brief of briefs) {
    index += 1;
    const number = String(index).padStart(2, "0");
    process.stdout.write(`Generating ${number}-${brief.slug} … `);
    try {
      const syllabus = await generate(apiKey, brief);
      const path = join(outputDir, `${number}-${brief.slug}.txt`);
      await writeFile(path, `${syllabus}\n`);
      console.log(`ok (${syllabus.length} chars)`);
    } catch (error) {
      console.log("FAILED");
      console.error(`  ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  console.log(`\nWrote syllabi to test-syllabi/ (${briefs.length} briefs, model ${MODEL}).`);
  console.log("Run one through the extractor with:");
  console.log("  npm run eval:live -- test-syllabi/01-intro-psychology.txt --type syllabus");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
