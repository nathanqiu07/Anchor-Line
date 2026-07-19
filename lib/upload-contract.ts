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
