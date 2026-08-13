import { beforeEach, describe, expect, test, vi } from "vitest";

const { extractDocument } = vi.hoisted(() => ({ extractDocument: vi.fn() }));

// Only extractDocument is stubbed; the real error classes and provider detection are kept
// so route mapping is tested against the types it actually receives in production.
vi.mock("../../../lib/llm", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../lib/llm")>()),
  extractDocument,
}));

import {
  ExtractionQuotaError,
  ExtractionValidationError,
  NotAwardLetterError,
  NotSyllabusError,
  UnreadableLetterError,
} from "../../../lib/llm";
import {
  DEFAULT_MAX_EXTRACTIONS_PER_MINUTE,
  extractionGate,
} from "../../../lib/abuse-controls";
import { POST } from "./route";

const validAnalysis = {
  school_name: "Example University",
  award_year: null,
  cost_of_attendance: { amount: null, source_quote: null },
  line_items: [],
  transcription: "Example University",
  missing_info: [],
};

const letterText = `Example University
Federal Pell Grant $3,200`;
const pdfSignature = [...new TextEncoder().encode("%PDF-")];

/** Defaults to a plain-text letter; pass "application/pdf" for a signature-valid PDF. */
function validFile(
  name = "letter.txt",
  type: "text/plain" | "application/pdf" = "text/plain",
  size?: number,
): File {
  if (type === "text/plain") {
    const body = size === undefined ? letterText : "a".repeat(size);
    return new File([body], name, { type });
  }
  const bytes = new Uint8Array(size ?? pdfSignature.length);
  bytes.set(pdfSignature.slice(0, bytes.length));
  return new File([bytes], name, { type });
}

