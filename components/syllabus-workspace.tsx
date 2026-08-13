"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";

import { anchorQuote, type AnchorMatch } from "../lib/anchor";
import type { StoredSyllabusAnalysis } from "../lib/client-store";
import type { SyllabusCategory, SyllabusItem } from "../lib/schema";
import {
  explainSyllabusItem,
  gradeWeightsSummary,
  syllabusWarnings,
} from "../packs/syllabus";

interface SyllabusWorkspaceProps {
  offer: StoredSyllabusAnalysis;
}

interface AnchoredClaim {
  key: string;
  match: AnchorMatch | null;
}

const groups: Array<{ category: SyllabusCategory; title: string; note: string }> = [
  { category: "grade_weight", title: "Grade weights", note: "How much each component counts toward the final grade." },
  { category: "grading_scale", title: "Grading scale", note: "The score needed to earn each letter grade." },
  { category: "assessment_count", title: "Assessment counts", note: "How many of each kind of assessment the course includes." },
  { category: "policy_penalty", title: "Policies & penalties", note: "Deductions and rules that can change your grade." },
  { category: "credit_hours", title: "Credit hours", note: "The course's credit or unit value." },
  { category: "schedule_date", title: "Dates", note: "Deadlines and exam dates on the course calendar." },
  { category: "schedule_time", title: "Times", note: "Class meetings and office hours." },
  { category: "logistics", title: "Logistics", note: "Section, room, and contact numbers." },
  { category: "other", title: "Other numbers", note: "Numbers that did not fit another category." },
];

