import { describe, expect, test } from "vitest";

import { NON_LETTER_MESSAGE, validateUpload } from "./upload-panel";

describe("upload panel helpers", () => {
  test("accepts PNG, JPG, and PDF files up to 10 MB", () => {
    expect(validateUpload(new File(["png"], "letter.png", { type: "image/png" }))).toBeNull();
    expect(validateUpload(new File(["jpg"], "letter.jpg", { type: "image/jpeg" }))).toBeNull();
    expect(validateUpload(new File(["pdf"], "letter.pdf", { type: "application/pdf" }))).toBeNull();
  });

  test("rejects unsupported and oversized files with clear copy", () => {
    expect(validateUpload(new File(["text"], "letter.txt", { type: "text/plain" }))).toBe(
      "Choose a PNG, JPG, or PDF award letter.",
    );
    expect(
      validateUpload(
        new File([new Uint8Array(10 * 1024 * 1024 + 1)], "letter.png", {
          type: "image/png",
        }),
      ),
    ).toBe("Choose a file that is 10 MB or smaller.");
  });

  test("keeps the exact non-letter message", () => {
    expect(NON_LETTER_MESSAGE).toBe("This doesn't look like an award letter");
  });
});
