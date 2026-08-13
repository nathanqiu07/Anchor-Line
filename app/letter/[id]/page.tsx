"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useSyncExternalStore } from "react";

import { AppShell } from "../../../components/app-shell";
import { LetterWorkspace } from "../../../components/letter-workspace";
import { SyllabusWorkspace } from "../../../components/syllabus-workspace";
import {
  isLetterOffer,
  isSyllabusOffer,
  listAnalyses,
  loadAnalysis,
  type StoredAnalysis,
} from "../../../lib/client-store";

/** The heading pair differs by document: a school/year for a letter, a course/term for a syllabus. */
function offerHeading(offer: StoredAnalysis): { title: string; subtitle: string } {
  const analysis = offer.analysis;
  if (analysis.document_type === "syllabus") {
    return {
      title: analysis.course_name ?? "Unnamed course",
      subtitle: analysis.term ?? "Term not stated",
    };
  }
  return {
    title: analysis.school_name ?? "Unnamed school",
    subtitle: analysis.award_year ?? "Award year not stated",
  };
}

export default function LetterPage() {
  const params = useParams<{ id: string }>();
  const ready = useSyncExternalStore(subscribeToHydration, clientReady, serverReady);
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const offer: StoredAnalysis | null = ready
    ? loadAnalysis(decodeURIComponent(id))
    : null;
  const offerCount = ready ? listAnalyses().length : 0;

  return (
    <AppShell compact>
      {!ready ? (
        <main className="route-state" aria-live="polite">
          <span className="status-spinner" aria-hidden="true" />
          <p>Opening your analysis…</p>
        </main>
      ) : !offer ? (
        <main className="route-state">
          <span className="section-kicker">Analysis unavailable</span>
          <h1>This letter is no longer in this session.</h1>
          <p>Open a sample or analyze a letter to start again.</p>
          <Link className="primary-button" href="/">Back to letters</Link>
        </main>
      ) : (
        <main className="letter-page">
          <header className="letter-page__header">
            <div>
              <div className="breadcrumb">
                <Link href="/">Letters</Link>
                <span aria-hidden="true">/</span>
                <span>Analysis</span>
              </div>
              <h1>{offerHeading(offer).title}</h1>
              <p>{offerHeading(offer).subtitle} · {offer.source.label}</p>
            </div>
            <nav className="page-actions" aria-label="Analysis navigation">
              <Link className="secondary-button" href="/">← Back</Link>
              <Link className="primary-button" href="/compare">
                Compare offers{offerCount > 1 ? ` · ${offerCount}` : ""}
              </Link>
            </nav>
          </header>
          {isSyllabusOffer(offer) ? (
            <SyllabusWorkspace offer={offer} />
          ) : isLetterOffer(offer) ? (
            <LetterWorkspace offer={offer} />
          ) : null}
        </main>
      )}
    </AppShell>
  );
}

function subscribeToHydration() {
  return () => undefined;
}

function clientReady() {
  return true;
}

function serverReady() {
  return false;
}
