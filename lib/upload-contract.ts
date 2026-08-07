export const MAX_UPLOAD_MIB = 4;
export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MIB * 1024 * 1024;

/**
 * Anchor Lines only accepts formats whose text is recoverable exactly, because every claim
 * it makes is anchored to a source line and an anchor is only worth anything if that line is
 * really what the letter says. Plain text is exact by definition. A digital PDF carries its
 * own text layer, which is read deterministically and then gated (see `isUsableTextLayer`)
 * before it is trusted. Images and scanned PDFs carry no text at all, and reading them would
 * mean OCR — a guess, however good, which is exactly what this tool must not anchor to.
 */
export const ACCEPTED_UPLOAD_TYPES = ["text/plain", "application/pdf"] as const;

export type AcceptedUploadType = (typeof ACCEPTED_UPLOAD_TYPES)[number];

/**
 * Strips the charset browsers append to text uploads and returns the bare media type, or
 * null when it is not accepted. Callers should carry this normalized value rather than
 * `file.type`: everything downstream compares the media type by equality, and
 * `text/plain; charset=utf-8` silently matches none of those comparisons.
 */
export function normalizedUploadType(value: string): AcceptedUploadType | null {
  const mediaType = value.split(";")[0].trim().toLowerCase();
  return (ACCEPTED_UPLOAD_TYPES as readonly string[]).includes(mediaType)
    ? (mediaType as AcceptedUploadType)
    : null;
}

export function isAcceptedUploadType(value: string): value is AcceptedUploadType {
  return normalizedUploadType(value) !== null;
}

const pdfSignature = [0x25, 0x50, 0x44, 0x46] as const;

/**
 * Confirms the declared MIME type agrees with the file's leading bytes. Plain text has no
 * signature to check, so it is verified by decoding instead — see `decodeUploadText`.
 */
export function hasValidUploadSignature(
  type: AcceptedUploadType,
  bytes: Uint8Array,
): boolean {
  if (type === "text/plain") return decodeUploadText(bytes) !== null;
  return (
    bytes.length >= pdfSignature.length &&
    pdfSignature.every((byte, index) => bytes[index] === byte)
  );
}

const utf8Bom = [0xef, 0xbb, 0xbf] as const;

const tab = 9;
const lineFeed = 10;
const carriageReturn = 13;
const firstPrintable = 32;

/**
 * Binary files relabelled as text/plain still decode when their bytes happen to be valid
 * UTF-8, so reject the control characters a real letter never contains. Tab, line feed, and
 * carriage return are ordinary letter formatting.
 */
function hasBinaryControlCharacter(text: string): boolean {
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code >= firstPrintable) continue;
    if (code !== tab && code !== lineFeed && code !== carriageReturn) return true;
  }
  return false;
}

/**
 * Decodes a text upload, or returns null when the bytes are not exactly recoverable as
 * UTF-8. This is the plain-text equivalent of the PDF signature check: a strict decode
 * rejects invalid sequences, and the control-character sweep catches binary files that were
 * merely relabelled as text.
 */
export function decodeUploadText(bytes: Uint8Array): string | null {
  const body =
    bytes.length >= utf8Bom.length && utf8Bom.every((byte, index) => bytes[index] === byte)
      ? bytes.subarray(utf8Bom.length)
      : bytes;

  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(body);
  } catch {
    return null;
  }

  return hasBinaryControlCharacter(text) ? null : text;
}
