# Anchor Lines Complete Application Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish every M1–M8 requirement in the approved Anchor Lines brief as a demo-ready, verifiable financial-aid letter decoder.

**Architecture:** Keep deterministic domain behavior in focused `lib/` and `packs/` modules, expose the two-pass Anthropic workflow through one App Router endpoint, and store selected sample/upload analyses in browser session state. Checked-in synthetic fixtures serve both the zero-upload demo and the deterministic evaluation harness.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4, Zod 4, Vitest, Anthropic SDK, pdfjs-dist, Playwright/Chromium for fixture rendering.

## Global Constraints

- Tagline: “Plain language you can check.”
- Categories are exactly `gift_aid | loan | work_study | other`.
- Unmatched claims visibly mean and say “not stated in letter”.
- Net price is `COA − Σ annualized gift_aid`; projected four-year debt is `Σ annualized loans × 4`. Year amounts stay as stated, semester amounts are ×2, and total/unknown periods are not comparable.
- Anthropic model comes from `EXTRACTION_MODEL`, defaulting to `claude-sonnet-4-6`; the server-only key is `ANTHROPIC_API_KEY`.
- Accept PNG, JPG, and PDF up to 4 MiB (the deployable alternative under Vercel's 4.5 MB function-body limit); no database, auth, accounts, or tracked real letters.
- Fuzzy quote matching uses sliding windows ±20% quote length and requires similarity ≥0.85.
- `npm run typecheck`, `npm run lint`, `npm run test`, `npm run eval`, and `npm run build` must pass.

---

### Task 1: Synthetic fixtures, financial-aid pack, anchors, and deterministic evaluation

**Files:**
- Create: `eval/make-fixtures.ts`, `eval/evaluation.ts`, `eval/run-eval.ts`, `eval/letters/*.html`, `eval/letters/*.json`, `public/samples/*.png`
- Create: `packs/financial-aid.ts`, `lib/anchor.ts`
- Test: `eval/fixtures.test.ts`, `eval/evaluation.test.ts`, `packs/financial-aid.test.ts`, `lib/anchor.test.ts`
- Modify: `package.json`, `PROGRESS.md`

**Interfaces:**
- `anchorQuote(transcription: string, quote: string, threshold?: number): AnchorMatch | null`
- `calculateOffer(analysis: LetterAnalysis): OfferTotals`
- `warningsFor(analysis: LetterAnalysis): AidWarning[]`
- `evaluateLetter(actual: LetterAnalysis, expected: LetterAnalysis): EvaluationResult`

- [ ] Write tests that require exact matching, OCR-noise fuzzy matching, reordered-text rejection, absent-quote rejection, honest cost math, required warnings, valid synthetic fixture JSON, and ≥85% aggregate anchor verification.
- [ ] Run the targeted tests and confirm they fail because the modules and fixtures do not exist.
- [ ] Implement index-mapped normalization, Levenshtein search, pack glossary/warnings/math, three deliberately varied synthetic letters, fixture rendering, and deterministic evaluation output.
- [ ] Run targeted tests, render the PNGs, visually inspect all three, and run `npm run eval`.
- [ ] Commit the complete domain and fixture deliverable.

### Task 2: Two-pass Anthropic extraction and upload API

**Files:**
- Create: `lib/prompts.ts`, `lib/llm.ts`, `app/api/extract/route.ts`
- Test: `lib/llm.test.ts`, `app/api/extract/route.test.ts`
- Modify: `package.json`, `.gitignore`, `PROGRESS.md`

**Interfaces:**
- `extractLetter(input: LetterInput, client?: AnthropicClient): Promise<LetterAnalysis>`
- `POST(request: Request): Promise<Response>` accepts multipart field `file` or JSON `{ sampleId }`.

- [ ] Write tests for exact prompt invariants, validation retry success, second validation failure, supported/unsupported MIME types, 4 MiB enforcement, missing key messaging, and sample extraction without an API key.
- [ ] Run the targeted tests and confirm the expected missing-feature failures.
- [ ] Implement the transcription call, extraction call at temperature 0, JSON parsing and Zod validation, one corrective retry, PDF document handling, upload validation, and synthetic-sample shortcut.
- [ ] Run the targeted tests and verify a fixture request returns valid `LetterAnalysis` while malformed requests return specific 4xx responses.
- [ ] Commit the extraction/API deliverable.

### Task 3: Landing, anchored letter workspace, and comparison experience

**Files:**
- Create: `components/app-shell.tsx`, `components/upload-panel.tsx`, `components/letter-workspace.tsx`, `components/claim-card.tsx`, `components/compare-table.tsx`, `lib/client-store.ts`, `app/letter/[id]/page.tsx`, `app/compare/page.tsx`
- Modify: `app/page.tsx`, `app/layout.tsx`, `app/globals.css`
- Test: `lib/client-store.test.ts`, `components/letter-workspace.test.tsx`, `components/compare-table.test.tsx`

**Interfaces:**
- `saveAnalysis`, `loadAnalysis`, and `listAnalyses` use `sessionStorage` key `anchor-lines:analyses`.
- The letter workspace derives anchor spans with `anchorQuote`; the compare table derives totals with `calculateOffer`.

- [ ] Write tests for session-state round trips, claim honesty labels, cost-hidden comparison output, and required warning copy.
- [ ] Run the targeted tests and confirm they fail because UI/store modules are missing.
- [ ] Implement the responsive dark editorial shell, upload/sample loading states, source/image toggle, interactive anchor highlights, grouped claim cards, true-cost comparison, and disclaimers.
- [ ] Run component tests and manually exercise sample → analysis → compare at desktop and mobile widths.
- [ ] Commit the complete application experience.

### Task 4: Deployment readiness, writeup, demo script, and final state

**Files:**
- Create: `submission/WRITEUP.md`, `submission/DEMO_SCRIPT.md`, `vercel.json`
- Modify: `README.md`, `HUMAN_TODO.md`, `PROGRESS.md`

**Interfaces:**
- Submission assets cite the measured rates in `eval/last-run.json` and end the demo on the honesty badge plus measured anchor rate.

- [ ] Write a verification test that checks required documentation phrases, environment variables, measured eval values, and every PROGRESS milestone checkbox.
- [ ] Run it and confirm failure while assets are absent and milestones remain unchecked.
- [ ] Add environment/setup/deploy instructions, privacy and financial-advice language, Devpost writeup, three-minute demo script, and complete progress notes without attempting human-owned tasks.
- [ ] Run the documentation test, then run typecheck, lint, all tests, eval, production build, and a browser smoke test.
- [ ] Review the full diff for scope, secrets, PII, and acceptance-criteria coverage, then commit the final deliverable.
