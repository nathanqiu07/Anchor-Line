// @vitest-environment jsdom

import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

import { NON_LETTER_MESSAGE, UploadPanel, validateUpload } from "./upload-panel";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  push.mockReset();
});

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

  test("ignores a second drop while extraction is pending", async () => {
    const pendingResponse = new Promise<Response>(() => undefined);
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(() => pendingResponse);
    const { container } = render(createElement(UploadPanel));
    const dropTarget = container.querySelector(".upload-panel");
    expect(dropTarget).not.toBeNull();

    fireEvent.drop(dropTarget!, {
      dataTransfer: {
        files: [new File(["first"], "first.png", { type: "image/png" })],
      },
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    fireEvent.drop(dropTarget!, {
      dataTransfer: {
        files: [new File(["second"], "second.png", { type: "image/png" })],
      },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
