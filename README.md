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
| `npm run typecheck` | Check TypeScript without writing output. |
| `npm run lint` | Run ESLint. |
| `npm run test` | Run the Vitest suite, including release-documentation acceptance. |
| `npm run eval` | Compare checked-in synthetic extraction snapshots with separate expected truth and refresh `eval/last-run.json`. |
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
which sends it to Anthropic for processing. The server validates MIME type,
leading file-signature bytes, and size before any paid model call. Anchor Lines
processes the file bytes in memory and does not persist them in a database or
file store. The resulting analysis and transcription remain in that tab's
`sessionStorage` until the tab closes; uploaded-file previews are transient and
are unavailable after a reload. Synthetic samples stay local to the app and are
key-free.

## Environment variables

`ANTHROPIC_API_KEY` is required only for live user uploads. Put it in
`.env.local` or in your deployment provider's encrypted environment settings;
it is server-only and must never be exposed with a `NEXT_PUBLIC_` prefix or
committed to the repository.

`EXTRACTION_MODEL` is optional. If it is unset, the server uses
`claude-sonnet-4-6`. The synthetic-sample flow does not use either variable.

```dotenv
# .env.local — do not commit this file
ANTHROPIC_API_KEY=your_key_here
# Optional; defaults to claude-sonnet-4-6
EXTRACTION_MODEL=claude-sonnet-4-6
```

## Architecture

- Next.js App Router provides the responsive interface and `/api/extract`
  server route.
- The server uses a two-pass Anthropic workflow: first transcribe the image or
  PDF, then extract a schema-validated award-letter analysis from that exact
  transcription. Pass-one text is delimited as untrusted data. Deterministic
  pack logic verifies each exact source line, monetary occurrence, raw label,
  aid category, normalized name, explanation, and explicit period before a
  result can be returned. A failed validation gets one corrective retry.
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
build settings, and set `ANTHROPIC_API_KEY` as a server-only production
environment variable. Optionally set `EXTRACTION_MODEL`; otherwise the default
is `claude-sonnet-4-6`.

The 4 MiB file maximum is an intentional deployability limit: it leaves room
for multipart overhead beneath Vercel Functions' 4.5 MB request-body limit.
The upload route also requires a matching browser `Origin`, permits five paid
extractions per IP per minute, and caps paid extraction at two concurrent calls
per process. On Vercel, the rate-limit key uses one validated
`x-vercel-forwarded-for` IP from Vercel's trusted request boundary; only when
that header is absent does local/test execution use validated `x-real-ip` or
`x-forwarded-for` fallback data. These controls are best-effort, per-process
serverless safeguards: in-memory state is not distributed across instances and
resets when an instance is recycled. Samples bypass these controls and never
call Anthropic.

Before sharing a deployment, run `npm run typecheck`, `npm run lint`,
`npm run test`, `npm run eval`, and `npm run build`. A live provider check
has not been performed without an API key; sample mode is the verified zero-key
path.

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
letters, screenshots, API keys, or other personal information. Anchor Lines
explains what an award letter states and surfaces what it does not state; it
does not determine affordability, predict aid, recommend borrowing, or provide
financial advice. This product is not financial advice.
