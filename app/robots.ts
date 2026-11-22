import type { MetadataRoute } from "next";
import { absolute } from "@/lib/site";

/**
 * robots.txt. Everyone may read the public site, AI assistants included; the
 * software's own pages are private (they also say noindex) and /md/ is only
 * the internal address of the Markdown copies, which are read at /…/x.md.
 */
const PRIVATE = ["/dashboard", "/companies", "/returns", "/account", "/gateway", "/live-filing", "/payments", "/companies-house", "/log", "/settings", "/status", "/deadlines", "/calendar.ics", "/verify-email", "/confirm-email", "/approve", "/join", "/api/", "/md/"];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: PRIVATE },
    sitemap: absolute("/sitemap.xml"),
  };
}
