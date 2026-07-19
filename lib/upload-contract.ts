export const MAX_UPLOAD_MIB = 4;
export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MIB * 1024 * 1024;

export const ACCEPTED_UPLOAD_TYPES = [
  "image/png",
  "image/jpeg",
  "application/pdf",
] as const;

export type AcceptedUploadType = (typeof ACCEPTED_UPLOAD_TYPES)[number];

export function isAcceptedUploadType(value: string): value is AcceptedUploadType {
  return (ACCEPTED_UPLOAD_TYPES as readonly string[]).includes(value);
}

const signatures: Record<AcceptedUploadType, readonly number[]> = {
  "image/png": [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  "image/jpeg": [0xff, 0xd8],
  "application/pdf": [0x25, 0x50, 0x44, 0x46],
};

/** Confirms that the declared MIME type agrees with the file's leading bytes. */
export function hasValidUploadSignature(
  type: AcceptedUploadType,
  bytes: Uint8Array,
): boolean {
  const expected = signatures[type];
  return (
    bytes.length >= expected.length &&
    expected.every((byte, index) => bytes[index] === byte)
  );
}
