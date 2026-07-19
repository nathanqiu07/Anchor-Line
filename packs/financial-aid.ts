import type { LetterAnalysis, LineItem } from "../lib/schema";

export interface AidClassification {
  category: LineItem["category"];
  normalizedName: string;
  explanation: string;
  recognized: boolean;
}

const explanations = {
  unsubsidizedLoan:
    "You repay this federal loan, and interest accrues while you are in school.",
  subsidizedLoan:
    "You repay this federal loan; for eligible students, the government pays interest during certain in-school periods.",
  federalLoan:
    "You repay this federal loan, usually with interest, according to its loan terms.",
  parentPlus:
    "This federal loan is borrowed and repaid by a parent, not the student.",
  workStudy:
    "This is an opportunity to earn wages through work, not a reduction of your bill.",
  scholarship:
    "Scholarship gift aid does not need to be repaid, subject to the award terms.",
  grant:
    "Grant gift aid does not need to be repaid, subject to eligibility and award terms.",
  meritAward:
    "Merit award gift aid does not need to be repaid, subject to renewal terms.",
  other:
    "The letter does not provide enough information to classify this item as gift aid, a loan, or work-study.",
} as const;

export interface OfferTotals {
  costOfAttendance: number | null;
  costOfAttendancePeriod: LineItem["period"];
  annualCostOfAttendance: number | null;
  costOfAttendanceComparable: boolean;
  giftAid: number | null;
  loans: number | null;
  workStudy: number | null;
  otherAid: number | null;
  giftAidComparable: boolean;
  loansComparable: boolean;
  giftAidIncomplete: boolean;
  loansIncomplete: boolean;
  giftAidStatedTotal: number;
  loanStatedTotal: number;
  giftAidUnknownPeriodAmount: number;
  loanUnknownPeriodAmount: number;
  netPrice: number | null;
  projectedFourYearDebt: number | null;
  netPriceComparable: boolean;
  fourYearDebtComparable: boolean;
  incomplete: boolean;
  costHidden: boolean;
}

export interface AidWarning {
  id: "work-study" | "loans-not-grants" | "parent-plus";
  title: string;
  message: string;
}

export const financialAidGlossary: Record<string, string> = {
  "direct unsub": explanations.unsubsidizedLoan,
  "direct unsubsidized loan": explanations.unsubsidizedLoan,
  "unsubsidized stafford loan dl": explanations.unsubsidizedLoan,
  "direct subsidized loan": explanations.subsidizedLoan,
  "direct loan": explanations.federalLoan,
  "parent plus loan": explanations.parentPlus,
  "federal work-study": explanations.workStudy,
  "campus employment program": explanations.workStudy,
  scholarship: explanations.scholarship,
  grant: explanations.grant,
};

function searchable(value: string): string {
  return value.toLowerCase().replace(/[\u2010-\u2015]/g, "-").replace(/[^a-z0-9+]+/g, " ").trim();
}

const costOfAttendancePattern =
  /\b(?:cost\s+of\s+attendance|student\s+budget|(?:annual|yearly|semester(?:ly)?)\s+(?:education\s+)?cost|total\s+(?:estimated\s+)?(?:education(?:al)?\s+cost|cost\s+of\s+education))\b/i;

/** Returns the exact recognized COA label owned by a one-line source quote. */
export function costOfAttendanceLabel(sourceQuote: string): string | null {
  return sourceQuote.match(costOfAttendancePattern)?.[0] ?? null;
}

function hasAdverseAidContext(sourceQuote: string): boolean {
  const text = searchable(sourceQuote);
  return /\b(?:overpayment|repayment\s+(?:is\s+)?(?:due|required|owed)|repay(?:ment)?\s+due|balance\s+(?:owed|due)|amount\s+due|invoice|bill(?:ing|ed)?|charge(?:d|s)?|collection|denial|denied|ineligible|not\s+eligible|cancel(?:led|ed|lation)|rescind(?:ed|ing)?|rescission)\b/.test(
    text,
  );
}

