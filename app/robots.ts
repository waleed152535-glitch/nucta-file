import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = process.env.NUCTA_SITE_URL ?? "https://nucta-file.vercel.app";
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/dashboard", "/companies", "/returns", "/account", "/gateway", "/companies-house", "/log", "/settings", "/status"] },
    sitemap: `${base}/sitemap.xml`,
  };
}
