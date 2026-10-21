import type { MetadataRoute } from "next";
import { GUIDES } from "@/lib/guides";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NUCTA_SITE_URL ?? "https://nucta-file.vercel.app";
  const pages = ["", "/features", "/accountants", "/pricing", "/guides", "/about", "/contact", "/terms", "/privacy", "/sign-up", "/sign-in"];
  return [
    ...pages.map((p) => ({ url: `${base}${p}`, changeFrequency: "monthly" as const })),
    ...GUIDES.map((g) => ({ url: `${base}/guides/${g.slug}`, lastModified: g.updated, changeFrequency: "monthly" as const })),
  ];
}
