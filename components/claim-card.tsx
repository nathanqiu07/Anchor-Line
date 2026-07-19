"use client";

import type { AnchorMatch } from "../lib/anchor";
import type { LineItem } from "../lib/schema";
import { explainAidItem } from "../packs/financial-aid";

interface ClaimCardProps {
  item: LineItem;
  anchor: AnchorMatch | null;
  active: boolean;
  onActivate: () => void;
}

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export function ClaimCard({ item, anchor, active, onActivate }: ClaimCardProps) {
  const explanation = explainAidItem(item);
  const annualizedAmount =
    item.amount === null
      ? null
      : item.period === "year"
        ? item.amount
        : item.period === "semester"
          ? item.amount * 2
          : null;
  const periodCopy =
    item.period === "year"
      ? "Per academic year"
      : item.period === "semester"
        ? `Per semester${annualizedAmount === null ? "" : ` · ${money.format(annualizedAmount)} annualized`}`
        : item.period === "total"
          ? "Stated total · not annualized"
          : "Period unclear · not annualized";

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
          {item.amount === null ? (
            <span className="claim-card__amount claim-card__amount--missing">
              Amount not stated
            </span>
          ) : (
            <span className="claim-card__amount">{money.format(item.amount)}</span>
          )}
        </span>
        <span className="claim-card__period">{periodCopy}</span>
        <span className="claim-card__explanation">{explanation}</span>
        {item.category === "loan" && annualizedAmount !== null ? (
          <span className="claim-card__projection">
            Est. 4-yr total <strong>{money.format(annualizedAmount * 4)}</strong>
          </span>
        ) : null}
        <span className="claim-card__source">
          {anchor ? (
            <span>Source match · {Math.round(anchor.score * 100)}%</span>
          ) : (
            <span className="honesty-badge">not stated in letter</span>
          )}
        </span>
      </button>
    </article>
  );
}
