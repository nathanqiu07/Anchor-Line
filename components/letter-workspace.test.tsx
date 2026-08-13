// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";

import type { LineItem } from "../lib/schema";
import type { StoredLetterAnalysis } from "../lib/client-store";

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

const scrollTo = vi.fn();

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "scrollTo", {
    configurable: true,
    value: scrollTo,
  });
});

afterEach(() => {
  cleanup();
  scrollTo.mockClear();
});

function offerWith(
  transcription: string,
  lineItems: LineItem[],
  costQuote: string | null = null,
): StoredLetterAnalysis {
  return {
    id: "overlap-offer",
    createdAt: "2026-07-18T12:00:00.000Z",
    source: { kind: "sample", label: "Overlap sample" },
    analysis: {
      school_name: "Overlap College",
      award_year: "2026-2027",
      cost_of_attendance: {
        amount: costQuote ? 20_000 : null,
        source_quote: costQuote,
      },
      line_items: lineItems,
      transcription,
      missing_info: [],
    },
  };
}

async function expectActivationTarget(
  container: HTMLElement,
  buttonName: string,
  sourceKey: string,
  quote: string,
) {
  scrollTo.mockClear();
  fireEvent.click(screen.getByRole("button", { name: buttonName }));

  const activeTarget = container.querySelector("mark.source-anchor--active");
  expect(activeTarget?.getAttribute("data-source-key")).toBe(sourceKey);
  expect(activeTarget?.textContent).toBe(quote);
  await waitFor(() => expect(scrollTo).toHaveBeenCalledTimes(1));
}

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
        anchor={{ start: 0, end: 10 }}
        active={false}
        onActivate={() => undefined}
      />,
    );

    expect(html).toContain("You repay this, with interest.");
    expect(html).toContain("Est. 4-yr total");
    expect(html).toContain("$22,000");
    expect(html).toContain("Per academic year");
    expect(html).not.toContain("not stated in letter");
  });

  test.each([
    ["semester", "Per semester", "$44,000", "Est. 4-yr total"],
    ["total", "Stated total", null, "Est. 4-yr total"],
    ["unknown", "Period unclear", null, "Est. 4-yr total"],
  ] as const)(
    "renders a %s-period loan without inventing an unsupported projection",
    (period, periodCopy, projectedAmount, projectionLabel) => {
      const html = renderToStaticMarkup(
        <ClaimCard
          item={{ ...item, category: "loan", amount: 5_500, period }}
          anchor={{ start: 0, end: 10 }}
          active={false}
          onActivate={() => undefined}
        />,
      );

      expect(html).toContain(periodCopy);
      if (projectedAmount) {
        expect(html).toContain(projectedAmount);
        expect(html).toContain(projectionLabel);
      } else {
        expect(html).not.toContain(projectionLabel);
      }
    },
  );
});

