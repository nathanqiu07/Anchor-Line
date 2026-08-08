import { describe, expect, test } from "vitest";

import { installMathSumPrecise, sumPrecise } from "./math-sum-precise";

describe("sumPrecise", () => {
  test("adds ordinary integers", () => {
    expect(sumPrecise([1, 2, 3])).toBe(6);
    expect(sumPrecise([12, 4, 8, 16])).toBe(40);
  });

  test("keeps small terms that naive addition drops next to large ones", () => {
    const values = [1, 1e100, 1, -1e100];
    // Left to right this rounds to 0: 1e100 absorbs both 1s before -1e100 cancels it.
    expect(values.reduce((total, value) => total + value, 0)).toBe(0);
    expect(sumPrecise(values)).toBe(2);
  });

  test("stays exact past the point where doubles lose unit precision", () => {
    // Above 2**53 the gap between doubles is 2, so each naive += 1 rounds away.
    expect(sumPrecise([1e16, 1, 1])).toBe(10_000_000_000_000_002);
    expect([1e16, 1, 1].reduce((total, value) => total + value, 0)).toBe(1e16);
  });

  test("rounds once at the end rather than at every step", () => {
    // 0.1 and 0.2 are already inexact as doubles; their correctly rounded sum is the
    // familiar 0.30000000000000004, so the exact algorithm must agree with a single add.
    expect(sumPrecise([0.1, 0.2])).toBe(0.1 + 0.2);
  });

  test("returns negative zero for an empty iterable", () => {
    expect(Object.is(sumPrecise([]), -0)).toBe(true);
  });

  test("accepts any iterable, not just arrays", () => {
    expect(sumPrecise(new Set([1, 2, 3]))).toBe(6);
  });

  test.each([
    ["a NaN anywhere", [1, NaN, 2]],
    ["infinities of both signs", [Infinity, -Infinity]],
  ])("returns NaN for %s", (_label, values) => {
    expect(sumPrecise(values)).toBeNaN();
  });

  test("propagates a single infinity", () => {
    expect(sumPrecise([1, Infinity, 2])).toBe(Infinity);
    expect(sumPrecise([1, -Infinity, 2])).toBe(-Infinity);
  });

  test("rejects non-Numbers instead of coercing them", () => {
    expect(() => sumPrecise(["1" as unknown as number])).toThrow(TypeError);
    expect(() => sumPrecise([null as unknown as number])).toThrow(TypeError);
  });
});

describe("installMathSumPrecise", () => {
  test("makes Math.sumPrecise callable and does not reinstall over itself", () => {
    installMathSumPrecise();
    expect(typeof Math.sumPrecise).toBe("function");
    // pdf.js calls it with an array of table sizes; that shape must work.
    expect(Math.sumPrecise!([4, 8, 12])).toBe(24);

    // A second call is a no-op, so a runtime that ships its own keeps it.
    expect(installMathSumPrecise()).toBe(false);
  });
});
