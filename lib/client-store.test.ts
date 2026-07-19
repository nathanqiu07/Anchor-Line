import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { LetterAnalysis } from "./schema";
import {
  STORAGE_KEY,
  listAnalyses,
  loadAnalysis,
  removeAnalysis,
  saveAnalysis,
  type StoredAnalysis,
} from "./client-store";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

const analysis: LetterAnalysis = {
  school_name: "Northstar College",
  award_year: "2026-2027",
  cost_of_attendance: {
    amount: 40_000,
    source_quote: "Cost of Attendance $40,000",
  },
  line_items: [],
  transcription: "Cost of Attendance $40,000",
  missing_info: [],
};

const saved: StoredAnalysis = {
  id: "northstar-1",
  createdAt: "2026-07-18T12:00:00.000Z",
  source: {
    kind: "sample",
    label: "Northstar sample letter",
    mediaUrl: "/samples/northstar.png",
    mediaType: "image/png",
  },
  analysis,
};

describe("client analysis store", () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("saves, lists, loads, and removes a typed analysis", () => {
    saveAnalysis(saved, storage);

    expect(listAnalyses(storage)).toEqual([saved]);
    expect(loadAnalysis(saved.id, storage)).toEqual(saved);

    removeAnalysis(saved.id, storage);
    expect(loadAnalysis(saved.id, storage)).toBeNull();
  });

  test("recovers safely when stored data is malformed", () => {
    storage.setItem(STORAGE_KEY, "{ definitely not json");

    expect(listAnalyses(storage)).toEqual([]);
    expect(storage.getItem(STORAGE_KEY)).toBeNull();
  });

  test("revokes the prior blob preview when replacing an analysis", () => {
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const upload: StoredAnalysis = {
      ...saved,
      id: "replace-upload",
      source: {
        kind: "upload",
        label: "first.png",
        mediaUrl: "blob:first-preview",
        mediaType: "image/png",
      },
    };

    saveAnalysis(upload, storage);
    saveAnalysis(
      {
        ...upload,
        source: { ...upload.source, label: "second.png", mediaUrl: "blob:second-preview" },
      },
      storage,
    );

    expect(revokeObjectURL).toHaveBeenCalledWith("blob:first-preview");
    removeAnalysis(upload.id, storage);
  });

  test("revokes the active blob preview when removing an analysis", () => {
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const upload: StoredAnalysis = {
      ...saved,
      id: "remove-upload",
      source: {
        kind: "upload",
        label: "remove.png",
        mediaUrl: "blob:remove-preview",
        mediaType: "image/png",
      },
    };

    saveAnalysis(upload, storage);
    removeAnalysis(upload.id, storage);

    expect(revokeObjectURL).toHaveBeenCalledWith("blob:remove-preview");
  });

  test("revokes transient blob previews when malformed storage is cleared", () => {
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const upload: StoredAnalysis = {
      ...saved,
      id: "malformed-upload",
      source: {
        kind: "upload",
        label: "malformed.png",
        mediaUrl: "blob:malformed-preview",
        mediaType: "image/png",
      },
    };
    saveAnalysis(upload, storage);
    storage.setItem(STORAGE_KEY, "{ no longer valid json");

    expect(listAnalyses(storage)).toEqual([]);

    expect(revokeObjectURL).toHaveBeenCalledWith("blob:malformed-preview");
  });
});
