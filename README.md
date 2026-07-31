# Anchor Lines

Plain language you can check. Anchor Lines turns a college financial-aid award
letter into plain-language claims, then anchors every claim back to the letter
transcription so a student can inspect the evidence.

It is a demonstration tool for understanding an award letter, not financial
advice. Confirm awards, eligibility, renewal terms, and final costs with the
school's financial-aid office.

## Setup

1. Install Node.js 20 or later.
2. Run `npm install`.
3. Copy `.env.example` to `.env.local` if you want to analyze your own letter.
4. Run `npm run dev` and open [http://localhost:3000](http://localhost:3000).

The synthetic samples work without an API key. Select **Try sample letters**,
choose an offer, inspect its anchored analysis, return home for a second sample,
then open **Compare offers**. This is the verified zero-key demo path.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the local development server. |
| `npm run test` | Run the Vitest suite, including release-documentation acceptance. |
| `npm run eval` | Compare checked-in synthetic extraction snapshots with separate expected truth and refresh `eval/last-run.json`. |
| `npm run eval:live -- <letter>` | Send one PNG, JPG, or PDF to the configured provider and print the extraction. Spends real quota; reads `.env.local`. |
| `npm run build` | Create a production build. |
| `npm start` | Serve a completed production build. |

## Inputs and sample mode

Anchor Lines accepts a single PNG, JPG, or PDF award letter up to 4 MB (4 MiB
at the byte boundary). The three checked-in sample letters are synthetic-only
and intentionally vary their
financial-aid terminology; they never call the model provider. They make it
possible to demonstrate sample → analysis → comparison without uploading a
real letter or configuring a secret.

For a live letter, the browser sends the selected file to the server route,
which sends it to the configured model provider for processing. The server validates MIME type,
leading file-signature bytes, and size before any paid model call. Anchor Lines
processes the file bytes in memory and does not persist them in a database or
file store. The resulting analysis and transcription remain in that tab's
`sessionStorage` until the tab closes; uploaded-file previews are transient and
are unavailable after a reload. Synthetic samples stay local to the app and are
key-free.

## Environment variables

A provider key is required only for live user uploads. Put it in `.env.local` or in
your deployment provider's encrypted environment settings; keys are server-only and
must never be exposed with a `NEXT_PUBLIC_` prefix or committed to the repository.
`.env.example` is the one env file the repository tracks, so it holds placeholders only.
The synthetic-sample flow does not use any of these variables.

| Variable | Effect |
| --- | --- |
| `GEMINI_API_KEY` | Google Gemini key. Free tier, no card required. Without it, live upload returns 503 and sample mode still works. |
| `EXTRACTION_MODEL` | Optional. Overrides the model. Defaults to `gemini-3.6-flash`. |
| `EXTRACTION_MAX_PER_MINUTE` | Optional. Paid extractions allowed per IP per minute. Defaults to 2. |
| `EXTRACTION_MAX_CONCURRENT` | Optional. Concurrent paid extractions per process. Defaults to 2. |

```dotenv
# .env.local — do not commit this file
GEMINI_API_KEY=your_key_here
# Optional; overrides the default
# EXTRACTION_MODEL=gemini-3.6-flash
```

A letter costs one provider call when its PDF text layer is usable and two when it needs
the vision pass, plus one more if the corrective retry fires.

Free-tier Gemini limits are enforced per project, per model, per day, and they change
without notice. A live run in July 2026 measured
`GenerateRequestsPerDayPerProjectPerModel-FreeTier` at **20 requests per day** for
`gemini-3.6-flash` — roughly 20 text-layer letters or 10 vision letters daily, not the
hundreds an older reading of the docs suggested. Each model id has its own separate daily
bucket, so exhausting one leaves the others untouched. Confirm your own ceilings at
[AI Studio](https://aistudio.google.com/rate-limit) and set the two admission-control
variables to match.

Model ids also retire for new keys without notice: `gemini-2.5-flash` already returns 404
for keys created after its retirement. If Gemini rejects the configured model with a 403
or 404, the error names the model and tells you to set `EXTRACTION_MODEL`.

## Architecture

- Next.js App Router provides the responsive interface and `/api/extract`
  server route.
- The server extracts a schema-validated award-letter analysis from an exact
  transcription. That transcription is delimited as untrusted data. Deterministic
  pack logic verifies each exact source line, monetary occurrence, raw label,
  aid category, normalized name, explanation, and explicit period before a
  result can be returned. A failed validation gets one corrective retry.
- The transcription comes from one of two tiers. A digital PDF already carries an exact
  text layer, so `lib/pdf-text.ts` reads it with `unpdf` and the vision pass is skipped
  entirely — one model call instead of two. Images, scanned PDFs, and text layers that
  fail the gate in `isUsableTextLayer` fall through to the vision pass.
- The gate is pure text and costs nothing: it rejects a layer whose dollar-bearing lines
  carry more than one amount (collapsed columns), that never reads as an award letter, or
  that yields fewer than two lines `classifyAidItem` recognizes (truncated labels). Each
  check mirrors an invariant the pipeline enforces later, so an unusable layer is caught
  before it spends a call rather than after.
- `lib/provider.ts` defines the provider-agnostic message contract. `lib/gemini.ts`
  adapts it to Gemini's REST `generateContent` endpoint through `fetch`, with no vendor
  SDK. A quota refusal surfaces as a distinct error so the corrective retry is not spent
  on an exhausted quota.
- `lib/anchor.ts` normalizes text, finds exact quotes where possible, and falls
  back to a bounded fuzzy match. Each card highlights its source span; an
  unmatched claim is labeled **not stated in letter**.
- `packs/financial-aid.ts` separates gift aid, loans, work-study, and other
  items. It derives the COA period without changing the extraction schema and
  annualizes stated yearly amounts as-is and semester amounts ×2 for both cost
  and aid. Total and unknown periods remain unprojected. Net price and four-year
  debt stay not comparable when their periods are unclear; work-study stays out
  of bill reduction.
- Browser session state uses `sessionStorage`; there is no account, database,
  authentication system, or persistent document storage.

## Vercel deployment

This repository does not need a `vercel.json`: Vercel recognizes Next.js App
Router routes, including `/api/extract`, without a rewrite or custom runtime
override. To deploy, import the repository into Vercel, use the default Next.js
build settings, and set `GEMINI_API_KEY` as a server-only production environment
variable. Optionally set `EXTRACTION_MODEL`; otherwise `gemini-3.6-flash` applies.

Extraction latency is the sharpest deployment constraint. Reasoning models spend real time
before emitting anything: a live text-layer extraction of a dense letter measured **85.7
seconds** for its single call, while a short letter through the vision tier took 11.5. The
route sets `maxDuration = 60` because that is the ceiling every Vercel plan allows, so a
dense letter can still exceed it — raise the export toward 300 on a plan that permits it,
or expect occasional timeouts. Sample mode is unaffected; it never calls the provider.

The 4 MiB file maximum is an intentional deployability limit: it leaves room
for multipart overhead beneath Vercel Functions' 4.5 MB request-body limit.
The upload route also requires a matching browser `Origin`, permits two paid
extractions per IP per minute, and caps paid extraction at two concurrent calls
per process. Both limits are tunable with `EXTRACTION_MAX_PER_MINUTE` and
`EXTRACTION_MAX_CONCURRENT`. On Vercel, the rate-limit key uses one validated
`x-vercel-forwarded-for` IP from Vercel's trusted request boundary; only when
that header is absent does local/test execution use validated `x-real-ip` or
`x-forwarded-for` fallback data. These controls are best-effort, per-process
serverless safeguards: in-memory state is not distributed across instances and
resets when an instance is recycled. Samples bypass these controls and never
call the model provider.

Before sharing a deployment, run `npm run test`, `npm run eval`, and
`npm run build`. Sample mode remains the verified zero-key path.

Both live tiers were exercised against the Gemini API in July 2026: a digital PDF through
the text-layer tier in one call, and a PNG through the vision tier in two. To repeat it
with your own key, run

```
npm run eval:live -- <letter.pdf>
npm run eval:live -- public/samples/cedar-ridge.png --expect eval/letters/cedar-ridge.json
```

The `--expect` score is only directly meaningful for the text-layer tier. A vision run
writes its own transcription, and anchor credit demands quotes byte-identical to the
checked-in fixture, so its anchor figure reads low even when every amount is correct.

## Offline evaluation

`npm run eval` compares checked-in synthetic extraction snapshots in
`eval/candidates/` against separate checked-in expected truth in `eval/letters/`.
The current intentional Cedar omission produces **91.2% field accuracy
(83/91)** and **91.7% anchor verification (11/12)**. Expected anchor claims are
the denominator, so omitted candidate claims fail; the command exits non-zero
below either 85% aggregate field accuracy or 85% aggregate anchor verification,
and an evaluation with no expected anchors cannot pass. Anchor credit requires
the candidate quote to equal the immutable expected quote and anchor in both
expected and candidate transcriptions; extra candidate claims expand the
denominator. This is an offline fixture comparison, not a live-provider
benchmark, and the checked-in candidates are not represented as independently
generated observations.

## Privacy and guardrails

Only synthetic letters are tracked in this repository. Do not commit real
letters, screenshots, API keys, or other personal information.

Live upload sends the file to Google Gemini. On Gemini's free tier, Google may use
submitted content to improve their models, so treat live upload as a development and
demonstration path for synthetic letters rather than a place to put a real student's
award letter. A paid Gemini tier avoids those training terms. Anchor Lines
explains what an award letter states and surfaces what it does not state; it
does not determine affordability, predict aid, recommend borrowing, or provide
financial advice. This product is not financial advice.
