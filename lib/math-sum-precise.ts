declare global {
  interface Math {
    sumPrecise?(values: Iterable<number>): number;
  }
}

/**
 * Exact summation of doubles, correctly rounded once at the end.
 *
 * This is Shewchuk's algorithm as used by CPython's `math.fsum`: it keeps a list of
 * non-overlapping partial sums whose exact total equals the exact total of the inputs, so
 * no intermediate rounding is ever lost. Naive left-to-right addition drops small terms
 * next to large ones — `[1, 1e100, 1, -1e100]` sums to 0 that way, when the answer is 2.
 */
function exactSum(values: readonly number[]): number {
  const partials: number[] = [];

  for (const value of values) {
    let x = value;
    let index = 0;
    for (const partial of partials) {
      let y = partial;
      if (Math.abs(x) < Math.abs(y)) {
        const swap = x;
        x = y;
        y = swap;
      }
      // hi carries the rounded sum, lo the exact error term that rounding discarded.
      const hi = x + y;
      const lo = y - (hi - x);
      if (lo !== 0) partials[index++] = lo;
      x = hi;
    }
    partials.length = index;
    partials.push(x);
  }

  if (partials.length === 0) return -0;

  // Add from the smallest magnitude upward so the single final rounding sees every term.
  let index = partials.length - 1;
  let hi = partials[index];
  let lo = 0;
  for (index -= 1; index >= 0; index -= 1) {
    const x = hi;
    const y = partials[index];
    hi = x + y;
    lo = y - (hi - x);
    if (lo !== 0) break;
  }

  /*
   * Round-half-to-even correction. When the discarded remainder is exactly half a unit in
   * the last place, the tie must break toward even, and that depends on whether the terms
   * below it push the true value past the midpoint. Doubling lo and re-adding detects
   * whether that shove changes the result.
   */
  if (
    index > 0 &&
    ((lo < 0 && partials[index - 1] < 0) || (lo > 0 && partials[index - 1] > 0))
  ) {
    const y = lo * 2;
    const x = hi + y;
    if (y === x - hi) hi = x;
  }

  return hi;
}

/**
 * `Math.sumPrecise` per the TC39 proposal: the exactly-rounded sum of an iterable of
 * Numbers. Rejects non-Numbers rather than coercing, and returns -0 for an empty
 * iterable, both of which the proposal specifies.
 */
export function sumPrecise(values: Iterable<number>): number {
  const collected: number[] = [];
  let sawNaN = false;
  let sawPositiveInfinity = false;
  let sawNegativeInfinity = false;

  for (const value of values) {
    if (typeof value !== "number") {
      throw new TypeError("Math.sumPrecise accepts only Numbers");
    }
    if (Number.isNaN(value)) sawNaN = true;
    else if (value === Infinity) sawPositiveInfinity = true;
    else if (value === -Infinity) sawNegativeInfinity = true;
    else collected.push(value);
  }

  // Infinities of both signs cancel to no meaningful value, as does any NaN present.
  if (sawNaN || (sawPositiveInfinity && sawNegativeInfinity)) return NaN;
  if (sawPositiveInfinity) return Infinity;
  if (sawNegativeInfinity) return -Infinity;

  return exactSum(collected);
}

/**
 * Installs the polyfill when the runtime lacks it, and returns whether it did.
 *
 * Node 24 does not ship `Math.sumPrecise`, but the pdf.js build bundled in `unpdf` calls
 * it while measuring TrueType glyph and cmap tables. Without it that arithmetic throws,
 * pdf.js swallows the error into a warning, and the affected font work is silently
 * skipped — so this is installed before any PDF is read rather than left to chance.
 */
export function installMathSumPrecise(): boolean {
  if (typeof Math.sumPrecise === "function") return false;
  Object.defineProperty(Math, "sumPrecise", {
    value: sumPrecise,
    writable: true,
    enumerable: false,
    configurable: true,
  });
  return true;
}
