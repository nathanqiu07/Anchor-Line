import {
  ExtractionQuotaError,
  ExtractionValidationError,
  NotAwardLetterError,
  NotSyllabusError,
  UnreadableLetterError,
  extractDocument,
  isExtractionConfigured,
} from "../../../lib/llm";
import type { DocumentType } from "../../../lib/schema";
import { clientIpKey, extractionGate } from "../../../lib/abuse-controls";
import {
  hasValidUploadSignature,
  normalizedUploadType,
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_MIB,
} from "../../../lib/upload-contract";

import offer1 from "../../../eval/letters/cedar-ridge.json";
import offer2 from "../../../eval/letters/juniper-tech.json";
import offer3 from "../../../eval/letters/morrow-bay.json";
import syllabus1 from "../../../eval/letters/biology-101.json";

const samples = {
  "offer-1": offer1,
  "offer-2": offer2,
  "offer-3": offer3,
  "syllabus-1": syllabus1,
};

/** The two document domains the pipeline supports; anything else falls back to an award letter. */
function documentTypeFrom(value: unknown): DocumentType {
  return value === "syllabus" ? "syllabus" : "award_letter";
}

/**
 * Reasoning models are slow: one live text-layer extraction of a dense letter measured
 * 85.7s. 60 is the ceiling every Vercel plan allows, so it is the safe default here; raise
 * it toward 300 on a plan that permits it rather than leaving dense letters to time out.
 */
export const maxDuration = 60;

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
    if (
      typeof sampleId !== "string" ||
      !Object.prototype.hasOwnProperty.call(samples, sampleId)
    ) {
      return error("Invalid sampleId", 400);
    }
    return Response.json(samples[sampleId as keyof typeof samples]);
  }

  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) {
    return error("Upload origin is not allowed", 403);
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return error("Missing file upload", 400);
  const mimeType = normalizedUploadType(file.type);
  if (!mimeType) return error("Unsupported file type", 415);
  if (file.size > MAX_UPLOAD_BYTES) {
    return error(`File exceeds ${MAX_UPLOAD_MIB} MiB limit`, 413);
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!hasValidUploadSignature(mimeType, bytes)) {
    return error("File contents do not match the declared file type", 415);
  }
  const documentType = documentTypeFrom(form?.get("docType"));
  if (!isExtractionConfigured()) {
    return error("Extraction service is not configured", 503);
  }

  const admission = extractionGate.enter(clientIpKey(request.headers));
  if (!admission.allowed) {
    return admission.reason === "rate_limit"
      ? error("Too many extraction requests; try again shortly", 429)
      : error("Extraction service is busy; try again shortly", 503);
  }

  try {
    const analysis = await extractDocument({ mimeType, bytes }, documentType);
    return Response.json(analysis);
  } catch (caught) {
    if (caught instanceof ExtractionQuotaError) {
      return error(
        "Free extraction limit reached for now; try again later",
        429,
      );
    }
    if (caught instanceof ExtractionValidationError) {
      return error(
        documentType === "syllabus"
          ? "Model output did not match the syllabus schema"
          : "Model output did not match the award-letter schema",
        422,
      );
    }
    if (caught instanceof NotAwardLetterError) {
      return error("This doesn't look like an award letter", 422);
    }
    if (caught instanceof NotSyllabusError) {
      return error("This doesn't look like a syllabus", 422);
    }
    if (caught instanceof UnreadableLetterError) {
      const document = documentType === "syllabus" ? "syllabus" : "letter";
      return error(
        caught.kind === "pdf"
          ? `This PDF has no readable text layer, so it is probably a scan. Copy the ${document}'s text into a .txt file and check the figures before uploading.`
          : "This text file could not be read. Save it as plain UTF-8 text and try again.",
        415,
      );
    }
    throw caught;
  } finally {
    admission.release();
  }
}
