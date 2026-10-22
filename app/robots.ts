import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = process.env.NUCTA_SITE_URL ?? "https://nucta-file.vercel.app";
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/dashboard", "/companies", "/returns", "/account", "/gateway", "/live-filing", "/companies-house", "/log", "/settings", "/status", "/approve", "/join", "/deadlines", "/calendar.ics"] },
    sitemap: `${base}/sitemap.xml`,
  };
}
