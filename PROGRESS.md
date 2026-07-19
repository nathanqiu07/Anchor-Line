# Anchor Lines Progress

### M0 — Scaffold
- [x] `create-next-app` (TS, Tailwind, App Router), scripts for `typecheck`,
      `lint`, `test` (vitest), `eval`. README with 3-line setup.
- [x] `lib/schema.ts` exactly as §6, with zod validators + 3 unit tests.
- **Done when:** fresh clone → `npm i && npm run dev` renders landing page;
  all checks green.

### M1 — Synthetic fixtures
- [x] Generate 3 synthetic award letters as HTML → render to PNG (script in
      `eval/make-fixtures.ts`). Vary terminology deliberately: one says
      "Direct Unsub", one "Unsubsidized Stafford Loan DL", one omits COA.
      Fake names/schools only.
- [x] Hand-write expected JSON for each into `eval/letters/`.
- **Done when:** 3 image+JSON pairs exist; images look like plausible letters.

### M2 — Transcription + extraction API
- [x] `lib/llm.ts`: image(s) in → (pass 1) full transcription → (pass 2)
      extraction with `source_quote`s, validated against zod schema; one
      retry on validation failure, then 422.
- [x] `app/api/extract/route.ts` wiring; deployable 4 MiB upload cap;
      PNG/JPG/PDF input; same-origin, per-IP, and in-process concurrency guards.
- **Done when:** `curl` with fixture #1 returns valid `LetterAnalysis`.

### M3 — Anchor matcher
- [x] `lib/anchor.ts`: normalize (lowercase, collapse whitespace, strip
      punctuation) → exact substring → sliding-window Levenshtein fallback
      (threshold ≥0.85 similarity). Returns char offsets into transcription
      or `null`.
- [x] Unit tests: exact, OCR-noise ("$5,5OO"), reordered, absent.
- **Done when:** tests pass; fixture claims anchor at ≥90%.

### M4 — Eval harness
- [x] `eval/run-eval.ts`: independently reads checked-in candidate extraction
      snapshots and expected JSON, then reports field accuracy and expected-anchor
      verification. Prints a table, writes `eval/last-run.json`, and exits
      non-zero if aggregate anchor verification is <85%.
- **Done when:** `npm run eval` prints a real table on all fixtures.

### M5 — Anchored letter view (the demo centerpiece)
- [x] Split-pane: left = transcription (original image toggle), right =
      plain-language cards grouped gift aid / loans / work-study / costs.
- [x] Hover/tap a card → source span highlights + scrolls into view. Unmatched
      → amber "not stated in letter" badge.
- [x] Every dollar figure card shows the pack's plain-English explanation and
      stated period; four-year loan projections appear only for defensibly
      annualized year/semester amounts.
- **Done when:** upload fixture → interact end-to-end; mobile-usable.

### M6 — Compare view + warnings
- [x] Table across 2+ letters: COA, gift aid, loans, net price (COA − gift
      aid), projected 4-yr debt. Missing COA → red "cost hidden" cell; total or
      unknown gift/loan periods → a visible not-comparable state.
- [x] Pack warnings: work-study ≠ bill reduction; loans grouped with grants;
      Parent PLUS flagged as parent debt.
- **Done when:** fixtures #1+#3 produce an honest comparison including the
  hidden-cost flag.

### M7 — Polish + deploy readiness
- [x] Landing: one-line pitch, "try sample letters" button, privacy note
      (letters processed in memory, not stored).
- [x] Loading/error states; graceful handling of a non-letter image
      ("This doesn't look like an award letter").
- [x] `vercel.json` if needed; document env vars in README. No `vercel.json`
      was added because the default Vercel Next.js App Router handling supports
      the server route without a custom rewrite or runtime override.
- **Done when:** demo flows sample→analysis→compare with zero uploads.

### M8 — Devpost kit assets (drafts; humans finalize)
- [x] `submission/WRITEUP.md`: problem (with the stats in §1), solution,
      how anchoring works, eval numbers from `eval/last-run.json`, tech list.
