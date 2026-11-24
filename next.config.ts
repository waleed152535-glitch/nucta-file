import type { NextConfig } from "next";

/**
 * Security headers on every response: no framing by other sites, no MIME
 * sniffing, HTTPS only, a strict referrer, and no access to the camera,
 * microphone or location. Framing by the site itself stays allowed for the
 * documents previewed on the review step.
 */
const SECURITY_HEADERS = [
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'self'; base-uri 'self'; object-src 'none';" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // xlsx is a CommonJS package; keep it external to the server bundle
  serverExternalPackages: ["xlsx", "xml-crypto", "@xmldom/xmldom"],
  experimental: {
    serverActions: {
      // Document reading sends a base64 file; the 1MB default is too small.
      bodySizeLimit: "6mb",
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};
export default nextConfig;
