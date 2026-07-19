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
reduction, and loans are shown as projected four-year debt rather than blended
with grants. A missing COA stays a red `cost hidden` result.

## How it works

The app uses a two-pass extraction architecture. Pass one transcribes the
image or PDF. Pass two asks the model to produce a strict, schema-validated
analysis from that exact transcription, including verbatim source quotes. A
failed validation receives one corrective retry. The client then runs its own
anchored matching: lowercase/collapse whitespace/punctuation normalization,
exact substring matching, and a bounded fuzzy fallback for OCR noise.

The tech stack is Next.js App Router, React, TypeScript, Zod, Vitest,
Anthropic's vision API, and deterministic synthetic fixtures. Client-side
comparison math and financial-aid guardrails remain deterministic instead of
being delegated to the model.

## Measured sample evaluation

The checked-in synthetic evaluation in `eval/last-run.json` reports **100.0%**
field accuracy (**91/91** checked fields) and **100.0%** anchor verification
(**12/12** verified anchors). These are measured results on three synthetic
fixtures, not a claim about real-world letter accuracy. The evaluation exits
non-zero if aggregate anchor verification falls below 85%.

## Privacy and guardrails

These privacy guardrails start with synthetic samples, which work without a provider key. For a live upload,
`ANTHROPIC_API_KEY` stays server-only; the file is processed in memory and is
not stored in a database or file store. Browser session data is cleared with
the tab. The product is not financial advice: it explains what a letter says,
flags missing information, and asks students to confirm decisions with the
school's financial-aid office.

## What remains human-owned

This is a draft submission asset. Real-letter collection, deployment,
hackathon registration, video recording, final Devpost completion, and final
product naming remain human-owned tasks listed in `HUMAN_TODO.md`.