- [x] `submission/DEMO_SCRIPT.md`: 3-minute beat-by-beat video script ending
      on the "not stated in letter" badge + eval number.
- **Done when:** both drafts exist and cite the real measured anchor rate.

## Deviations

- 2026-07-18: Replaced create-next-app's Google-hosted Geist loader with system fonts so builds do not require network access.
- 2026-07-19: documented deviation: no `vercel.json` was added because the
  default Vercel configuration is compatible with this Next.js App Router
  application and its server route.
- 2026-07-19: documented deviation: no live Anthropic network test was run
  without a secret. Sample mode is the zero-key verified path; live extraction
  requires `ANTHROPIC_API_KEY`.
- 2026-07-19: documented deviation: the planned 10 MiB upload conflicts with
  Vercel Functions' 4.5 MB request-body limit. The implemented maximum is 4 MiB
  for PNG, JPG, and PDF so multipart overhead remains below the platform limit;
  Blob persistence was intentionally not introduced.
- 2026-07-19: documented deviation: abuse controls are best-effort and
  serverless-compatible. Same-origin checks are deterministic, while the
  five-per-IP/minute limit and two-call concurrency cap are in-memory per
  process, not distributed/global, and reset with instance lifecycle.

## Session notes

2026-07-18 - Completed M0 scaffold with Next.js, TypeScript, Tailwind, Vitest scripts, and a 3-line setup README.
Checks passed: typecheck, lint, test, eval, production build; dev landing page returned HTTP 200.
npm install reported 2 moderate transitive vulnerabilities; no breaking audit fix was applied.
2026-07-18 - Added the exact `LetterAnalysis` and `LineItem` contract with strict Zod validators and three unit tests.
Checks passed: typecheck, lint, test.
2026-07-18 - Completed M1, M3, and M4 with three rendered synthetic-only award letters, deterministic expected analyses, index-mapped source anchors, and the evaluation harness.
Checks passed: make-fixtures, targeted tests, typecheck, lint, and test. The
original self-comparison eval result from this session was invalid and is
superseded by the separate candidate-vs-expected evaluation below.
2026-07-18 - Completed M2 with two-pass Anthropic transcription/extraction, one schema-feedback retry, upload validation, and API-key-free synthetic sample responses.
Checks passed: targeted extraction/API tests, typecheck, lint, and test.
2026-07-18 - Completed M5, M6, and the user-facing landing/loading portions of M7 with a typed session analysis store, responsive anchored letter workspace, honest multi-offer comparison, and accessible upload/sample states.
Checks passed: targeted RED/GREEN tests (10/10), typecheck, lint, full tests (48/48), production build, and HTTP smoke for landing/sample API/letter/compare routes.
2026-07-19 - Completed M7 deployment documentation and M8 draft submission assets. README now documents setup, commands, supported input, synthetic sample mode, architecture, environment variables, Vercel deployment, privacy, and not-financial-advice limits.
Acceptance evidence: release-documentation test, typecheck, lint, full tests, eval, and production build were run in this session. Sample mode is the zero-key verified path; live Anthropic extraction requires `ANTHROPIC_API_KEY` and was not network-tested without it. Human-owned deployment, registration, real-letter collection, video recording, and final submission remain in `HUMAN_TODO.md`.
2026-07-19 - Final review fix wave hardened semantic source binding, deterministic
classification/explanations, monetary multiset coverage, conservative periods,
Anthropic completion handling, non-letter detection, the deployable upload
contract, serverless abuse controls, period-aware comparison math, and honest
independent fixture evaluation. The checked-in synthetic candidate comparison
measures 83/91 fields (91.2%) and 11/12 expected anchors (91.7%); the intentional
Cedar omission counts as a failure and the aggregate anchor gate passes.
Controller interactive browser smoke: Cedar sample loaded; activating Direct
Unsub marked the exact source text; Original rendered the letter image; Juniper
loaded; Compare showed the red cost hidden state; and the 390×844 mobile check
had no document overflow. Live Anthropic and Vercel deployment remain untested
without credentials/deployment authority; video and submission remain human-owned.
