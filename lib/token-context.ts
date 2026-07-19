const negationTokens = new Set(["no", "not", "never", "without"]);
const awardStatusStems = ["offer", "award", "grant", "approv", "eligib"];
const dueTokens = new Set(["due", "owed", "overdue"]);
const repaymentTokens = new Set([
  "repay",
  "repays",
  "repaid",
  "repaying",
  "repayment",
  "repayments",
]);

/** Produces stable lowercase word tokens while discarding punctuation and spacing. */
export function wordTokens(value: string): string[] {
  return value.toLowerCase().match(/[a-z0-9+]+/g) ?? [];
}

/** Keeps sentence-like clauses separate so context does not leak across claims. */
export function clauseTokens(value: string): string[][] {
  return value
    .split(/(?:\r?\n|[;.!?]+)/)
    .map(wordTokens)
    .filter((tokens) => tokens.length > 0);
}

export function hasTokenSequence(tokens: string[], sequence: string[]): boolean {
  if (sequence.length === 0 || sequence.length > tokens.length) return false;

  return tokens.some((_, start) =>
    sequence.every((token, offset) => tokens[start + offset] === token),
  );
}

export function hasAnyToken(tokens: string[], candidates: Set<string>): boolean {
  return tokens.some((token) => candidates.has(token));
}

export function hasTokenStem(tokens: string[], stems: readonly string[]): boolean {
  return tokens.some((token) => stems.some((stem) => token.startsWith(stem)));
}

/** Detects a negation anywhere before an award-status word in one clause. */
export function hasNegatedAwardStatus(tokens: string[]): boolean {
  let sawNegation = false;
  for (const token of tokens) {
    if (negationTokens.has(token)) sawNegation = true;
    if (
      sawNegation &&
      awardStatusStems.some((stem) => token.startsWith(stem))
    ) {
      return true;
    }
  }
  return false;
}

export function hasRepaymentLanguage(tokens: string[]): boolean {
  return hasAnyToken(tokens, repaymentTokens);
}

/** Recognizes an actual balance/repayment obligation, not generic repayment prose. */
export function hasDueBalanceOrRepayment(tokens: string[]): boolean {
  const subjectIndexes = tokens.flatMap((token, index) =>
    token === "balance" ||
    token === "balances" ||
    repaymentTokens.has(token)
      ? [index]
      : [],
  );
  if (subjectIndexes.length === 0) return false;

  return tokens.some((token, dueIndex) => {
    if (!dueTokens.has(token)) return false;

    const subjectIndex = subjectIndexes.reduce((closest, candidate) =>
      Math.abs(candidate - dueIndex) < Math.abs(closest - dueIndex)
        ? candidate
        : closest,
    );
    const phraseStart = Math.max(0, Math.min(subjectIndex, dueIndex) - 3);
    const phraseEnd = Math.max(subjectIndex, dueIndex) + 1;
    return !hasAnyToken(tokens.slice(phraseStart, phraseEnd), negationTokens);
  });
}
