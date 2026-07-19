import type { LetterAnalysis, LineItem } from "../lib/schema";

export interface OfferTotals {
  costOfAttendance: number | null;
  giftAid: number;
  loans: number;
  workStudy: number;
  otherAid: number;
  netPrice: number | null;
  projectedFourYearDebt: number;
  costHidden: boolean;
}

export interface AidWarning {
  id: "work-study" | "loans-not-grants" | "parent-plus";
  title: string;
  message: string;
}

export const financialAidGlossary: Record<string, string> = {
  "direct unsub":
    "A federal loan you repay, with interest that begins accruing while you are in school.",
  "direct unsubsidized loan":
    "A federal loan you repay; interest generally accrues from the time the loan is disbursed.",
  "unsubsidized stafford loan dl":
    "An older label for a federal unsubsidized loan. You repay it, and interest accrues while enrolled.",
  "direct subsidized loan":
    "A federal loan you repay. For eligible students, the government pays interest during certain in-school periods.",
  "parent plus loan":
    "A federal loan borrowed by a parent, not the student; the parent is responsible for repayment.",
  "federal work-study":
    "An opportunity to earn wages through work. It is not a grant and does not directly reduce the bill.",
  scholarship: "Gift aid that does not need to be repaid, subject to the award terms.",
  grant: "Gift aid that does not need to be repaid, subject to the award terms.",
};

function amountFor(item: LineItem): number {
  return item.amount ?? 0;
}

function sumByCategory(analysis: LetterAnalysis, category: LineItem["category"]): number {
  return analysis.line_items
    .filter((item) => item.category === category)
    .reduce((total, item) => total + amountFor(item), 0);
}

/** Returns only arithmetic derived from the award letter; no repayment estimates are inferred. */
export function calculateOffer(analysis: LetterAnalysis): OfferTotals {
  const costOfAttendance = analysis.cost_of_attendance.amount;
  const giftAid = sumByCategory(analysis, "gift_aid");
  const loans = sumByCategory(analysis, "loan");
  const workStudy = sumByCategory(analysis, "work_study");
  const otherAid = sumByCategory(analysis, "other");

  return {
    costOfAttendance,
    giftAid,
    loans,
    workStudy,
    otherAid,
    netPrice: costOfAttendance === null ? null : costOfAttendance - giftAid,
    projectedFourYearDebt: loans * 4,
    costHidden: costOfAttendance === null,
  };
}

/** Highlights common award-letter presentations that can otherwise be misleading. */
export function warningsFor(analysis: LetterAnalysis): AidWarning[] {
  const warnings: AidWarning[] = [];
  const hasLoans = analysis.line_items.some((item) => item.category === "loan");
  const hasGiftAid = analysis.line_items.some(
    (item) => item.category === "gift_aid",
  );

  if (analysis.line_items.some((item) => item.category === "work_study")) {
    warnings.push({
      id: "work-study",
      title: "Work-study is earned, not bill reduction",
      message:
        "Work-study is money you may earn through a job. It is not guaranteed cash off your bill.",
    });
  }

  if (hasLoans && hasGiftAid) {
    warnings.push({
      id: "loans-not-grants",
      title: "Loans are not grants",
      message:
        "This offer lists loans alongside gift aid. Loans must be repaid, usually with interest.",
    });
  }

  if (
    analysis.line_items.some((item) =>
      `${item.raw_label} ${item.normalized_name}`.toLowerCase().includes("parent plus"),
    )
  ) {
    warnings.push({
      id: "parent-plus",
      title: "Parent PLUS is parent debt",
      message:
        "A Parent PLUS loan is borrowed and repaid by a parent, not the student.",
    });
  }

  return warnings;
}

export function explainAidItem(item: LineItem): string {
  const label = `${item.raw_label} ${item.normalized_name}`.toLowerCase();
  const glossaryEntry = Object.entries(financialAidGlossary).find(([term]) =>
    label.includes(term),
  );

  return glossaryEntry?.[1] ?? item.explanation;
}
