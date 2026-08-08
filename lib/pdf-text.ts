import { extractText, getDocumentProxy } from "unpdf";

import { installMathSumPrecise } from "./math-sum-precise";

// Runs once at module load, before any PDF reaches pdf.js. The bundled build calls
// Math.sumPrecise while measuring font tables, which Node 24 does not provide.
installMathSumPrecise();

/**
 * A digital PDF already carries an exact transcription in its text layer, so reading it
 * costs no model call. Scanned PDFs carry none, and a null return tells the caller to refuse
 * the letter rather than letting it extract from nothing.
 */
export async function extractPdfText(bytes: Uint8Array): Promise<string | null> {
  try {
    // pdfjs takes ownership of the buffer it is handed, and the caller may still want its
    // own bytes afterwards, so hand over a copy rather than the original.
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const { text } = await extractText(pdf, { mergePages: false });
    const joined = (Array.isArray(text) ? text : [text]).join("\n").trim();
    return joined.length === 0 ? null : joined;
  } catch {
    // Encrypted, malformed, and image-only PDFs all resolve the same way: no usable text.
    return null;
  }
}
