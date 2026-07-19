"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";

import { AppShell } from "../../components/app-shell";
import { CompareTable } from "../../components/compare-table";
import { listAnalyses, removeAnalysis, type StoredAnalysis } from "../../lib/client-store";

export default function ComparePage() {
  const ready = useSyncExternalStore(subscribeToHydration, clientReady, serverReady);
  const [removedIds, setRemovedIds] = useState<Set<string>>(() => new Set());
  const offers: StoredAnalysis[] = ready
    ? listAnalyses().filter((offer) => !removedIds.has(offer.id))
    : [];

  function remove(id: string) {
    removeAnalysis(id);
    setRemovedIds((current) => new Set(current).add(id));
  }

  return (
    <AppShell compact>
      <main className="compare-page">
        <header className="compare-page__header">
          <div>
            <div className="breadcrumb">
              <Link href="/">Letters</Link>
              <span aria-hidden="true">/</span>
              <span>Compare</span>
            </div>
            <span className="section-kicker">Offer comparison</span>
            <h1>Put the real costs on one line.</h1>
            <p>Gift aid lowers the price. Loans move the price into the future. Work-study is earned later.</p>
          </div>
          <Link className="secondary-button" href="/">← Add another letter</Link>
        </header>

        {!ready ? (
          <div className="route-state route-state--inline" aria-live="polite">
            <span className="status-spinner" aria-hidden="true" />
            <p>Gathering this session’s offers…</p>
          </div>
        ) : (
          <>
            <section className="saved-offers" aria-labelledby="saved-offers-title">
              <div className="saved-offers__heading">
                <h2 id="saved-offers-title">Offers in this comparison</h2>
                <span>{offers.length} saved this session</span>
              </div>
              <div className="saved-offers__list">
                {offers.map((offer) => (
                  <article key={offer.id} className="saved-offer">
                    <div>
                      <strong>{offer.analysis.school_name ?? "Unnamed school"}</strong>
                      <span>{offer.analysis.award_year ?? "Award year not stated"}</span>
                    </div>
                    <div className="saved-offer__actions">
                      <Link href={`/letter/${encodeURIComponent(offer.id)}`}>Review</Link>
                      <button type="button" onClick={() => remove(offer.id)}>Remove</button>
                    </div>
                  </article>
                ))}
              </div>
            </section>

            {offers.length >= 2 ? (
              <CompareTable offers={offers} />
            ) : (
              <section className="compare-empty">
                <span className="compare-empty__count">{offers.length}/2</span>
                <div>
                  <span className="section-kicker">One more offer needed</span>
                  <h2>Comparison starts with two letters.</h2>
                  <p>Try another synthetic sample or analyze a second award letter.</p>
                </div>
                <Link className="primary-button" href="/">Add a letter</Link>
              </section>
            )}
          </>
        )}
      </main>
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
