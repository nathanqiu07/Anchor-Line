# Anchor Lines Complete Application Design

## Product

Anchor Lines is a responsive Next.js application that turns college financial-aid award letters into plain-language claims users can verify against the source. Its primary promise is “Plain language you can check.” Every extracted claim carries a verbatim source quote; a claim that cannot be matched is visibly labeled “not stated in letter.”

The approved scope is the attached `CLAUDE.md` brief. Its stack, model provider, data contract, anchoring threshold, privacy model, warnings, comparison math, and UI honesty rules are locked. The user explicitly asked for every remaining milestone to be completed in one continuous run, overriding only the brief’s stop-after-one-task loop behavior.

## Architecture

- Next.js App Router and TypeScript provide the application shell, server API, and deployable Vercel target.
- `lib/llm.ts` performs a two-pass Anthropic vision workflow: exact transcription, then schema-constrained extraction with one validation retry.
- `lib/anchor.ts` normalizes text with an index map, attempts an exact match, then searches sliding windows using Levenshtein similarity at a minimum score of 0.85.
- `packs/financial-aid.ts` owns normalization, warnings, and deterministic client-side comparison math.
- Browser session state is stored in `sessionStorage`; no database, auth, or persistence service is introduced.
- Three synthetic award letters and checked-in expected JSON make the product and evaluation harness usable without real documents or an API key.

## Experience

The visual direction is a restrained dark editorial workspace: near-black background, warm ivory type, amber anchors, fine borders, and compact financial-data typography. The landing page explains the value in one screen and offers upload plus sample-letter entry points. The letter page uses a responsive split view with source transcription/image on the left and categorized explanation cards on the right. Hover, focus, or tap links a card to its source highlight. The comparison page presents honest cost math and warning callouts, including a red “cost hidden” state when COA is missing.

## Data and error flow

Uploads accept PNG, JPEG, and PDF up to 10 MB. Samples bypass the external API by loading checked-in analyses, while user uploads call `/api/extract`. The API rejects unsupported or oversized input, fails clearly when `ANTHROPIC_API_KEY` is absent, converts PDFs to Anthropic-compatible document content, validates extracted JSON, retries once with validation feedback, and returns 422 when the model still violates the schema. The UI preserves no uploaded bytes after the request and surfaces a specific non-letter message when extraction produces no recognizable financial-aid content.

## Testing and acceptance

Unit tests cover schemas, pack math and warnings, exact/fuzzy/absent anchoring, fixture validity, API validation, and evaluation calculations. The eval command operates deterministically on the checked-in expected data, prints per-letter field accuracy and anchor verification, writes `eval/last-run.json`, and exits non-zero below 85% anchor verification. Completion requires typecheck, lint, tests, eval, production build, and a browser smoke test of sample-to-analysis-to-compare.

## Guardrails

Only synthetic letters are tracked. Secrets remain server-side. The product explains documents and does not provide financial advice. No authentication, database, payment system, internationalization, or additional document packs are included.
