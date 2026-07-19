# Anchor Lines Progress

### M0 — Scaffold
- [x] `create-next-app` (TS, Tailwind, App Router), scripts for `typecheck`,
      `lint`, `test` (vitest), `eval`. README with 3-line setup.
- [x] `lib/schema.ts` exactly as §6, with zod validators + 3 unit tests.
- **Done when:** fresh clone → `npm i && npm run dev` renders landing page;
  all checks green.

### M1 — Synthetic fixtures
- [ ] Generate 3 synthetic award letters as HTML → render to PNG (script in
      `eval/make-fixtures.ts`). Vary terminology deliberately: one says
      "Direct Unsub", one "Unsubsidized Stafford Loan DL", one omits COA.
      Fake names/schools only.
- [ ] Hand-write expected JSON for each into `eval/letters/`.
- **Done when:** 3 image+JSON pairs exist; images look like plausible letters.

### M2 — Transcription + extraction API
- [ ] `lib/llm.ts`: image(s) in → (pass 1) full transcription → (pass 2)
      extraction with `source_quote`s, validated against zod schema; one
      retry on validation failure, then 422.
- [ ] `app/api/extract/route.ts` wiring; 10MB upload cap; PNG/JPG/PDF pages.
- **Done when:** `curl` with fixture #1 returns valid `LetterAnalysis`.

### M3 — Anchor matcher
- [ ] `lib/anchor.ts`: normalize (lowercase, collapse whitespace, strip
      punctuation) → exact substring → sliding-window Levenshtein fallback
      (threshold ≥0.85 similarity). Returns char offsets into transcription
      or `null`.
- [ ] Unit tests: exact, OCR-noise ("$5,5OO"), reordered, absent.
- **Done when:** tests pass; fixture claims anchor at ≥90%.

### M4 — Eval harness
- [ ] `eval/run-eval.ts`: for each fixture — extraction field accuracy vs
      expected JSON + anchor verification rate. Prints table, writes
      `eval/last-run.json`. Exit non-zero if anchor rate <85%.
- **Done when:** `npm run eval` prints a real table on all fixtures.

### M5 — Anchored letter view (the demo centerpiece)
- [ ] Split-pane: left = transcription (original image toggle), right =
      plain-language cards grouped gift aid / loans / work-study / costs.
- [ ] Hover/tap a card → source span highlights + scrolls into view. Unmatched
      → amber "not stated in letter" badge.
- [ ] Every dollar figure card shows the pack's plain-English explanation
      (e.g., loan card: "You repay this, with interest. Est. 4-yr total: $X.")
- **Done when:** upload fixture → interact end-to-end; mobile-usable.

### M6 — Compare view + warnings
- [ ] Table across 2+ letters: COA, gift aid, loans, net price (COA − gift
      aid), projected 4-yr debt. Missing COA → red "cost hidden" cell.
- [ ] Pack warnings: work-study ≠ bill reduction; loans grouped with grants;
      Parent PLUS flagged as parent debt.
- **Done when:** fixtures #1+#3 produce an honest comparison including the
  hidden-cost flag.

### M7 — Polish + deploy readiness
- [ ] Landing: one-line pitch, "try sample letters" button, privacy note
      (letters processed in memory, not stored).
- [ ] Loading/error states; graceful handling of a non-letter image
      ("This doesn't look like an award letter").
- [ ] `vercel.json` if needed; document env vars in README.
- **Done when:** demo flows sample→analysis→compare with zero uploads.

### M8 — Devpost kit assets (drafts; humans finalize)
- [ ] `submission/WRITEUP.md`: problem (with the stats in §1), solution,
      how anchoring works, eval numbers from `eval/last-run.json`, tech list.
- [ ] `submission/DEMO_SCRIPT.md`: 3-minute beat-by-beat video script ending
      on the "not stated in letter" badge + eval number.
- **Done when:** both drafts exist and cite the real measured anchor rate.

## Deviations

- 2026-07-18: Replaced create-next-app's Google-hosted Geist loader with system fonts so builds do not require network access.

## Session notes

2026-07-18 - Completed M0 scaffold with Next.js, TypeScript, Tailwind, Vitest scripts, and a 3-line setup README.
Checks passed: typecheck, lint, test, eval, production build; dev landing page returned HTTP 200.
npm install reported 2 moderate transitive vulnerabilities; no breaking audit fix was applied.
2026-07-18 - Added the exact `LetterAnalysis` and `LineItem` contract with strict Zod validators and three unit tests.
Checks passed: typecheck, lint, test.
