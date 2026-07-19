import type { StoredAnalysis } from "../lib/client-store";
import { calculateOffer, warningsFor } from "../packs/financial-aid";

interface CompareTableProps {
  offers: StoredAnalysis[];
}

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export function CompareTable({ offers }: CompareTableProps) {
  const columns = offers.map((offer) => ({
    offer,
    totals: calculateOffer(offer.analysis),
    warnings: warningsFor(offer.analysis),
  }));

  return (
    <div className="comparison">
      <div className="comparison__scroll" tabIndex={0} aria-label="Offer comparison table">
        <table className="comparison-table">
          <caption>
            Annual comparisons use stated yearly values and semester values ×2 for both
            cost and aid. Total or unclear periods are not annualized. Work-study is not
            subtracted from net price.
          </caption>
          <thead>
            <tr>
              <th scope="col">Measure</th>
              {columns.map(({ offer }, index) => (
                <th scope="col" key={`${offer.id}-${index}`}>
                  <span>{offer.analysis.school_name ?? "Unnamed school"}</span>
                  <small>{offer.analysis.award_year ?? "Award year not stated"}</small>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <ComparisonRow label="Cost of attendance">
              {columns.map(({ offer, totals }, index) =>
                totals.costHidden ? (
                  <td className="comparison-cell--danger" key={`${offer.id}-${index}`}>
                    <strong>cost hidden</strong>
                    <span>COA is missing from this letter</span>
                  </td>
                ) : totals.annualCostOfAttendance === null ? (
                  <PeriodUnclearCell
                    key={`${offer.id}-${index}`}
                    statedTotal={
                      totals.costOfAttendancePeriod === "total"
                        ? (totals.costOfAttendance ?? 0)
                        : 0
                    }
                    unknownPeriodAmount={
                      totals.costOfAttendancePeriod === "unknown"
                        ? (totals.costOfAttendance ?? 0)
                        : 0
                    }
                    detail="Annual COA is not comparable"
                  />
                ) : totals.costOfAttendancePeriod === "semester" ? (
                  <td key={`${offer.id}-${index}`}>
                    <strong>{money.format(totals.annualCostOfAttendance)}</strong>
                    <span>
                      Annualized from {money.format(totals.costOfAttendance ?? 0)} per
                      semester
                    </span>
                  </td>
                ) : (
                  <td key={`${offer.id}-${index}`}>
                    {money.format(totals.annualCostOfAttendance)}
                  </td>
                ),
              )}
            </ComparisonRow>
            <ComparisonRow label="Gift aid">
              {columns.map(({ offer, totals }, index) =>
                totals.giftAid === null ? (
                  <PeriodUnclearCell
                    key={`${offer.id}-${index}`}
                    statedTotal={totals.giftAidStatedTotal}
                    unknownPeriodAmount={totals.giftAidUnknownPeriodAmount}
                    detail="Annual gift aid is not comparable"
                  />
                ) : (
                  <td key={`${offer.id}-${index}`}>{money.format(totals.giftAid)}</td>
                ),
              )}
            </ComparisonRow>
            <ComparisonRow label="Loans">
              {columns.map(({ offer, totals }, index) =>
                totals.loans === null ? (
                  <PeriodUnclearCell
                    key={`${offer.id}-${index}`}
                    statedTotal={totals.loanStatedTotal}
                    unknownPeriodAmount={totals.loanUnknownPeriodAmount}
                    detail="Annual loans are not comparable"
                  />
                ) : (
                  <td key={`${offer.id}-${index}`}>{money.format(totals.loans)}</td>
                ),
              )}
            </ComparisonRow>
            <ComparisonRow label="Net price">
              {columns.map(({ offer, totals }, index) =>
                totals.costHidden ? (
                  <td className="comparison-cell--danger" key={`${offer.id}-${index}`}>
                    <strong>cost hidden</strong>
                    <span>Net price cannot be checked</span>
                  </td>
                ) : totals.netPrice === null ? (
                  <td className="comparison-cell--unclear" key={`${offer.id}-${index}`}>
                    <strong>period unclear</strong>
                    <span>Net price is not comparable</span>
                  </td>
                ) : (
                  <td key={`${offer.id}-${index}`}>{money.format(totals.netPrice)}</td>
                ),
              )}
            </ComparisonRow>
            <ComparisonRow label="Projected 4-year debt">
              {columns.map(({ offer, totals }, index) =>
                totals.projectedFourYearDebt === null ? (
                  <td className="comparison-cell--unclear" key={`${offer.id}-${index}`}>
                    <strong>period unclear</strong>
                    <span>Four-year debt is not comparable</span>
                  </td>
                ) : (
                  <td key={`${offer.id}-${index}`}>
                    {money.format(totals.projectedFourYearDebt)}
                  </td>
                ),
              )}
            </ComparisonRow>
          </tbody>
        </table>
      </div>

      <section className="comparison-warnings" aria-labelledby="warning-title">
        <div className="section-kicker">Read before comparing</div>
        <h2 id="warning-title">What the totals can hide</h2>
        <div className="warning-grid">
          {columns.flatMap(({ offer, warnings }, columnIndex) =>
            warnings.map((warning) => (
              <article className="warning-card" key={`${offer.id}-${columnIndex}-${warning.id}`}>
                <span>{offer.analysis.school_name ?? "This offer"}</span>
                <h3>{warning.title}</h3>
                <p>{warning.message}</p>
              </article>
            )),
          )}
        </div>
      </section>
    </div>
  );
}

function PeriodUnclearCell({
  statedTotal,
  unknownPeriodAmount,
  detail,
}: {
  statedTotal: number;
  unknownPeriodAmount: number;
  detail: string;
}) {
  const sourceAmount =
    statedTotal > 0
      ? `${money.format(statedTotal)} stated total`
      : unknownPeriodAmount > 0
        ? `${money.format(unknownPeriodAmount)} with period not stated`
        : detail;

  return (
    <td className="comparison-cell--unclear">
      <strong>period unclear</strong>
      <span>{sourceAmount}</span>
      {sourceAmount === detail ? null : <span>{detail}</span>}
    </td>
  );
}

function ComparisonRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <tr>
      <th scope="row">{label}</th>
      {children}
    </tr>
  );
}