function classifyText(text: string, rawLabel: string): AidClassification | null {
  if (
    /\b(?:parent\s+plus|direct\s+parent\s+plus)\b|\bparent\b.{0,48}\bplus\b|\bplus\b.{0,48}\bparent\b/.test(
      text,
    )
  ) {
    return {
      category: "loan",
      normalizedName: "Federal Direct Parent PLUS Loan",
      explanation: explanations.parentPlus,
      recognized: true,
    };
  }

  if (/\b(?:unsubsidized|unsub|unsubsidized\s+stafford)\b/.test(text)) {
    return {
      category: "loan",
      normalizedName: "Federal Direct Unsubsidized Loan",
      explanation: explanations.unsubsidizedLoan,
      recognized: true,
    };
  }

  if (/\bsubsidized\b|\bdirect\s+sub\b/.test(text)) {
    return {
      category: "loan",
      normalizedName: "Federal Direct Subsidized Loan",
      explanation: explanations.subsidizedLoan,
      recognized: true,
    };
  }

  if (/\bperkins(?:\s+loan)?\b/.test(text)) {
    return {
      category: "loan",
      normalizedName: "Federal Perkins Loan",
      explanation: explanations.federalLoan,
      recognized: true,
    };
  }

  if (/\b(?:direct|stafford|federal)\s+(?:student\s+)?loan\b|\b(?:grad(?:uate)?\s+)?plus\s+loan\b/.test(text)) {
    return {
      category: "loan",
      normalizedName: "Federal Direct Loan",
      explanation: explanations.federalLoan,
      recognized: true,
    };
  }

  if (/\bwork\s*study\b|\b(?:campus|student)\s+employment\b|\bemployment\s+program\b/.test(text)) {
    const federal = /\b(?:federal\s+)?work\s*study\b/.test(text);
    return {
      category: "work_study",
      normalizedName: federal ? "Federal Work-Study" : rawLabel,
      explanation: explanations.workStudy,
      recognized: true,
    };
  }

  if (/\bpell\s+grant\b/.test(text)) {
    return {
      category: "gift_aid",
      normalizedName: "Federal Pell Grant",
      explanation: explanations.grant,
      recognized: true,
    };
  }

  if (/\bscholarship\b/.test(text)) {
    return {
      category: "gift_aid",
      normalizedName: rawLabel,
      explanation: explanations.scholarship,
      recognized: true,
    };
  }

  if (/\bgrant\b|\btuition\s+waiver\b|\bfellowship\b/.test(text)) {
    return {
      category: "gift_aid",
      normalizedName: rawLabel,
      explanation: explanations.grant,
      recognized: true,
    };
  }

  if (/\bmerit\s+award\b/.test(text)) {
    return {
      category: "gift_aid",
      normalizedName: rawLabel,
      explanation: explanations.meritAward,
      recognized: true,
    };
  }

  return null;
}

/** Classifies source-bound aid terminology without trusting model-authored semantics. */
export function classifyAidItem(rawLabel: string, sourceQuote: string): AidClassification {
  if (hasAdverseAidContext(sourceQuote)) {
    return {
      category: "other",
      normalizedName: rawLabel,
      explanation: explanations.other,
      recognized: false,
    };
  }

  const fromLabel = classifyText(searchable(rawLabel), rawLabel);
  const monetaryOccurrences = sourceQuote.match(/\$\s*\d/g)?.length ?? 0;
  const fromQuote =
    fromLabel ??
    (monetaryOccurrences <= 1
      ? classifyText(searchable(sourceQuote), rawLabel)
      : null);
  return fromQuote ?? {
    category: "other",
    normalizedName: rawLabel,
    explanation: explanations.other,
    recognized: false,
  };
}

function explicitPeriods(text: string, global: boolean): Set<LineItem["period"]> {
  const periods = new Set<LineItem["period"]>();
  const sources = global
    ? text.split(/\r?\n/).map(searchable)
    : [searchable(text)];

  for (const normalized of sources) {
    if (
      global
        ? /\b(?:all\s+)?(?:(?:(?:aid|award|offer|line item)\s+)?amounts?|(?:aid|award|offer)s?)\b.{0,48}\b(?:(?:per|for|each|every)\s+(?:the\s+)?(?:academic\s+)?year|annual(?:ly)?)\b/.test(normalized)
        : /\b(?:per|for|each|every)\s+(?:the\s+)?(?:academic\s+)?year\b|\bannual(?:ly)?\b|\byearly\b/.test(normalized)
    ) {
      periods.add("year");
    }
    if (
      global
        ? /\b(?:all\s+)?(?:(?:(?:aid|award|offer|line item)\s+)?amounts?|(?:aid|award|offer)s?)\b.{0,48}\b(?:per|for|each|every)\s+semester\b/.test(normalized)
        : /\b(?:per|for|each|every|fall|spring|summer)\s+semester\b|\bsemester(?:ly)?\b/.test(normalized)
    ) {
      periods.add("semester");
    }
    if (
      global
        ? /\b(?:all\s+)?(?:(?:(?:aid|award|offer|line item)\s+)?amounts?|(?:aid|award|offer)s?)\b.{0,48}\b(?:total|entire|full)\s+(?:program|degree)\b/.test(normalized)
        : /\btotal(?:\s+(?:program|award|eligibility|loan|grant|amount))?\b|\b(?:entire|full)\s+(?:program|degree)\b/.test(normalized)
    ) {
      periods.add("total");
    }
  }

  return periods;
}

