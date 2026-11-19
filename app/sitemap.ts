import type { MetadataRoute } from "next";
import { absolute } from "@/lib/site";
import { publicPages } from "@/lib/public-markdown";

/** sitemap.xml: the public pages, with the date each guide last changed. */
export default function sitemap(): MetadataRoute.Sitemap {
  return publicPages().map((p) => ({ url: absolute(p.path), ...(p.modified ? { lastModified: p.modified } : {}) }));
}