describe("LetterWorkspace", () => {
  test("groups claims and renders matched source spans", () => {
    const offer: StoredLetterAnalysis = {
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
    expect(html).toContain("Period unclear");
    expect(html).not.toContain("annual estimate");
  });

  test("labels semester COA and its annualized comparison basis", () => {
    const semester = offerWith(
      "Semester Cost of Attendance $20,000",
      [],
      "Semester Cost of Attendance $20,000",
    );

    const html = renderToStaticMarkup(<LetterWorkspace offer={semester} />);

    expect(html).toContain("$20,000");
    expect(html).toContain("Per semester");
    expect(html).toContain("$40,000 annualized");
  });

  test("keeps broad COA and nested item quotes in order with a target for every card", async () => {
    const transcription = "Cost summary: Northstar Grant $10,000; Direct Loan $5,500; total $20,000.";
    const grant = {
      ...item,
      raw_label: "Northstar Grant",
      normalized_name: "Northstar Grant",
      category: "gift_aid" as const,
      source_quote: "Northstar Grant $10,000",
      amount: 10_000,
    };
    const loan = {
      ...item,
      raw_label: "Direct Loan",
      normalized_name: "Direct Loan",
      category: "loan" as const,
      source_quote: "Direct Loan $5,500",
      amount: 5_500,
    };
    const { container } = render(
      <LetterWorkspace offer={offerWith(transcription, [grant, loan], transcription)} />,
    );

    expect(container.querySelector(".transcription")?.textContent).toBe(transcription);
    await expectActivationTarget(
      container,
      "Show source for cost of attendance",
      "cost",
      transcription.slice(0, -1),
    );
    await expectActivationTarget(
      container,
      "Show source for Northstar Grant",
      "item-0",
      grant.source_quote,
    );
    await expectActivationTarget(
      container,
      "Show source for Direct Loan",
      "item-1",
      loan.source_quote,
    );
  });

  test("gives duplicate quote ranges distinct activation targets without duplicating text", async () => {
    const transcription = "Shared Award $1,000 appears once.";
    const first = {
      ...item,
      raw_label: "First interpretation",
      normalized_name: "First interpretation",
      source_quote: "Shared Award $1,000",
      amount: 1_000,
    };
    const second = {
      ...first,
      raw_label: "Second interpretation",
      normalized_name: "Second interpretation",
    };
    const { container } = render(
      <LetterWorkspace offer={offerWith(transcription, [first, second])} />,
    );

    expect(container.querySelector(".transcription")?.textContent).toBe(transcription);
    await expectActivationTarget(
      container,
      "Show source for First interpretation",
      "item-0",
      first.source_quote,
    );
    await expectActivationTarget(
      container,
      "Show source for Second interpretation",
      "item-1",
      second.source_quote,
    );
  });

  test("renders partially overlapping ranges once and targets either selected claim", async () => {
    const transcription = "ABCDEFGHIJ";
    const first = {
      ...item,
      raw_label: "First range",
      normalized_name: "First range",
      source_quote: "ABCDE",
      amount: null,
    };
    const second = {
      ...first,
      raw_label: "Second range",
      normalized_name: "Second range",
      source_quote: "DEFGH",
    };
    const { container } = render(
      <LetterWorkspace offer={offerWith(transcription, [first, second])} />,
    );

    expect(container.querySelector(".transcription")?.textContent).toBe(transcription);
    await expectActivationTarget(
      container,
      "Show source for First range",
      "item-0",
      first.source_quote,
    );
    await expectActivationTarget(
      container,
      "Show source for Second range",
      "item-1",
      second.source_quote,
    );
  });
  test("shows cents when the letter states them, and hides them when it does not", () => {
    // This card sits beside the quote it claims, so a stated $15.50 must not read $16.
    const withCents = renderToStaticMarkup(
      <ClaimCard
        item={{ ...item, raw_label: "Hourly rate", amount: 15.5, period: "unknown" }}
        anchor={null}
        active={false}
        onActivate={() => undefined}
      />,
    );
    const whole = renderToStaticMarkup(
      <ClaimCard
        item={{ ...item, raw_label: "Pell Grant", amount: 3_200, period: "year" }}
        anchor={null}
        active={false}
        onActivate={() => undefined}
      />,
    );

    expect(withCents).toContain("$15.50");
    expect(withCents).not.toContain("$16");
    expect(whole).toContain("$3,200");
    expect(whole).not.toContain("$3,200.00");
  });

  test("selects the new letter's first claim when the workspace is reused", () => {
    // Navigating between letters reuses this component instance, so an activeKey seeded
    // only on first render keeps pointing at the previous letter's claim and nothing
    // highlights until the reader clicks.
    const firstLetter = offerWith("Alpha Grant $1,000\nBeta Loan $2,000", [
      { ...item, raw_label: "Alpha Grant", normalized_name: "Alpha Grant",
        category: "gift_aid", source_quote: "Alpha Grant $1,000" },
      { ...item, raw_label: "Beta Loan", normalized_name: "Beta Loan",
        category: "loan", source_quote: "Beta Loan $2,000" },
    ]);
    const secondLetter = {
      ...offerWith("Gamma Grant $3,000", [
        { ...item, raw_label: "Gamma Grant", normalized_name: "Gamma Grant",
          category: "gift_aid", source_quote: "Gamma Grant $3,000" },
      ]),
      id: "second-offer",
    };

    const { container, rerender } = render(<LetterWorkspace offer={firstLetter} />);
    fireEvent.click(screen.getByRole("button", { name: "Show source for Beta Loan" }));
    expect(
      container.querySelector("mark.source-anchor--active")?.getAttribute("data-source-key"),
    ).toBe("item-1");

    rerender(<LetterWorkspace offer={secondLetter} />);

    // The second letter has no item-1; without a reset nothing would be highlighted.
    expect(
      container.querySelector("mark.source-anchor--active")?.getAttribute("data-source-key"),
    ).toBe("item-0");
  });
});
