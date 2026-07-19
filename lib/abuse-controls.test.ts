import { describe, expect, test } from "vitest";

import { clientIpKey } from "./abuse-controls";

describe("client IP identity", () => {
  test("prefers one validated Vercel-forwarded IP over spoofable fallbacks", () => {
    const headers = new Headers({
      "x-vercel-forwarded-for": "203.0.113.9",
      "x-forwarded-for": "198.51.100.10",
      "x-real-ip": "198.51.100.11",
    });

    expect(clientIpKey(headers)).toBe("203.0.113.9");
  });

  test.each([
    "203.0.113.9, 198.51.100.10",
    "not-an-ip",
    "",
  ])("does not fall back when the Vercel boundary header is invalid", (value) => {
    const headers = new Headers({
      "x-vercel-forwarded-for": value,
      "x-forwarded-for": "198.51.100.10",
    });

    expect(clientIpKey(headers)).toBe("unknown");
  });

  test("uses a validated local/test fallback only when Vercel header is absent", () => {
    expect(
      clientIpKey(
        new Headers({ "x-forwarded-for": "198.51.100.20, 198.51.100.21" }),
      ),
    ).toBe("198.51.100.20");
    expect(clientIpKey(new Headers({ "x-real-ip": "2001:db8::1" }))).toBe(
      "2001:db8::1",
    );
    expect(clientIpKey(new Headers({ "x-real-ip": "not-an-ip" }))).toBe(
      "unknown",
    );
  });
});
