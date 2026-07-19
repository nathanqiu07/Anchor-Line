"use client";

import { useRouter } from "next/navigation";
import { useState, type ChangeEvent, type DragEvent } from "react";

import { saveAnalysis, type AnalysisSource, type StoredAnalysis } from "../lib/client-store";
import { LetterAnalysisSchema, type LetterAnalysis } from "../lib/schema";
import {
  isAcceptedUploadType,
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_MIB,
} from "../lib/upload-contract";

export const NON_LETTER_MESSAGE = "This doesn't look like an award letter";

const samples = [
  {
    id: "offer-1",
    school: "Cedar Ridge University",
    detail: "Full cost · gifts · loan · work-study",
    mediaUrl: "/samples/cedar-ridge.png",
  },
  {
    id: "offer-2",
    school: "Juniper Technical Institute",
    detail: "A deliberately hidden cost",
    mediaUrl: "/samples/juniper-tech.png",
  },
  {
    id: "offer-3",
    school: "Morrow Bay College",
    detail: "Parent PLUS and older loan language",
    mediaUrl: "/samples/morrow-bay.png",
  },
] as const;

export function validateUpload(file: File): string | null {
  if (!isAcceptedUploadType(file.type)) return "Choose a PNG, JPG, or PDF award letter.";
  if (file.size > MAX_UPLOAD_BYTES) {
    return `Choose a file that is ${MAX_UPLOAD_MIB} MB or smaller.`;
  }
  return null;
}

export function UploadPanel() {
  const router = useRouter();
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  async function requestAnalysis(request: RequestInit): Promise<LetterAnalysis> {
    const response = await fetch("/api/extract", { method: "POST", ...request });
    const payload: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      if (payload && typeof payload === "object" && "error" in payload) {
        const message = (payload as { error?: unknown }).error;
        if (typeof message === "string") throw new Error(message);
      }
      throw new Error("We couldn't read that letter. Please try again.");
    }

    const parsed = LetterAnalysisSchema.safeParse(payload);
    if (!parsed.success) throw new Error("The letter response was incomplete. Please try again.");
    return parsed.data;
  }

  function finishAnalysis(id: string, analysis: LetterAnalysis, source: AnalysisSource) {
    const saved: StoredAnalysis = {
      id,
      analysis,
      source,
      createdAt: new Date().toISOString(),
    };
    saveAnalysis(saved);
    router.push(`/letter/${encodeURIComponent(id)}`);
  }

  async function trySample(sample: (typeof samples)[number]) {
    setBusyLabel(sample.school);
    setError(null);
    try {
      const analysis = await requestAnalysis({
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sampleId: sample.id }),
      });
      finishAnalysis(`sample-${sample.id}`, analysis, {
        kind: "sample",
        label: `${sample.school} sample letter`,
        mediaUrl: sample.mediaUrl,
        mediaType: "image/png",
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "We couldn't open that sample.");
      setBusyLabel(null);
    }
  }

  async function analyzeUpload(file: File) {
    const validationError = validateUpload(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    setBusyLabel(file.name);
    setError(null);
    const form = new FormData();
    form.set("file", file);

    try {
      const analysis = await requestAnalysis({ body: form });
      const id = `upload-${Date.now()}-${crypto.randomUUID()}`;
      finishAnalysis(id, analysis, {
        kind: "upload",
        label: file.name,
        mediaUrl: URL.createObjectURL(file),
        mediaType: file.type as AnalysisSource["mediaType"],
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "We couldn't read that letter.");
      setBusyLabel(null);
    }
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) void analyzeUpload(file);
    event.target.value = "";
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    if (busyLabel) return;
    const file = event.dataTransfer.files[0];
    if (file) void analyzeUpload(file);
  }

  return (
    <div className="upload-experience">
      <div
        className={`upload-panel${dragging ? " upload-panel--dragging" : ""}`}
        onDragEnter={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
        }}
        onDrop={onDrop}
      >
        <div className="upload-panel__number" aria-hidden="true">01</div>
        <div className="upload-panel__copy">
          <span className="section-kicker">Start with your letter</span>
          <h2>Drop the award letter here.</h2>
          <p>We’ll turn the numbers into claims you can trace back to the page.</p>
          <div className="upload-panel__actions">
            <label className={`primary-button${busyLabel ? " is-disabled" : ""}`}>
              <input
                className="visually-hidden"
                type="file"
                accept=".png,.jpg,.jpeg,.pdf,image/png,image/jpeg,application/pdf"
                onChange={onFileChange}
                disabled={Boolean(busyLabel)}
              />
              {busyLabel ? "Reading letter…" : "Choose a letter"}
            </label>
            <span className="upload-meta">PNG, JPG, or PDF · {MAX_UPLOAD_MIB} MB max</span>
          </div>
        </div>
        <div className="upload-panel__mark" aria-hidden="true">
          <span>AL</span>
          <i />
        </div>
      </div>

      {busyLabel ? (
        <div className="status-message" role="status">
          <span className="status-spinner" aria-hidden="true" />
          Reading {busyLabel}. First we transcribe it, then we check every claim.
        </div>
      ) : null}
      {error ? (
        <div className="error-message" role="alert">
          <strong>We hit a snag.</strong>
          <span>{error}</span>
        </div>
      ) : null}

      <section className="sample-section" aria-labelledby="sample-heading">
        <div className="sample-section__heading">
          <div>
            <span className="section-kicker">No letter handy?</span>
            <h2 id="sample-heading">Try sample letters</h2>
          </div>
          <p>Synthetic offers. Real financial-aid patterns.</p>
        </div>
        <div className="sample-grid">
          {samples.map((sample, index) => (
            <button
              type="button"
              className="sample-card"
              key={sample.id}
              onClick={() => void trySample(sample)}
              disabled={Boolean(busyLabel)}
            >
              <span className="sample-card__index">0{index + 1}</span>
              <span className="sample-card__body">
                <strong>{sample.school}</strong>
                <small>{sample.detail}</small>
              </span>
              <span className="sample-card__arrow" aria-hidden="true">↗</span>
            </button>
          ))}
        </div>
      </section>

      <p className="privacy-note">
        <span aria-hidden="true">●</span>
        Your letters are processed in memory and not stored. Closing this tab clears the analysis.
      </p>
    </div>
  );
}