function upload(
  file?: File,
  {
    origin = "http://localhost",
    ip = "198.51.100.1",
    docType,
  }: { origin?: string | null; ip?: string; docType?: string } = {},
) {
  const form = new FormData();
  if (file) form.set("file", file);
  if (docType) form.set("docType", docType);
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
    extractDocument.mockReset();
    extractionGate.reset();
    delete process.env.GEMINI_API_KEY;
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
    expect(extractDocument).not.toHaveBeenCalled();
  });

  test.each(["__proto__", "constructor", "toString"])(
    "rejects inherited sample id %s with a clean 400",
    async (sampleId) => {
      const response = await POST(
        new Request("http://localhost/api/extract", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sampleId }),
        }),
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: "Invalid sampleId" });
      expect(extractDocument).not.toHaveBeenCalled();
    },
  );

  test("rejects a missing file", async () => {
    const response = await POST(upload());
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Missing file upload" });
  });

  test.each([
    ["letter.png", "image/png"],
    ["letter.jpg", "image/jpeg"],
  ])("rejects %s, whose text would have to be guessed at", async (name, type) => {
    const response = await POST(upload(new File(["bytes"], name, { type })));
    expect(response.status).toBe(415);
    await expect(response.json()).resolves.toEqual({ error: "Unsupported file type" });
  });

  test("accepts a charset-qualified text/plain upload", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    extractDocument.mockResolvedValue(validAnalysis);
    const file = new File([letterText], "letter.txt", { type: "text/plain; charset=utf-8" });

    const response = await POST(upload(file, { ip: "198.51.100.7" }));
    expect(response.status).toBe(200);
  });

  test("accepts exactly 4 MiB and rejects one byte over the shared limit", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    extractDocument.mockResolvedValue(validAnalysis);
    const boundary = validFile("boundary.pdf", "application/pdf", 4 * 1024 * 1024);
    const accepted = await POST(upload(boundary, { ip: "198.51.100.2" }));
    expect(accepted.status).toBe(200);

    const tooLarge = validFile("letter.pdf", "application/pdf", 4 * 1024 * 1024 + 1);
    const response = await POST(upload(tooLarge));
    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({ error: "File exceeds 4 MiB limit" });
  });

  test("rejects cross-origin and missing-origin browser uploads before paid work", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    extractDocument.mockResolvedValue(validAnalysis);
    const file = validFile();

    for (const origin of ["https://evil.example", null]) {
      const response = await POST(upload(file, { origin, ip: `198.51.100.${origin ? 3 : 4}` }));
      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toEqual({ error: "Upload origin is not allowed" });
    }
    expect(extractDocument).not.toHaveBeenCalled();
  });

  test("rate-limits paid extraction per IP without metering samples", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    extractDocument.mockResolvedValue(validAnalysis);
    const file = validFile();

    for (
      let requestNumber = 0;
      requestNumber < DEFAULT_MAX_EXTRACTIONS_PER_MINUTE;
      requestNumber += 1
    ) {
      const response = await POST(upload(file, { ip: "203.0.113.50" }));
      expect(response.status).toBe(200);
    }
    const limited = await POST(upload(file, { ip: "203.0.113.50" }));
    expect(limited.status).toBe(429);
    await expect(limited.json()).resolves.toEqual({
      error: "Too many extraction requests; try again shortly",
    });

    delete process.env.GEMINI_API_KEY;
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
    process.env.GEMINI_API_KEY = "test-key";
    const releases: Array<(value: typeof validAnalysis) => void> = [];
    extractDocument.mockImplementation(
      () => new Promise((resolve) => releases.push(resolve)),
    );
    const file = validFile();

    const first = POST(upload(file, { ip: "203.0.113.61" }));
    const second = POST(upload(file, { ip: "203.0.113.62" }));
    await vi.waitFor(() => expect(extractDocument).toHaveBeenCalledTimes(2));

    const busy = await POST(upload(file, { ip: "203.0.113.63" }));
    expect(busy.status).toBe(503);
    await expect(busy.json()).resolves.toEqual({
      error: "Extraction service is busy; try again shortly",
    });

    releases.splice(0).forEach((release) => release(validAnalysis));
    expect((await first).status).toBe(200);
    expect((await second).status).toBe(200);

    extractDocument.mockResolvedValueOnce(validAnalysis);
    const after = await POST(upload(file, { ip: "203.0.113.64" }));
    expect(after.status).toBe(200);
  });

  test("returns 503 when a valid upload has no API key", async () => {
    const response = await POST(upload(validFile()));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "Extraction service is not configured" });
  });

  test("accepts an upload once a Gemini key is configured", async () => {
    process.env.GEMINI_API_KEY = "test-gemini-key";
    extractDocument.mockResolvedValueOnce(validAnalysis);
    const response = await POST(upload(validFile()));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(validAnalysis);
  });

  test("maps provider quota exhaustion to 429 with a retry-later message", async () => {
    process.env.GEMINI_API_KEY = "test-gemini-key";
    extractDocument.mockRejectedValueOnce(new ExtractionQuotaError("quota gone"));
    const response = await POST(upload(validFile()));

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toEqual({
      error: "Free extraction limit reached for now; try again later",
    });
  });

  test("maps typed validation failures to 422", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    extractDocument.mockRejectedValueOnce(new ExtractionValidationError("invalid model output"));
    const response = await POST(upload(validFile()));

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({ error: "Model output did not match the award-letter schema" });
  });

  test("surfaces a non-letter semantic error", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    extractDocument.mockRejectedValueOnce(new NotAwardLetterError());
    const response = await POST(upload(validFile()));

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({ error: "This doesn't look like an award letter" });
  });

  test("returns the extracted upload analysis", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    extractDocument.mockResolvedValueOnce(validAnalysis);
    const response = await POST(upload(validFile()));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(validAnalysis);
  });

  test("rejects bytes that do not match a declared PDF type", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    const mismatch = new File([new TextEncoder().encode("not-a-real-file")], "letter.pdf", {
      type: "application/pdf",
    });

    const response = await POST(upload(mismatch));

    expect(response.status).toBe(415);
    await expect(response.json()).resolves.toEqual({
      error: "File contents do not match the declared file type",
    });
    expect(extractDocument).not.toHaveBeenCalled();
  });

  test.each([
    ["invalid UTF-8 sequences", [0xc3, 0x28, 0xa0, 0xa1]],
    ["binary control bytes", [0x48, 0x69, 0x00, 0x01, 0x02]],
  ])("rejects a text upload containing %s", async (_label, bytes) => {
    process.env.GEMINI_API_KEY = "test-key";
    const binary = new File([new Uint8Array(bytes)], "letter.txt", { type: "text/plain" });

    const response = await POST(upload(binary));

    expect(response.status).toBe(415);
    await expect(response.json()).resolves.toEqual({
      error: "File contents do not match the declared file type",
    });
    expect(extractDocument).not.toHaveBeenCalled();
  });

  test("tells a student what to do when a PDF turns out to be a scan", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    extractDocument.mockRejectedValueOnce(new UnreadableLetterError("pdf"));

    const response = await POST(upload(validFile("scan.pdf", "application/pdf")));

    expect(response.status).toBe(415);
    const body = (await response.json()) as { error: string };
    expect(body.error).toContain("no readable text layer");
    expect(body.error).toContain(".txt");
  });

  test("serves the checked-in syllabus sample without an API key", async () => {
    const response = await POST(
      new Request("http://localhost/api/extract", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sampleId: "syllabus-1" }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ document_type: "syllabus" });
    expect(extractDocument).not.toHaveBeenCalled();
  });

  test("routes a syllabus upload to the syllabus document type", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    extractDocument.mockResolvedValueOnce({ document_type: "syllabus", items: [] });

    const response = await POST(
      upload(validFile("syllabus.txt"), { ip: "198.51.100.9", docType: "syllabus" }),
    );

    expect(response.status).toBe(200);
    expect(extractDocument).toHaveBeenCalledWith(expect.anything(), "syllabus");
  });

  test("maps a non-syllabus semantic error to 422", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    extractDocument.mockRejectedValueOnce(new NotSyllabusError());

    const response = await POST(
      upload(validFile("syllabus.txt"), { ip: "198.51.100.10", docType: "syllabus" }),
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({ error: "This doesn't look like a syllabus" });
  });

  test("names the syllabus schema in a syllabus validation failure", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    extractDocument.mockRejectedValueOnce(new ExtractionValidationError("bad"));

    const response = await POST(
      upload(validFile("syllabus.txt"), { ip: "198.51.100.11", docType: "syllabus" }),
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      error: "Model output did not match the syllabus schema",
    });
  });
});
