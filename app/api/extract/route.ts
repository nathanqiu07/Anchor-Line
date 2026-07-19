import { ExtractionValidationError, NotAwardLetterError, extractLetter } from "../../../lib/llm";

import offer1 from "../../../eval/letters/cedar-ridge.json";
import offer2 from "../../../eval/letters/juniper-tech.json";
import offer3 from "../../../eval/letters/morrow-bay.json";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const acceptedTypes = new Set(["image/png", "image/jpeg", "application/pdf"]);
const samples = { "offer-1": offer1, "offer-2": offer2, "offer-3": offer3 };

function error(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

export async function POST(request: Request): Promise<Response> {
  if (request.headers.get("content-type")?.includes("application/json")) {
    const body: unknown = await request.json().catch(() => null);
    const sampleId =
      body && typeof body === "object" && "sampleId" in body
        ? (body as { sampleId?: unknown }).sampleId
        : undefined;
    if (typeof sampleId !== "string" || !(sampleId in samples)) {
      return error("Invalid sampleId", 400);
    }
    return Response.json(samples[sampleId as keyof typeof samples]);
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return error("Missing file upload", 400);
  if (!acceptedTypes.has(file.type)) return error("Unsupported file type", 415);
  if (file.size > MAX_FILE_BYTES) return error("File exceeds 10 MiB limit", 413);
  if (!process.env.ANTHROPIC_API_KEY) {
    return error("Extraction service is not configured", 503);
  }

  try {
    const analysis = await extractLetter({
      mimeType: file.type as "image/png" | "image/jpeg" | "application/pdf",
      bytes: new Uint8Array(await file.arrayBuffer()),
    });
    return Response.json(analysis);
  } catch (caught) {
    if (caught instanceof ExtractionValidationError) {
      return error("Model output did not match the award-letter schema", 422);
    }
    if (caught instanceof NotAwardLetterError) {
      return error("This doesn't look like an award letter", 422);
    }
    throw caught;
  }
}
