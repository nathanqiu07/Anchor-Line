# Real test documents

Unlike the fictional fixtures in `eval/` (see `eval/REFERENCE_SOURCES.md`), the files here are
**genuine, real, publicly-published documents**, kept for exercising the extractor against
real-world formatting rather than curated synthetic input. They are not part of the offline
threshold benchmark (`npm run eval`) and carry no expected-truth labels — use them as raw
input to `npm run eval:live -- <file> --type <award_letter|syllabus>` or by uploading them in
the app.

**Extraction method matters here.** An earlier pass used an LLM (via web-fetch tooling) to
"return the verbatim text" of each source, and it did not stay verbatim — it silently
paraphrased, reorganized, and in the case of the award letters, invented figures that were
never on the source page. Every file listed below was instead captured **mechanically, with
no LLM in the pipeline**: PDFs via this repo's own `unpdf`-based extractor
(`lib/pdf-text.ts`, the same code the app uses on a live PDF upload), and HTML pages via a
direct `fetch()` + `jsdom` parse that strips script/style/nav/header/footer and takes the
remaining `textContent` verbatim, with no summarization step. What you see in each file is
what was actually on the page — sidebar noise, real inconsistencies, and all.

## Award letters (`award-letters/`)

Real financial-aid offer letters are not publicly available — they carry student PII. These
are the U.S. Department of Education's own official **public sample** offer letters
(fictional/redacted student, public domain as a U.S. government work):

| File | Source |
| --- | --- |
| `01-ed-sample-2.txt` | https://www.ed.gov/sites/ed/files/policy/highered/guid/aid-offer/sample-aid-offer-2.pdf |
| `02-ed-sample-3.txt` | https://www.ed.gov/media/document/sample-aid-offer-3pdf-57115.pdf |

## Syllabi (`syllabi/`)

Real, currently- or formerly-published course syllabi/grading pages from university course
sites. These are copyrighted by their respective instructors/institutions; they are kept here
for non-commercial extraction-testing purposes with source attribution, not redistributed as
this project's own work.

## Expected-truth labels (`expected/`)

`expected/award-letters/*.json` and `expected/syllabi/*.json` mirror the file names above and
hold hand-checked "expected truth" `LetterAnalysis`/`SyllabusAnalysis` JSON for each document,
for use with `npm run eval:live -- <file> --type ... --expect expected/.../<file>.json`.

**Provenance and limits:** the first-pass extraction for every one of these labels was
delegated to Haiku (a smaller, cheaper Claude model than the one used elsewhere in this
project) reading the raw `test-documents/` text directly — not the pipeline under test, and
not a human annotator. Every `source_quote`/`value` was then mechanically verified to be an
exact, verbatim substring of the source file (a script checks this, not eye-balling), and the
JSON was schema-validated against `lib/schema.ts`'s `LetterAnalysisSchema`/
`SyllabusAnalysisSchema`. Categorization judgment calls (e.g. which numbers count as
"important", `gift_aid` vs `loan`, which section a policy penalty belongs to) were spot-checked
and corrected by hand where wrong, but were not independently re-derived by a human from
scratch. Treat these as **silver labels for regression-testing and manual comparison, not
gold/authoritative ground truth** — an LLM-derived expected answer that is compared against
another LLM's extraction mainly measures agreement between the two, not real-world
correctness. `eval:live`'s `--expect` scoring covers both document types (`evaluateLetter` /
`evaluateSyllabus` in `eval/evaluation.ts`), so every file under `expected/` can be used with
`npm run eval:live -- <file> --type <award_letter|syllabus> --expect expected/.../<file>.json`.

`expected/award-letters/01-ed-sample-2.json` has an empty `line_items: []` deliberately — that
source document is a blank estimate letter with a blank loan-request form and no actual
awarded dollar amounts, only a Cost of Attendance figure.

| File | Source |
| --- | --- |
| `01-mit-biology.txt` | https://ocw.mit.edu/courses/7-016-introductory-biology-fall-2018/pages/syllabus/ |
| `02-berkeley-stat154.txt` | https://stat154.berkeley.edu/spring-2025/ |
| `03-duke-humanities.txt` | https://sites.duke.edu/dainotto/class-requirements/ |
| `04-uky-cs101.txt` | https://cs.uky.edu/~keen/intro/syllabus/grades.html |
| `05-ucla-cs130.txt` | https://web.cs.ucla.edu/classes/spring16/cs130/grading.html |
| `06-stanford-cs107.txt` | https://web.stanford.edu/class/archive/cs/cs107/cs107.1254/syllabus.html |
| `07-stanford-cs106b.txt` | https://web.stanford.edu/class/archive/cs/cs106b/cs106b.1252/syllabus |
| `08-stanford-cs106a.txt` | https://web.stanford.edu/class/archive/cs/cs106a/cs106a.1258/syllabus |

Notes:
- `02-berkeley-stat154.txt` is the course's real front page; it does not itself contain a
  grade-weight table (no reachable subpage did either). Kept as a genuine "syllabus with no
  stated grading breakdown" edge case rather than discarded.
- `02-berkeley-stat154.txt` and `03-duke-humanities.txt` include an instructor's or GSI's real
  name, office hours, and email address, exactly as the instructor published it on a public
  course page for students to use — this is ordinary public faculty contact information, not
  student PII, but is worth knowing if you redistribute these files further.
- Several files retain the source page's own boilerplate (MIT's course-info sidebar, Stanford
  CS107's "this page is out of date" notice, UCLA's copyright line and RCS `$Id$` tag) —
  left in deliberately, since that is exactly the kind of real-world noise a text-layer
  extractor has to cope with.
