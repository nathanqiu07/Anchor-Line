# Anchor Lines — Devpost writeup draft

## The problem

College award letters turn a consequential decision into a terminology puzzle.
Our documented audit covered **455 colleges**. We found **136 terms** for aid
concepts; **24** examples did not use the word
“loan.” More than **one-third** omitted a clear cost of attendance (COA).
That makes it easy to read a package total as money off the bill even when it
includes debt or future wages, and hard to compare two offers honestly.

Students should not need to become financial-aid experts before they can ask a
basic question: what does this letter actually say, and what cost is still
hidden?

## The solution

Anchor Lines converts an award letter into a simpler, checkable reading. It
groups line items into gift aid, loans, work-study, and other items; explains
the language in plain English; and preserves a source quote for every stated
claim. The anchored interface highlights that quote in the transcription when
the student hovers, focuses, or taps a card. If a claim cannot be found, the
product says **not stated in letter** instead of pretending certainty.

The normalization layer handles terminology such as “Direct Unsub” and older
Stafford labels before comparison. It also makes the true-cost comparison
explicit: net price is COA minus gift aid, work-study is not treated as bill
reduction, and annual or semester loans get a defensible projected four-year
debt rather than being blended with grants. Total and unknown periods stay
unprojected and visibly not comparable. A missing COA stays a red `cost hidden`
result.

## How it works

No model ever reads the letter. A `.txt` upload is already its own transcription, and a
digital PDF carries one in its text layer, which Anchor Lines reads deterministically with
unpdf and then puts through a zero-cost quality gate. The model is asked only to produce a
strict, schema-validated analysis from that exact text, including verbatim source quotes.
A failed validation receives one corrective retry. The transcription is
explicitly delimited as untrusted data. Deterministic pack rules require exact
one-line quotes and complete dollar-occurrence coverage, bind raw labels to
their own quotes, reject category disagreement, replace recognized names and
explanations, and derive only source-stated periods. The client then runs its own
anchored matching: lowercase/collapse whitespace/punctuation normalization and
exact substring matching, with no fuzzy fallback.

That last point is the design's load-bearing decision. An earlier version accepted images,
transcribed them by vision, and absorbed OCR noise with a bounded Levenshtein fallback —
which meant a claim could be "anchored" to a line that did not quite say what the anchor
implied. Restricting input to formats whose text is recoverable exactly removes the noise
instead of compensating for it, so an unmatched quote is now a fabrication to reject rather
than a misreading to rescue. A scanned PDF is refused outright, with a message asking the
student to copy the text out and check the figures, because a plausible vision reading
would sail through provenance checks that only ever compare it against itself.

The tech stack is Next.js App Router, React, TypeScript, Zod, Vitest, the Google
Gemini API, unpdf, and deterministic synthetic fixtures. Client-side
comparison math and financial-aid guardrails remain deterministic instead of
being delegated to the model.

Live uploads are limited to plain-text and digital PDF files up to **4 MB** so multipart
requests remain deployable under the Vercel Functions body limit. Same-origin,
per-IP rate, and in-process concurrency controls run before paid provider calls;
synthetic samples remain key-free and unmetered.

## Measured offline sample evaluation

The offline comparison in `eval/last-run.json` measures checked-in synthetic
extraction snapshots against separate checked-in expected truth. Its intentional
Cedar omission reports **91.2%** field accuracy (**83/91** checked fields) and
**91.7%** anchor verification (**11/12** expected anchors). These candidates are
checked-in fixture artifacts, not independently generated live-provider output,
and the result is not a claim about real-world letter accuracy. Omissions count
as failures, extra claims expand the denominator, and anchor credit requires the
candidate quote to equal the expected quote and anchor in both transcriptions.
The evaluation exits non-zero if either aggregate field accuracy or aggregate
anchor verification falls below 85%, and a run with no expected anchors cannot
pass.

## Privacy and guardrails

These privacy guardrails start with synthetic samples, which stay local and work
without a provider key. For a live upload, `GEMINI_API_KEY` stays server-only;
the file is sent to Google Gemini for processing, while Anchor Lines processes its
bytes in memory and does not persist them in a database or file store. The
resulting analysis and transcription remain in the tab's `sessionStorage` until
the tab closes. The product is not financial advice: it explains what a letter
says, flags missing information, and asks students to confirm decisions with the
school's financial-aid office.

## What remains human-owned

This is a draft submission asset. Real-letter collection, deployment,
hackathon registration, video recording, final Devpost completion, and final
product naming remain human-owned tasks listed in `HUMAN_TODO.md`.
