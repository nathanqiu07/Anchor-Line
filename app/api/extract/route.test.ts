import { beforeEach, describe, expect, test, vi } from "vitest";

const { extractLetter } = vi.hoisted(() => ({ extractLetter: vi.fn() }));

vi.mock("../../../lib/llm", () => ({
  extractLetter,
  ExtractionValidationError: class ExtractionValidationError extends Error {
    constructor(message?: string) {
      super(message);
    }
  },
  NotAwardLetterError: class NotAwardLetterError extends Error {
    constructor(message?: string) {
      super(message);
    }
  },
}));

import { ExtractionValidationError, NotAwardLetterError } from "../../../lib/llm";
import { POST } from "./route";

const validAnalysis = {
  school_name: "Example University",
  award_year: null,
  cost_of_attendance: { amount: null, source_quote: null },
  line_items: [],
  transcription: "Example University",
  missing_info: [],
};

function upload(file?: File) {
  const form = new FormData();
  if (file) form.set("file", file);
  return new Request("http://localhost/api/extract", { method: "POST", body: form });
}

describe("POST /api/extract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.ANTHROPIC_API_KEY;
  });

  test("returns a checked-in sample without an API key", async () => {
    const response = await POST(
      new Request("http://localhost/api/extract", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sampleId: "offer-1" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ school_name: "Cedar Ridge University" });
    expect(extractLetter).not.toHaveBeenCalled();
  });

  test("rejects a missing file", async () => {
    const response = await POST(upload());
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Missing file upload" });
  });

  test("rejects unsupported MIME types", async () => {
    const response = await POST(upload(new File(["text"], "letter.txt", { type: "text/plain" })));
    expect(response.status).toBe(415);
    await expect(response.json()).resolves.toEqual({ error: "Unsupported file type" });
  });

  test("rejects files over 10 MiB", async () => {
    const tooLarge = new File([new Uint8Array(10 * 1024 * 1024 + 1)], "letter.png", { type: "image/png" });
    const response = await POST(upload(tooLarge));
    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({ error: "File exceeds 10 MiB limit" });
  });

  test("returns 503 when a valid upload has no API key", async () => {
    const response = await POST(upload(new File(["image"], "letter.png", { type: "image/png" })));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "Extraction service is not configured" });
  });

  test("maps typed validation failures to 422", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    extractLetter.mockRejectedValueOnce(new ExtractionValidationError("invalid model output"));
    const response = await POST(upload(new File(["image"], "letter.png", { type: "image/png" })));

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({ error: "Model output did not match the award-letter schema" });
  });

  test("surfaces a non-letter semantic error", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    extractLetter.mockRejectedValueOnce(new NotAwardLetterError());
    const response = await POST(upload(new File(["image"], "letter.png", { type: "image/png" })));

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({ error: "This doesn't look like an award letter" });
  });

  test("returns the extracted upload analysis", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    extractLetter.mockResolvedValueOnce(validAnalysis);
    const response = await POST(upload(new File(["image"], "letter.png", { type: "image/png" })));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(validAnalysis);
  });
});
