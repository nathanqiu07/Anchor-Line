"use client";

import { useRouter } from "next/navigation";
import { useState, type ChangeEvent, type DragEvent } from "react";

import { saveAnalysis, type AnalysisSource, type StoredAnalysis } from "../lib/client-store";
import { AnalysisSchema, type Analysis, type DocumentType } from "../lib/schema";
import {
  isAcceptedUploadType,
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_MIB,
} from "../lib/upload-contract";

export const NON_LETTER_MESSAGE = "This doesn't look like an award letter";

const letterSamples = [
  {
    id: "offer-1",
    title: "Cedar Ridge University",
    detail: "Full cost · gifts · loan · work-study",
    mediaUrl: "/samples/cedar-ridge.png",
  },
  {
    id: "offer-2",
    title: "Juniper Technical Institute",
    detail: "A deliberately hidden cost",
    mediaUrl: "/samples/juniper-tech.png",
  },
  {
    id: "offer-3",
    title: "Morrow Bay College",
    detail: "Parent PLUS and older loan language",
    mediaUrl: "/samples/morrow-bay.png",
  },
] as const;

const syllabusSamples = [
  {
    id: "syllabus-1",
    title: "Riverton State · BIOL 101",
    detail: "Grade weights, scale, penalties, credit hours, dates",
    mediaUrl: undefined,
  },
] as const;

type Sample = { id: string; title: string; detail: string; mediaUrl?: string };

const copy: Record<DocumentType, {
  kicker: string;
  heading: string;
  blurb: string;
  choose: string;
  reading: string;
  sampleKicker: string;
  sampleHeading: string;
  sampleBlurb: string;
}> = {
  award_letter: {
    kicker: "Start with your letter",
    heading: "Drop the award letter here.",
    blurb: "We’ll turn the numbers into claims you can trace back to the page.",
    choose: "Choose a letter",
    reading: "Reading letter…",
    sampleKicker: "No letter handy?",
    sampleHeading: "Try sample letters",
    sampleBlurb: "Synthetic offers. Real financial-aid patterns.",
  },
  syllabus: {
    kicker: "Start with your syllabus",
    heading: "Drop your syllabus here.",
    blurb: "We’ll pull out every important number and trace each one back to the page.",
    choose: "Choose a syllabus",
    reading: "Reading syllabus…",
    sampleKicker: "No syllabus handy?",
    sampleHeading: "Try a sample syllabus",
    sampleBlurb: "A synthetic syllabus with real grading patterns.",
  },
};

export function validateUpload(file: File): string | null {
  if (!isAcceptedUploadType(file.type)) {
    return "Choose a plain-text (.txt) or digital PDF file.";
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return `Choose a file that is ${MAX_UPLOAD_MIB} MB or smaller.`;
  }
  return null;
}

export function UploadPanel() {
  const router = useRouter();
  const [docType, setDocType] = useState<DocumentType>("award_letter");
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const text = copy[docType];
  const samples: readonly Sample[] = docType === "syllabus" ? syllabusSamples : letterSamples;

  async function requestAnalysis(request: RequestInit): Promise<Analysis> {
    const response = await fetch("/api/extract", { method: "POST", ...request });
    const payload: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      if (payload && typeof payload === "object" && "error" in payload) {
        const message = (payload as { error?: unknown }).error;
        if (typeof message === "string") throw new Error(message);
      }
      // A platform timeout answers with an HTML error page rather than this route's JSON, so
      // the generic copy below would blame a file that is perfectly readable.
      if (response.status === 504 || response.status === 408) {
        throw new Error(
          "The analysis took too long and the server cut it off. Try again, or try a shorter document.",
        );
      }
      throw new Error("We couldn't read that file. Please try again.");
    }

    const parsed = AnalysisSchema.safeParse(payload);
    if (!parsed.success) throw new Error("The analysis response was incomplete. Please try again.");
    return parsed.data;
  }

  function finishAnalysis(id: string, analysis: Analysis, source: AnalysisSource) {
    const saved: StoredAnalysis = {
      id,
      analysis,
      source,
      createdAt: new Date().toISOString(),
    };
    saveAnalysis(saved);
    router.push(`/letter/${encodeURIComponent(id)}`);
  }

  async function trySample(sample: Sample) {
    setBusyLabel(sample.title);
    setError(null);
    try {
      const analysis = await requestAnalysis({
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sampleId: sample.id }),
      });
      finishAnalysis(`sample-${sample.id}`, analysis, {
        kind: "sample",
        label: `${sample.title} sample`,
        ...(sample.mediaUrl
          ? { mediaUrl: sample.mediaUrl, mediaType: "image/png" as const }
          : {}),
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
    form.set("docType", docType);

    try {
      const analysis = await requestAnalysis({ body: form });
      const id = `upload-${Date.now()}-${crypto.randomUUID()}`;
      // A PDF still has an original worth showing beside the claims. A text upload does
      // not: the transcription pane already renders the exact bytes that were uploaded.
      const isPdf = file.type.startsWith("application/pdf");
      finishAnalysis(id, analysis, {
        kind: "upload",
        label: file.name,
        ...(isPdf
          ? { mediaUrl: URL.createObjectURL(file), mediaType: "application/pdf" as const }
          : {}),
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "We couldn't read that file.");
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
      <div className="segmented-control document-type-control" aria-label="Document type">
        <button
          type="button"
          className={docType === "award_letter" ? "is-active" : ""}
          onClick={() => setDocType("award_letter")}
          aria-pressed={docType === "award_letter"}
          disabled={Boolean(busyLabel)}
        >
          Award letter
        </button>
        <button
          type="button"
          className={docType === "syllabus" ? "is-active" : ""}
          onClick={() => setDocType("syllabus")}
          aria-pressed={docType === "syllabus"}
          disabled={Boolean(busyLabel)}
        >
          Syllabus
        </button>
      </div>

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
          <span className="section-kicker">{text.kicker}</span>
          <h2>{text.heading}</h2>
          <p>{text.blurb}</p>
          <div className="upload-panel__actions">
            <label className={`primary-button${busyLabel ? " is-disabled" : ""}`}>
              <input
                className="visually-hidden"
                type="file"
                accept=".txt,.pdf,text/plain,application/pdf"
                onChange={onFileChange}
                disabled={Boolean(busyLabel)}
              />
              {busyLabel ? text.reading : text.choose}
            </label>
            <span className="upload-meta">Text or digital PDF · {MAX_UPLOAD_MIB} MB max</span>
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
          Reading {busyLabel}. Every claim is checked against the source’s own text.
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
            <span className="section-kicker">{text.sampleKicker}</span>
            <h2 id="sample-heading">{text.sampleHeading}</h2>
          </div>
          <p>{text.sampleBlurb}</p>
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
                <strong>{sample.title}</strong>
                <small>{sample.detail}</small>
              </span>
              <span className="sample-card__arrow" aria-hidden="true">↗</span>
            </button>
          ))}
        </div>
      </section>

      <p className="privacy-note">
        <span aria-hidden="true">●</span>
        Uploads are sent to the configured model provider, Google Gemini, for processing. On
        Gemini’s free tier, Google may use submitted content to improve their models. Anchor
        Lines does not persist the file bytes. The resulting analysis and transcription stay
        in this tab’s sessionStorage until the tab closes. Samples stay local and key-free.
      </p>
    </div>
  );
}
