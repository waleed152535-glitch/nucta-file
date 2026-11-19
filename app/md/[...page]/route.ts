import { markdownFor, markdownPages } from "@/lib/public-markdown";

/**
 * Markdown copies of the pages that are mostly words, asked for as
 * /guides/<slug>.md and so on (middleware.ts sends them here). Each points
 * search engines at the page it copies, so the two aren't treated as rivals;
 * the Markdown sitemap is for reading, not for search results.
 */
export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return markdownPages().map((p) => ({ page: p.split("/") }));
}

export async function GET(_req: Request, { params }: { params: Promise<{ page: string[] }> }) {
  const found = markdownFor((await params).page.join("/"));
  if (!found) return new Response("Not found\n", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  const headers: Record<string, string> = { "Content-Type": "text/markdown; charset=utf-8" };
  if (found.canonical) headers.Link = `<${found.canonical}>; rel="canonical"`;
  else headers["X-Robots-Tag"] = "noindex";
  return new Response(found.body, { headers });
}
