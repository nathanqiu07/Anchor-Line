"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";

import { anchorQuote, type AnchorMatch } from "../lib/anchor";
import type { StoredAnalysis } from "../lib/client-store";
import type { AidCategory } from "../lib/schema";

import { ClaimCard } from "./claim-card";

interface LetterWorkspaceProps {
  offer: StoredAnalysis;
}

interface AnchoredClaim {
  key: string;
  match: AnchorMatch | null;
}

const groups: Array<{ category: AidCategory; title: string; note: string }> = [
  {
    category: "gift_aid",
    title: "Gift aid",
    note: "Money that generally does not need to be repaid.",
  },
  {
    category: "loan",
    title: "Loans",
    note: "Borrowed money. Four-year figures assume this annual amount repeats.",
  },
  {
    category: "work_study",
    title: "Work-study",
    note: "Wages you may earn through work—not money taken off the bill.",
  },
  {
    category: "other",
    title: "Other items",
    note: "Items that do not fit gift aid, loans, or work-study.",
  },
];

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export function LetterWorkspace({ offer }: LetterWorkspaceProps) {
  const { analysis, source } = offer;
  const anchors = useMemo<AnchoredClaim[]>(
    () => [
      {
        key: "cost",
        match: analysis.cost_of_attendance.source_quote
          ? anchorQuote(analysis.transcription, analysis.cost_of_attendance.source_quote)
          : null,
      },
      ...analysis.line_items.map((item, index) => ({
        key: `item-${index}`,
        match: anchorQuote(analysis.transcription, item.source_quote),
      })),
    ],
    [analysis],
  );
  const anchorByKey = useMemo(
    () => new Map(anchors.map((anchor) => [anchor.key, anchor.match])),
    [anchors],
  );
  const firstAnchored = anchors.find((anchor) => anchor.match)?.key ?? null;
  const [activeKey, setActiveKey] = useState<string | null>(firstAnchored);
  const [sourceMode, setSourceMode] = useState<"transcription" | "original">(
    "transcription",
  );
  const sourceRefs = useRef<Record<string, HTMLElement | null>>({});

  function scrollToSource(key: string) {
    sourceRefs.current[key]?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }

  useEffect(() => {
    if (!activeKey || sourceMode !== "transcription") return;
    scrollToSource(activeKey);
  }, [activeKey, sourceMode]);

  function activate(key: string) {
    if (activeKey === key && sourceMode === "transcription") {
      scrollToSource(key);
      return;
    }
    setSourceMode("transcription");
    setActiveKey(key);
  }

  function registerSourceRef(key: string, element: HTMLElement | null) {
    sourceRefs.current[key] = element;
  }

  return (
    <div className="letter-workspace">
      <section className="source-pane" aria-labelledby="source-title">
        <header className="pane-header">
          <div>
            <span className="section-kicker">Letter source</span>
            <h2 id="source-title">Check every claim</h2>
          </div>
          <div className="segmented-control" aria-label="Letter source view">
            <button
              type="button"
              className={sourceMode === "transcription" ? "is-active" : ""}
              onClick={() => setSourceMode("transcription")}
              aria-pressed={sourceMode === "transcription"}
            >
              Transcription
            </button>
            <button
              type="button"
              className={sourceMode === "original" ? "is-active" : ""}
              onClick={() => setSourceMode("original")}
              aria-pressed={sourceMode === "original"}
              disabled={!source.mediaUrl}
            >
              Original
            </button>
          </div>
        </header>

        <div className="source-pane__body" id="letter-source-view">
          {sourceMode === "transcription" ? (
            <SourceTranscription
              text={analysis.transcription}
              activeKey={activeKey}
              activeMatch={activeKey ? (anchorByKey.get(activeKey) ?? null) : null}
              registerSourceRef={registerSourceRef}
            />
          ) : source.mediaType === "application/pdf" ? (
            <iframe
              className="source-pdf"
              src={source.mediaUrl}
              title={`Original ${source.label}`}
            />
          ) : source.mediaUrl ? (
            <div className="source-image">
              <Image
                src={source.mediaUrl}
                alt={`Original ${source.label}`}
                width={900}
                height={1150}
                sizes="(max-width: 900px) 100vw, 50vw"
                unoptimized
                priority
              />
            </div>
          ) : (
            <p className="empty-note">Original preview is unavailable after a reload.</p>
          )}
        </div>
      </section>

      <section className="analysis-pane" aria-labelledby="analysis-title">
        <header className="pane-header pane-header--analysis">
          <div>
            <span className="section-kicker">Plain-language read</span>
            <h2 id="analysis-title">What this offer says</h2>
          </div>
          <span className="source-instruction">Hover, focus, or tap to check the source</span>
        </header>

        <div className="analysis-groups">
          <section className="claim-group" aria-labelledby="cost-heading">
            <div className="claim-group__heading">
              <h3 id="cost-heading">Costs</h3>
              <p>The school’s estimate before financial aid.</p>
            </div>
            <article
              className={`claim-card claim-card--cost${activeKey === "cost" ? " claim-card--active" : ""}`}
            >
              <button
                type="button"
                className="claim-card__target"
                onClick={() => activate("cost")}
                onFocus={() => activate("cost")}
                onMouseEnter={() => activate("cost")}
                aria-pressed={activeKey === "cost"}
                aria-label="Show source for cost of attendance"
              >
                <span className="claim-card__heading">
                  <span className="claim-card__label">Cost of attendance</span>
                  <span className="claim-card__amount">
                    {analysis.cost_of_attendance.amount === null
                      ? "Not stated"
                      : money.format(analysis.cost_of_attendance.amount)}
                  </span>
                </span>
                <span className="claim-card__explanation">
                  The school’s annual estimate for tuition, fees, living costs, and other
                  education expenses. It is the baseline for comparing offers.
                </span>
                <span className="claim-card__source">
                  {anchorByKey.get("cost") ? (
                    <span>Source match · {Math.round((anchorByKey.get("cost")?.score ?? 0) * 100)}%</span>
                  ) : (
                    <span className="honesty-badge">not stated in letter</span>
                  )}
                </span>
              </button>
            </article>
          </section>

          {groups.map((group) => {
            const items = analysis.line_items
              .map((item, index) => ({ item, index }))
              .filter(({ item }) => item.category === group.category);
            if (items.length === 0) return null;

            return (
              <section className="claim-group" key={group.category} aria-labelledby={`${group.category}-heading`}>
                <div className="claim-group__heading">
                  <h3 id={`${group.category}-heading`}>{group.title}</h3>
                  <p>{group.note}</p>
                </div>
                <div className="claim-group__cards">
                  {items.map(({ item, index }) => {
                    const key = `item-${index}`;
                    return (
                      <ClaimCard
                        key={key}
                        item={item}
                        anchor={anchorByKey.get(key) ?? null}
                        active={activeKey === key}
                        onActivate={() => activate(key)}
                      />
                    );
                  })}
                </div>
              </section>
            );
          })}

          {analysis.missing_info.length > 0 ? (
            <aside className="missing-info" aria-labelledby="missing-info-heading">
              <span className="section-kicker">Still missing</span>
              <h3 id="missing-info-heading">Questions for the financial aid office</h3>
              <ul>
                {analysis.missing_info.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </aside>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function SourceTranscription({
  text,
  activeKey,
  activeMatch,
  registerSourceRef,
}: {
  text: string;
  activeKey: string | null;
  activeMatch: AnchorMatch | null;
  registerSourceRef: (key: string, element: HTMLElement | null) => void;
}) {
  if (!activeKey || !activeMatch) {
    return <pre className="transcription">{text}</pre>;
  }

  return (
    <pre className="transcription">
      {text.slice(0, activeMatch.start)}
      <mark
        className="source-anchor source-anchor--active"
        data-source-key={activeKey}
        ref={(element) => registerSourceRef(activeKey, element)}
      >
        {text.slice(activeMatch.start, activeMatch.end)}
      </mark>
      {text.slice(activeMatch.end)}
    </pre>
  );
}