/** Uses explicit source wording only; ambiguous or unstated periods remain unknown. */
export function deriveAidPeriod(sourceQuote: string, transcription: string): LineItem["period"] {
  const local = explicitPeriods(sourceQuote, false);
  if (local.size === 1) return [...local][0];
  if (local.size > 1) return "unknown";
  const global = explicitPeriods(transcription, true);
  return global.size === 1 ? [...global][0] : "unknown";
}

/** Derives the COA basis from its exact quote and, when needed, its preceding heading. */
export function deriveCostOfAttendancePeriod(
  analysis: LetterAnalysis,
): LineItem["period"] {
  const sourceQuote = analysis.cost_of_attendance.source_quote;
  if (!sourceQuote) return "unknown";

  const local = explicitPeriods(sourceQuote, false);
  if (local.size === 1) return [...local][0];
  if (local.size > 1) return "unknown";

  const lines = analysis.transcription.split(/\r?\n/);
  const quoteIndexes = lines
    .map((line, index) => (line === sourceQuote ? index : -1))
    .filter((index) => index >= 0);
  if (quoteIndexes.length !== 1 || quoteIndexes[0] === 0) return "unknown";

  const adjacent = explicitPeriods(lines[quoteIndexes[0] - 1], false);
  return adjacent.size === 1 ? [...adjacent][0] : "unknown";
}

interface CategoryPeriodTotal {
  annualAmount: number | null;
  statedTotal: number;
  unknownPeriodAmount: number;
  comparable: boolean;
  incomplete: boolean;
}

function totalByCategory(
  analysis: LetterAnalysis,
  category: LineItem["category"],
): CategoryPeriodTotal {
  let annualAmount = 0;
  let statedTotal = 0;
  let unknownPeriodAmount = 0;
  let incomplete = false;

  for (const item of analysis.line_items.filter(
    (candidate) => candidate.category === category,
  )) {
    if (item.amount === null) {
      incomplete = true;
      continue;
    }

    if (item.period === "year") annualAmount += item.amount;
    else if (item.period === "semester") annualAmount += item.amount * 2;
    else if (item.period === "total") {
      statedTotal += item.amount;
      incomplete = true;
    } else {
      unknownPeriodAmount += item.amount;
      incomplete = true;
    }
  }

  return {
    annualAmount: incomplete ? null : annualAmount,
    statedTotal,
    unknownPeriodAmount,
    comparable: !incomplete,
    incomplete,
  };
}

/** Returns only arithmetic derived from the award letter; no repayment estimates are inferred. */
export function calculateOffer(analysis: LetterAnalysis): OfferTotals {
  const costOfAttendance = analysis.cost_of_attendance.amount;
  const costOfAttendancePeriod = deriveCostOfAttendancePeriod(analysis);
  const annualCostOfAttendance =
    costOfAttendance === null
      ? null
      : costOfAttendancePeriod === "year"
        ? costOfAttendance
        : costOfAttendancePeriod === "semester"
          ? costOfAttendance * 2
          : null;
  const costOfAttendanceComparable = annualCostOfAttendance !== null;
  const giftAid = totalByCategory(analysis, "gift_aid");
  const loans = totalByCategory(analysis, "loan");
  const workStudy = totalByCategory(analysis, "work_study");
  const otherAid = totalByCategory(analysis, "other");
  const netPriceComparable = costOfAttendanceComparable && giftAid.comparable;
  const fourYearDebtComparable = loans.comparable;

  return {
    costOfAttendance,
    costOfAttendancePeriod,
    annualCostOfAttendance,
    costOfAttendanceComparable,
    giftAid: giftAid.annualAmount,
    loans: loans.annualAmount,
    workStudy: workStudy.annualAmount,
    otherAid: otherAid.annualAmount,
    giftAidComparable: giftAid.comparable,
    loansComparable: loans.comparable,
    giftAidIncomplete: giftAid.incomplete,
    loansIncomplete: loans.incomplete,
    giftAidStatedTotal: giftAid.statedTotal,
    loanStatedTotal: loans.statedTotal,
    giftAidUnknownPeriodAmount: giftAid.unknownPeriodAmount,
    loanUnknownPeriodAmount: loans.unknownPeriodAmount,
    netPrice: netPriceComparable
      ? annualCostOfAttendance - (giftAid.annualAmount ?? 0)
      : null,
    projectedFourYearDebt: fourYearDebtComparable
      ? (loans.annualAmount ?? 0) * 4
      : null,
    netPriceComparable,
    fourYearDebtComparable,
    incomplete: giftAid.incomplete || loans.incomplete,
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
