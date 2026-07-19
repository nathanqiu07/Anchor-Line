import { z } from "zod";

import { LetterAnalysisSchema, type LetterAnalysis } from "./schema";

export const STORAGE_KEY = "anchor-lines:analyses";

export interface AnalysisSource {
  kind: "sample" | "upload";
  label: string;
  mediaUrl?: string;
  mediaType?: "image/png" | "image/jpeg" | "application/pdf";
}

export interface StoredAnalysis {
  id: string;
  createdAt: string;
  source: AnalysisSource;
  analysis: LetterAnalysis;
}

const StoredAnalysisSchema: z.ZodType<StoredAnalysis> = z.object({
  id: z.string().min(1),
  createdAt: z.string().min(1),
  source: z.object({
    kind: z.enum(["sample", "upload"]),
    label: z.string().min(1),
    mediaUrl: z.string().optional(),
    mediaType: z.enum(["image/png", "image/jpeg", "application/pdf"]).optional(),
  }),
  analysis: LetterAnalysisSchema,
});

const transientUploadMedia = new Map<string, string>();

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
      if (entries.length === 0) storage.removeItem(STORAGE_KEY);
      else storage.setItem(STORAGE_KEY, JSON.stringify(entries));
    }

    return entries.map(withTransientMedia);
  } catch {
    storage.removeItem(STORAGE_KEY);
    return [];
  }
}

function withTransientMedia(entry: StoredAnalysis): StoredAnalysis {
  const mediaUrl = transientUploadMedia.get(entry.id);
  if (!mediaUrl) return entry;
  return { ...entry, source: { ...entry.source, mediaUrl } };
}

function serializableEntry(entry: StoredAnalysis): StoredAnalysis {
  if (entry.source.kind !== "upload" || !entry.source.mediaUrl) return entry;

  transientUploadMedia.set(entry.id, entry.source.mediaUrl);
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
  transientUploadMedia.delete(id);
  if (remaining.length === 0) storage.removeItem(STORAGE_KEY);
  else storage.setItem(STORAGE_KEY, JSON.stringify(remaining.map(serializableEntry)));
}
