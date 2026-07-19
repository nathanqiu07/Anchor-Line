import { describe, expect, test } from "vitest";

import {
  ExtractionValidationError,
  extractLetter,
  type AnthropicMessagesClient,
} from "./llm";
import { EXTRACTION_PROMPT, TRANSCRIPTION_PROMPT } from "./prompts";

const transcription = "Cedar Ridge University\nDirect Unsub $5,500";
const analysis = {
  school_name: "Cedar Ridge University",
  award_year: "2026-2027",
  cost_of_attendance: {
    amount: 42_000,
    source_quote: "Estimated Cost of Attendance: $42,000",
  },
  line_items: [
    {
      raw_label: "Direct Unsub",
      category: "loan",
      normalized_name: "Federal Direct Unsubsidized Loan",
      amount: 5_500,
      period: "year",
      source_quote: "Direct Unsub $5,500",
      explanation: "A loan you repay.",
    },
  ],
  transcription,
  missing_info: [],
};

function response(text: string) {
  return { content: [{ type: "text", text }] };
}

function fakeClient(...responses: ReturnType<typeof response>[]): AnthropicMessagesClient {
  let next = 0;
  return {
    create: async () => responses[next++]!,
  };
}

describe("two-pass extraction prompts", () => {
  test("keeps transcription and extraction prompt invariants", () => {
    expect(TRANSCRIPTION_PROMPT).toBe(
      "Transcribe this financial aid award letter exactly, preserving line breaks and all dollar figures. Output plain text only.",
    );
    expect(EXTRACTION_PROMPT).toContain("only JSON matching the schema");
    expect(EXTRACTION_PROMPT).toContain("source_quote");
    expect(EXTRACTION_PROMPT).toContain("verbatim");
    expect(EXTRACTION_PROMPT).toContain("null");
    expect(EXTRACTION_PROMPT).toContain("no estimates");
    expect(EXTRACTION_PROMPT).toContain("classify each dollar line");
    expect(EXTRACTION_PROMPT).toContain("glossary");
  });

  test("transcribes before extracting at temperature zero", async () => {
    const calls: unknown[] = [];
    const client: AnthropicMessagesClient = {
      create: async (request) => {
        calls.push(request);
        return calls.length === 1
          ? response(transcription)
          : response(JSON.stringify(analysis));
      },
    };

    await expect(
      extractLetter({ mimeType: "image/png", bytes: new Uint8Array([1]) }, client),
    ).resolves.toEqual(analysis);

    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatchObject({ system: TRANSCRIPTION_PROMPT });
    expect(calls[1]).toMatchObject({ temperature: 0 });
    expect(calls[1]).toMatchObject({
      system: expect.stringContaining(EXTRACTION_PROMPT),
      messages: [{ content: expect.stringContaining(transcription) }],
    });
  });

  test("returns a schema-validated extraction", async () => {
    await expect(
      extractLetter(
        { mimeType: "application/pdf", bytes: new Uint8Array([1, 2]) },
        fakeClient(response(transcription), response(JSON.stringify(analysis))),
      ),
    ).resolves.toEqual(analysis);
  });

  test("retries extraction once with validation feedback", async () => {
    const calls: unknown[] = [];
    const client: AnthropicMessagesClient = {
      create: async (request) => {
        calls.push(request);
        return calls.length === 1
          ? response(transcription)
          : calls.length === 2
            ? response('{"bad": true}')
            : response(JSON.stringify(analysis));
      },
    };

    await expect(
      extractLetter({ mimeType: "image/jpeg", bytes: new Uint8Array([1]) }, client),
    ).resolves.toEqual(analysis);
    expect(calls).toHaveLength(3);
    expect(calls[2]).toMatchObject({ system: expect.stringContaining("Validation failed") });
  });

  test("throws a typed error after the second invalid extraction", async () => {
    await expect(
      extractLetter(
        { mimeType: "image/png", bytes: new Uint8Array([1]) },
        fakeClient(response(transcription), response("not json"), response("still not json")),
      ),
    ).rejects.toBeInstanceOf(ExtractionValidationError);
  });
});
