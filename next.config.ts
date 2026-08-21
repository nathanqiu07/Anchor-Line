import type { NextConfig } from "next";

/**
 * Next.js sets none of these by default. This app renders a student's own award letter, so
 * the two that matter most are the framing controls: without them any site can iframe the
 * analysis and present it as its own reading of the letter.
 *
 * The policy has to stay wide enough for what the app actually does. An uploaded PDF is
 * previewed through `URL.createObjectURL` in an iframe (`components/letter-workspace.tsx`),
 * which needs `frame-src blob:`, and the bundled sample originals are PNGs, which need
 * `img-src data: blob:`. Script and style stay `'unsafe-inline'` because the App Router
 * emits inline bootstrap script and inline style without a nonce; tightening that means
 * adopting nonces in middleware, not editing this list.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "frame-src 'self' blob:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