export function SyllabusWorkspace({ offer }: SyllabusWorkspaceProps) {
  const { analysis, source } = offer;
  const warnings = useMemo(() => syllabusWarnings(analysis), [analysis]);
  const weights = useMemo(() => gradeWeightsSummary(analysis), [analysis]);
  const anchors = useMemo<AnchoredClaim[]>(
    () =>
      analysis.items.map((item, index) => ({
        key: `item-${index}`,
        match: anchorQuote(analysis.transcription, item.source_quote),
      })),
    [analysis],
  );
  const anchorByKey = useMemo(
    () => new Map(anchors.map((anchor) => [anchor.key, anchor.match])),
    [anchors],
  );
  const firstAnchored = anchors.find((anchor) => anchor.match)?.key ?? null;
  const [activeKey, setActiveKey] = useState<string | null>(firstAnchored);
  // Routing between analyses reuses this instance; re-seed the active claim when the analysis
  // changes so a new syllabus does not open highlighting a claim from the previous one.
  const [renderedAnalysis, setRenderedAnalysis] = useState(analysis);
  if (renderedAnalysis !== analysis) {
    setRenderedAnalysis(analysis);
    setActiveKey(firstAnchored);
  }
  const [sourceMode, setSourceMode] = useState<"transcription" | "original">("transcription");
  const activeMatch = activeKey ? (anchorByKey.get(activeKey) ?? null) : null;
  const matchMidpointPercent = activeMatch
    ? ((activeMatch.start + activeMatch.end) / 2 / Math.max(analysis.transcription.length, 1)) * 100
    : null;
  const sourceRefs = useRef<Record<string, HTMLElement | null>>({});

  function scrollToSource(mode: string, key: string) {
    const element = sourceRefs.current[`${mode}:${key}`];
    const container = element?.closest<HTMLElement>(".source-pane__body");
    if (!element || !container) return;

    const containerRect = container.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();
    const offset =
      elementRect.top -
      containerRect.top -
      container.clientHeight / 2 +
      elementRect.height / 2;
    container.scrollTo({ top: container.scrollTop + offset, behavior: "smooth" });
  }

  useEffect(() => {
    if (!activeKey) return;
    scrollToSource(sourceMode, activeKey);
  }, [activeKey, sourceMode]);

  function activate(key: string) {
    if (activeKey === key) {
      scrollToSource(sourceMode, key);
      return;
    }
    setActiveKey(key);
  }

  function registerSourceRef(mode: string, key: string, element: HTMLElement | null) {
    sourceRefs.current[`${mode}:${key}`] = element;
  }

  return (
    <div className="letter-workspace">
      <section className="source-pane" aria-labelledby="source-title">
        <header className="pane-header">
          <div>
            <span className="section-kicker">Syllabus source</span>
            <h2 id="source-title">Check every number</h2>
          </div>
          <div className="segmented-control" aria-label="Syllabus source view">
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

        <div className="source-pane__body" id="syllabus-source-view">
          {sourceMode === "transcription" ? (
            <SourceTranscription
              text={analysis.transcription}
              activeKey={activeKey}
              activeMatch={activeMatch}
              registerSourceRef={(key, element) => registerSourceRef("transcription", key, element)}
            />
          ) : source.mediaType === "application/pdf" ? (
            <iframe className="source-pdf" src={source.mediaUrl} title={`Original ${source.label}`} />
          ) : source.mediaUrl ? (
            <div className="source-image">
              <div className="source-image__frame">
                <Image
                  src={source.mediaUrl}
                  alt={`Original ${source.label}`}
                  width={900}
                  height={1150}
                  sizes="(max-width: 900px) 100vw, 50vw"
                  unoptimized
                  priority
                />
                {activeKey && matchMidpointPercent !== null ? (
                  <div
                    className="source-image__highlight"
                    style={{ top: `${matchMidpointPercent}%` }}
                    ref={(element) => registerSourceRef("original", activeKey, element)}
                  >
                    <span className="source-image__highlight-label">Approx. match</span>
                  </div>
                ) : null}
              </div>
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
            <h2 id="analysis-title">Every important number</h2>
          </div>
          <span className="source-instruction">Hover, focus, or tap to check the source</span>
        </header>

        <div className="analysis-groups">
          {groups.map((group) => {
            const items = analysis.items
              .map((item, index) => ({ item, index }))
              .filter(({ item }) => item.category === group.category);
            if (items.length === 0) return null;

            const note =
              group.category === "grade_weight" && weights.total !== null
                ? `${group.note} These total ${weights.total}%.`
                : group.note;

            return (
              <section className="claim-group" key={group.category} aria-labelledby={`${group.category}-heading`}>
                <div className="claim-group__heading">
                  <h3 id={`${group.category}-heading`}>{group.title}</h3>
                  <p>{note}</p>
                </div>
                <div className="claim-group__cards">
                  {items.map(({ item, index }) => {
                    const key = `item-${index}`;
                    return (
                      <SyllabusClaimCard
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

          {warnings.length > 0 ? (
            <aside className="missing-info" aria-labelledby="syllabus-warnings-heading">
              <span className="section-kicker">Worth checking</span>
              <h3 id="syllabus-warnings-heading">Before you rely on these numbers</h3>
              <ul>
                {warnings.map((warning) => (
                  <li key={warning.id}>
                    <strong>{warning.title}.</strong> {warning.message}
                  </li>
                ))}
              </ul>
            </aside>
          ) : null}

          {analysis.missing_info.length > 0 ? (
            <aside className="missing-info" aria-labelledby="missing-info-heading">
              <span className="section-kicker">Still missing</span>
              <h3 id="missing-info-heading">Questions for the instructor</h3>
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

function SyllabusClaimCard({
  item,
  anchor,
  active,
  onActivate,
}: {
  item: SyllabusItem;
  anchor: AnchorMatch | null;
  active: boolean;
  onActivate: () => void;
}) {
  const explanation = explainSyllabusItem(item);
  return (
    <article className={`claim-card${active ? " claim-card--active" : ""}`}>
      <button
        type="button"
        className="claim-card__target"
        onClick={onActivate}
        onFocus={onActivate}
        onMouseEnter={onActivate}
        aria-pressed={active}
        aria-label={`Show source for ${item.raw_label}`}
      >
        <span className="claim-card__heading">
          <span className="claim-card__label">{item.raw_label}</span>
          <span className="claim-card__amount">{item.value}</span>
        </span>
        <span className="claim-card__explanation">{explanation}</span>
        <span className="claim-card__source">
          {anchor ? (
            <span>Found in syllabus</span>
          ) : (
            <span className="honesty-badge">not stated in syllabus</span>
          )}
        </span>
      </button>
    </article>
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
