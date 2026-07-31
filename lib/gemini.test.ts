import { describe, expect, test } from "vitest";

import { createGeminiClient } from "./gemini";
import { ExtractionQuotaError, type MessageRequest } from "./provider";

interface CapturedRequest {
  url: string;
  headers: Record<string, string>;
  body: {
    systemInstruction: { parts: Array<{ text: string }> };
    contents: Array<{ role: string; parts: Array<Record<string, unknown>> }>;
    generationConfig: Record<string, unknown>;
  };
}

function stubFetch(response: Response): {
  fetchImplementation: typeof fetch;
  captured: CapturedRequest[];
} {
  const captured: CapturedRequest[] = [];
  const fetchImplementation = (async (url: string | URL, init?: RequestInit) => {
    captured.push({
      url: String(url),
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: JSON.parse(String(init?.body)),
    });
    return response;
  }) as unknown as typeof fetch;
  return { fetchImplementation, captured };
}

function geminiResponse(
  parts: Array<Record<string, unknown>>,
  finishReason = "STOP",
): Response {
  return new Response(
    JSON.stringify({ candidates: [{ content: { parts }, finishReason }] }),
    { status: 200 },
  );
}

const imageRequest: MessageRequest = {
  model: "gemini-2.5-flash",
  max_tokens: 8_000,
  system: "Transcribe the letter.",
  messages: [
    {
      role: "user",
      content: [
        {
          type: "image",
          source: { type: "base64", media_type: "image/png", data: "aGk=" },
        },
      ],
    },
  ],
};

describe("createGeminiClient", () => {
  test("sends the system prompt as systemInstruction and the attachment as inlineData", async () => {
    const { fetchImplementation, captured } = stubFetch(
      geminiResponse([{ text: "Cedar Ridge University" }]),
    );

    await createGeminiClient("test-key", fetchImplementation).create(imageRequest);

    expect(captured).toHaveLength(1);
    expect(captured[0].url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
    );
    expect(captured[0].headers["x-goog-api-key"]).toBe("test-key");
    expect(captured[0].body.systemInstruction.parts[0].text).toBe("Transcribe the letter.");
    expect(captured[0].body.contents[0].parts[0]).toEqual({
      inlineData: { mimeType: "image/png", data: "aGk=" },
    });
    expect(captured[0].body.generationConfig.maxOutputTokens).toBe(8_000);
  });

  test("sends a PDF attachment inline with its own media type", async () => {
    const { fetchImplementation, captured } = stubFetch(geminiResponse([{ text: "ok" }]));

    await createGeminiClient("test-key", fetchImplementation).create({
      ...imageRequest,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: "JVBER",
              },
            },
          ],
        },
      ],
    });

    expect(captured[0].body.contents[0].parts[0]).toEqual({
      inlineData: { mimeType: "application/pdf", data: "JVBER" },
    });
  });

  test("sends string content as a single text part", async () => {
    const { fetchImplementation, captured } = stubFetch(geminiResponse([{ text: "{}" }]));

    await createGeminiClient("test-key", fetchImplementation).create({
      ...imageRequest,
      messages: [{ role: "user", content: "Extract JSON only." }],
    });

    expect(captured[0].body.contents[0].parts).toEqual([{ text: "Extract JSON only." }]);
  });

  test("omits temperature unless the caller set one", async () => {
    const withoutTemperature = stubFetch(geminiResponse([{ text: "ok" }]));
    await createGeminiClient("k", withoutTemperature.fetchImplementation).create(imageRequest);
    expect(withoutTemperature.captured[0].body.generationConfig).not.toHaveProperty(
      "temperature",
    );

    const withTemperature = stubFetch(geminiResponse([{ text: "ok" }]));
    await createGeminiClient("k", withTemperature.fetchImplementation).create({
      ...imageRequest,
      temperature: 0,
    });
    expect(withTemperature.captured[0].body.generationConfig.temperature).toBe(0);
  });

  test("maps a STOP finish reason to end_turn and joins every text part", async () => {
    const { fetchImplementation } = stubFetch(
      geminiResponse([{ text: "first " }, { inlineData: {} }, { text: "second" }]),
    );

    const result = await createGeminiClient("k", fetchImplementation).create(imageRequest);

    expect(result.stop_reason).toBe("end_turn");
    expect(result.content).toEqual([
      { type: "text", text: "first " },
      { type: "text", text: "second" },
    ]);
  });

  test("passes a non-STOP finish reason through so the caller can name the cause", async () => {
    const { fetchImplementation } = stubFetch(
      geminiResponse([{ text: "truncated" }], "MAX_TOKENS"),
    );

    const result = await createGeminiClient("k", fetchImplementation).create(imageRequest);

    expect(result.stop_reason).toBe("MAX_TOKENS");
  });

  test("reports a missing finish reason as null rather than end_turn", async () => {
    // Built inline because omitting the key differs from passing undefined to the helper.
    const { fetchImplementation } = stubFetch(
      new Response(
        JSON.stringify({ candidates: [{ content: { parts: [{ text: "x" }] } }] }),
        { status: 200 },
      ),
    );

    const result = await createGeminiClient("k", fetchImplementation).create(imageRequest);

    expect(result.stop_reason).toBeNull();
  });

  test("throws ExtractionQuotaError when the provider returns 429", async () => {
    const { fetchImplementation } = stubFetch(
      new Response(JSON.stringify({ error: { status: "RESOURCE_EXHAUSTED" } }), {
        status: 429,
      }),
    );

    await expect(
      createGeminiClient("k", fetchImplementation).create(imageRequest),
    ).rejects.toBeInstanceOf(ExtractionQuotaError);
  });

  test("names the model and EXTRACTION_MODEL when the model is rejected", async () => {
    const { fetchImplementation } = stubFetch(
      new Response("model not found", { status: 404 }),
    );

    await expect(
      createGeminiClient("k", fetchImplementation).create(imageRequest),
    ).rejects.toThrow(/gemini-2\.5-flash[\s\S]*EXTRACTION_MODEL/);
  });

  test("surfaces the status code for other provider failures", async () => {
    const { fetchImplementation } = stubFetch(new Response("boom", { status: 500 }));

    await expect(
      createGeminiClient("k", fetchImplementation).create(imageRequest),
    ).rejects.toThrow(/HTTP 500/);
  });

  test("rejects a content block it cannot translate instead of dropping it", async () => {
    const { fetchImplementation } = stubFetch(geminiResponse([{ text: "ok" }]));

    await expect(
      createGeminiClient("k", fetchImplementation).create({
        ...imageRequest,
        messages: [{ role: "user", content: [{ type: "tool_use", id: "1" }] }],
      }),
    ).rejects.toThrow(/cannot translate content block/);
  });
});
