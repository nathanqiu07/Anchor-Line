import { extractText, getDocumentProxy } from "unpdf";

/**
 * A digital PDF already carries an exact transcription in its text layer, so reading it
 * costs no model call. Scanned PDFs carry none, and a null return sends the caller to the
 * vision pass rather than letting it extract from nothing.
 */
export async function extractPdfText(bytes: Uint8Array): Promise<string | null> {
  try {
    // pdfjs takes ownership of the buffer it is handed; the caller still needs these bytes
    // for the vision pass when the text layer turns out to be unusable.
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const { text } = await extractText(pdf, { mergePages: false });
    const joined = (Array.isArray(text) ? text : [text]).join("\n").trim();
    return joined.length === 0 ? null : joined;
  } catch {
    // Encrypted, malformed, and image-only PDFs all resolve the same way: use vision.
    return null;
  }
}
