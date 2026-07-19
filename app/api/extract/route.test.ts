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

function upload(
  file?: File,
  {
    origin = "http://localhost",
    ip = "198.51.100.1",
  }: { origin?: string | null; ip?: string } = {},
) {
  const form = new FormData();
  if (file) form.set("file", file);
  const headers = new Headers({ "x-forwarded-for": ip });
  if (origin !== null) headers.set("origin", origin);
  return new Request("http://localhost/api/extract", {
    method: "POST",
    headers,
    body: form,
  });
}

describe("POST /api/extract", () => {
  beforeEach(() => {
    extractLetter.mockReset();
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

  test("accepts exactly 4 MiB and rejects one byte over the shared limit", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    extractLetter.mockResolvedValue(validAnalysis);
    const boundary = new File([new Uint8Array(4 * 1024 * 1024)], "boundary.png", {
      type: "image/png",
    });
    const accepted = await POST(upload(boundary, { ip: "198.51.100.2" }));
    expect(accepted.status).toBe(200);

    const tooLarge = new File([new Uint8Array(4 * 1024 * 1024 + 1)], "letter.png", { type: "image/png" });
    const response = await POST(upload(tooLarge));
    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({ error: "File exceeds 4 MiB limit" });
  });

  test("rejects cross-origin and missing-origin browser uploads before paid work", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    extractLetter.mockResolvedValue(validAnalysis);
    const file = new File(["image"], "letter.png", { type: "image/png" });

    for (const origin of ["https://evil.example", null]) {
      const response = await POST(upload(file, { origin, ip: `198.51.100.${origin ? 3 : 4}` }));
      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toEqual({ error: "Upload origin is not allowed" });
    }
    expect(extractLetter).not.toHaveBeenCalled();
  });

  test("rate-limits paid extraction per IP without metering samples", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    extractLetter.mockResolvedValue(validAnalysis);
    const file = new File(["image"], "letter.png", { type: "image/png" });

    for (let requestNumber = 0; requestNumber < 5; requestNumber += 1) {
      const response = await POST(upload(file, { ip: "203.0.113.50" }));
      expect(response.status).toBe(200);
    }
    const limited = await POST(upload(file, { ip: "203.0.113.50" }));
    expect(limited.status).toBe(429);
    await expect(limited.json()).resolves.toEqual({
      error: "Too many extraction requests; try again shortly",
    });

    delete process.env.ANTHROPIC_API_KEY;
    for (let requestNumber = 0; requestNumber < 7; requestNumber += 1) {
      const sample = await POST(
        new Request("http://localhost/api/extract", {
          method: "POST",
          headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.50" },
          body: JSON.stringify({ sampleId: "offer-1" }),
        }),
      );
      expect(sample.status).toBe(200);
    }
  });

  test("caps concurrent paid extractions and releases capacity afterward", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    const releases: Array<(value: typeof validAnalysis) => void> = [];
    extractLetter.mockImplementation(
      () => new Promise((resolve) => releases.push(resolve)),
    );
    const file = new File(["image"], "letter.png", { type: "image/png" });

    const first = POST(upload(file, { ip: "203.0.113.61" }));
    const second = POST(upload(file, { ip: "203.0.113.62" }));
    await vi.waitFor(() => expect(extractLetter).toHaveBeenCalledTimes(2));

    const busy = await POST(upload(file, { ip: "203.0.113.63" }));
    expect(busy.status).toBe(503);
    await expect(busy.json()).resolves.toEqual({
      error: "Extraction service is busy; try again shortly",
    });

    releases.splice(0).forEach((release) => release(validAnalysis));
    expect((await first).status).toBe(200);
    expect((await second).status).toBe(200);

    extractLetter.mockResolvedValueOnce(validAnalysis);
    const after = await POST(upload(file, { ip: "203.0.113.64" }));
    expect(after.status).toBe(200);
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
