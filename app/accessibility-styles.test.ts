import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const css = readFileSync(new URL("./globals.css", import.meta.url), "utf8");

function token(name: string): string {
  const match = css.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, "i"));
  if (!match) throw new Error(`Missing color token --${name}`);
  return match[1];
}

function relativeLuminance(hex: string): number {
  const channels = hex
    .slice(1)
    .match(/.{2}/g)!
    .map((channel) => Number.parseInt(channel, 16) / 255)
    .map((channel) =>
      channel <= 0.04045
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4,
    );
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(foreground: string, background: string): number {
  const lighter = Math.max(relativeLuminance(foreground), relativeLuminance(background));
  const darker = Math.min(relativeLuminance(foreground), relativeLuminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

function declarationBlock(selector: string): string {
  const selectorStart = css.indexOf(selector);
  if (selectorStart < 0) throw new Error(`Missing selector ${selector}`);
  const openBrace = css.indexOf("{", selectorStart);
  const closeBrace = css.indexOf("}", openBrace);
  return css.slice(openBrace + 1, closeBrace);
}

function pixels(block: string, property: string): number {
  const match = block.match(new RegExp(`${property}:\\s*(\\d+)px`));
  if (!match) throw new Error(`Missing ${property}`);
  return Number(match[1]);
}

describe("essential text and action accessibility", () => {
  test("faint essential text has WCAG AA contrast on raised cards", () => {
    expect(contrastRatio(token("faint"), token("surface-raised"))).toBeGreaterThanOrEqual(4.5);
  });

  test("source metadata is at least 11px", () => {
    expect(pixels(declarationBlock(".claim-card__source"), "font-size")).toBeGreaterThanOrEqual(11);
    expect(pixels(declarationBlock(".source-instruction"), "font-size")).toBeGreaterThanOrEqual(11);
  });

  test("file, sample, and saved-offer actions have practical touch heights", () => {
    expect(pixels(declarationBlock(".primary-button,"), "min-height")).toBeGreaterThanOrEqual(40);
    expect(pixels(declarationBlock(".sample-card"), "min-height")).toBeGreaterThanOrEqual(40);
    expect(
      pixels(declarationBlock(".saved-offer__actions a,"), "min-height"),
    ).toBeGreaterThanOrEqual(40);
  });
});
