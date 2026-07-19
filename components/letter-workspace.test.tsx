import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import type { LineItem } from "../lib/schema";
import type { StoredAnalysis } from "../lib/client-store";

import { ClaimCard } from "./claim-card";
import { LetterWorkspace } from "./letter-workspace";

const item: LineItem = {
  raw_label: "Mystery Award",
  category: "other",
  normalized_name: "Mystery Award",
  amount: 1_250,
  period: "year",
  source_quote: "This sentence is absent from the source",
  explanation: "The letter does not explain what this award requires.",
};

describe("ClaimCard", () => {
  test("labels an unmatched quote as not stated in letter", () => {
    const html = renderToStaticMarkup(
      <ClaimCard
        item={item}
        anchor={null}
        active={false}
        onActivate={() => undefined}
      />,
    );

    expect(html).toContain("not stated in letter");
  });

  test("shows the explanation and estimated four-year total for a loan", () => {
    const html = renderToStaticMarkup(
      <ClaimCard
        item={{
          ...item,
          category: "loan",
          amount: 5_500,
          explanation: "You repay this, with interest.",
        }}
        anchor={{ start: 0, end: 10, score: 1 }}
        active={false}
        onActivate={() => undefined}
      />,
    );

    expect(html).toContain("You repay this, with interest.");
    expect(html).toContain("Est. 4-yr total");
    expect(html).toContain("$22,000");
    expect(html).not.toContain("not stated in letter");
  });
});

describe("LetterWorkspace", () => {
  test("groups claims and renders matched source spans", () => {
    const offer: StoredAnalysis = {
      id: "northstar",
      createdAt: "2026-07-18T12:00:00.000Z",
      source: { kind: "sample", label: "Northstar sample" },
      analysis: {
        school_name: "Northstar College",
        award_year: "2026-2027",
        cost_of_attendance: {
          amount: 40_000,
          source_quote: "Cost of Attendance $40,000",
        },
        line_items: [
          {
            ...item,
            raw_label: "Northstar Grant",
            normalized_name: "Northstar Grant",
            category: "gift_aid",
            source_quote: "Northstar Grant $10,000",
            amount: 10_000,
          },
          {
            ...item,
            raw_label: "Direct Loan",
            normalized_name: "Direct Loan",
            category: "loan",
            source_quote: "Direct Loan $5,500",
            amount: 5_500,
          },
        ],
        transcription:
          "Cost of Attendance $40,000\nNorthstar Grant $10,000\nDirect Loan $5,500",
        missing_info: [],
      },
    };

    const html = renderToStaticMarkup(<LetterWorkspace offer={offer} />);

    expect(html).toContain("Costs");
    expect(html).toContain("Gift aid");
    expect(html).toContain("Loans");
    expect(html).toContain("source-anchor");
  });
});
