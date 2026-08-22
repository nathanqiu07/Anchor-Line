import { z } from "zod";

import {
  AnalysisSchema,
  type Analysis,
  type LetterAnalysis,
  type SyllabusAnalysis,
} from "./schema";

export const STORAGE_KEY = "anchor-lines:analyses";

/**
 * Where one line of the rendered original actually sits, as percentages of the rendered
 * page box. Captured by `eval/make-fixtures.ts` from the browser that rendered the image,
 * which is the only place this geometry exists: a transcription carries no coordinates and
 * no character offset can recover them.
 */
export interface SourceBox {
  text: string;
  top: number;
  height: number;
  left: number;
  width: number;
}

export interface AnalysisSource {
  kind: "sample" | "upload";
  label: string;
  mediaUrl?: string;
  mediaType?: "image/png" | "application/pdf";
  mediaBoxes?: SourceBox[];
}

export interface StoredAnalysis {
  id: string;
  createdAt: string;
  source: AnalysisSource;
  analysis: Analysis;
}

/** A stored analysis narrowed to a specific document type, so a workspace gets exact fields. */
export type StoredLetterAnalysis = StoredAnalysis & { analysis: LetterAnalysis };
export type StoredSyllabusAnalysis = StoredAnalysis & { analysis: SyllabusAnalysis };

export function isSyllabusOffer(offer: StoredAnalysis): offer is StoredSyllabusAnalysis {
  return offer.analysis.document_type === "syllabus";
}

export function isLetterOffer(offer: StoredAnalysis): offer is StoredLetterAnalysis {
  return offer.analysis.document_type !== "syllabus";
}

const StoredAnalysisSchema: z.ZodType<StoredAnalysis> = z.object({
  id: z.string().min(1),
  createdAt: z.string().min(1),
  source: z.object({
    kind: z.enum(["sample", "upload"]),
    label: z.string().min(1),
    mediaUrl: z.string().optional(),
    mediaType: z.enum(["image/png", "application/pdf"]).optional(),
    // Without this the parse silently drops measured geometry, and the original view
    // quietly loses its highlight while every other check still passes.
    mediaBoxes: z
      .array(
        z.object({
          text: z.string(),
          top: z.number(),
          height: z.number(),
          left: z.number(),
          width: z.number(),
        }),
      )
      .optional(),
  }),
  analysis: AnalysisSchema,
});

const transientUploadMedia = new Map<string, string>();

function replaceTransientMedia(id: string, nextUrl?: string): void {
  const currentUrl = transientUploadMedia.get(id);
  if (
    currentUrl &&
    currentUrl !== nextUrl &&
    currentUrl.startsWith("blob:") &&
    typeof URL.revokeObjectURL === "function"
  ) {
    URL.revokeObjectURL(currentUrl);
  }

  if (nextUrl) transientUploadMedia.set(id, nextUrl);
  else transientUploadMedia.delete(id);
}

function clearTransientMedia(): void {
  for (const id of [...transientUploadMedia.keys()]) replaceTransientMedia(id);
}

function clearTransientMediaExcept(survivingIds: Set<string>): void {
  for (const id of [...transientUploadMedia.keys()]) {
    if (!survivingIds.has(id)) replaceTransientMedia(id);
  }
}

function browserStorage(): Storage | null {
  return typeof window === "undefined" ? null : window.sessionStorage;
}

function recoverEntries(storage: Storage): StoredAnalysis[] {
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return [];

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error("Stored analyses must be an array");

    const entries = parsed.flatMap((entry) => {
      const result = StoredAnalysisSchema.safeParse(entry);
      return result.success ? [result.data] : [];
    });

    if (entries.length !== parsed.length) {
      clearTransientMediaExcept(new Set(entries.map((entry) => entry.id)));
      if (entries.length === 0) {
        storage.removeItem(STORAGE_KEY);
      } else storage.setItem(STORAGE_KEY, JSON.stringify(entries));
    }

    return entries.map(withTransientMedia);
  } catch {
    storage.removeItem(STORAGE_KEY);
    clearTransientMedia();
    return [];
  }
}

function withTransientMedia(entry: StoredAnalysis): StoredAnalysis {
  const mediaUrl = transientUploadMedia.get(entry.id);
  if (!mediaUrl) return entry;
  return { ...entry, source: { ...entry.source, mediaUrl } };
}

function serializableEntry(entry: StoredAnalysis): StoredAnalysis {
  if (entry.source.kind !== "upload") {
    replaceTransientMedia(entry.id);
    return entry;
  }
  if (!entry.source.mediaUrl) return entry;

  replaceTransientMedia(entry.id, entry.source.mediaUrl);
  const source = { ...entry.source };
  delete source.mediaUrl;
  return { ...entry, source };
}

export function listAnalyses(storage = browserStorage()): StoredAnalysis[] {
  return storage ? recoverEntries(storage) : [];
}

export function loadAnalysis(
  id: string,
  storage = browserStorage(),
): StoredAnalysis | null {
  return listAnalyses(storage).find((entry) => entry.id === id) ?? null;
}

export function saveAnalysis(
  entry: StoredAnalysis,
  storage = browserStorage(),
): void {
  if (!storage) return;
  const validated = StoredAnalysisSchema.parse(entry);
  const existing = recoverEntries(storage).filter((item) => item.id !== entry.id);
  storage.setItem(
    STORAGE_KEY,
    JSON.stringify([serializableEntry(validated), ...existing.map(serializableEntry)]),
  );
}

export function removeAnalysis(
  id: string,
  storage = browserStorage(),
): void {
  if (!storage) return;
  const remaining = recoverEntries(storage).filter((entry) => entry.id !== id);
  replaceTransientMedia(id);
  if (remaining.length === 0) storage.removeItem(STORAGE_KEY);
  else storage.setItem(STORAGE_KEY, JSON.stringify(remaining.map(serializableEntry)));
}
