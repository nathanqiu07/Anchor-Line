import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { extractPdfText } from "./pdf-text";

/**
 * A synthetic award letter printed to PDF from HTML, so it carries a real text layer.
 * Tier one exists only because that layer arrives newline-separated; a dependency upgrade
 * that space-joins it instead would silently push every PDF back to the vision pass.
 */
const digitalLetter = join(process.cwd(), "lib", "fixtures", "digital-letter.pdf");

async function fixtureBytes(): Promise<Uint8Array> {
  return new Uint8Array(await readFile(digitalLetter));
}

describe("extractPdfText", () => {
  test("returns the text layer of a digital pdf", async () => {
    const text = await extractPdfText(await fixtureBytes());

    expect(text).not.toBeNull();
    expect(text).toContain("THORNFIELD STATE UNIVERSITY");
    expect(text).toContain("Federal Pell Grant");
  });

  test("preserves one aid claim per line", async () => {
    const text = (await extractPdfText(await fixtureBytes()))!;
    const lines = text.split("\n");

    expect(lines.length).toBeGreaterThan(20);
    expect(lines).toContain("Federal Direct Subsidized Stafford Loan ......... $3,500 per year");
  });

  test("emits no blank or untrimmed lines", async () => {
    const lines = (await extractPdfText(await fixtureBytes()))!.split("\n");

    expect(lines.every((line) => line === line.trim())).toBe(true);
    expect(lines.every((line) => line.length > 0)).toBe(true);
  });

  test("leaves the caller's bytes intact for the vision fallback", async () => {
    const bytes = await fixtureBytes();
    const originalLength = bytes.byteLength;
    await extractPdfText(bytes);

    expect(bytes.byteLength).toBe(originalLength);
    expect(bytes.slice(0, 5)).toEqual(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]));
  });

  test("returns null for bytes that are not a pdf", async () => {
    await expect(extractPdfText(new Uint8Array([1, 2, 3, 4]))).resolves.toBeNull();
  });

  test("returns null for an empty buffer", async () => {
    await expect(extractPdfText(new Uint8Array())).resolves.toBeNull();
  });
});
