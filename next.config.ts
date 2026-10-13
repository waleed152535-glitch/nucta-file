import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  // xlsx is a CommonJS package; keep it external to the server bundle
  serverExternalPackages: ["xlsx", "googleapis", "xml-crypto", "@xmldom/xmldom"],
  experimental: {
    serverActions: {
      // Document reading sends a base64 file; the 1MB default is too small.
      bodySizeLimit: "6mb",
    },
  },
};
export default nextConfig;
