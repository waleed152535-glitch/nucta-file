import { llmsTxt } from "@/lib/public-markdown";

/** llms.txt: a short Markdown map of the site for AI assistants (llmstxt.org). */
export const dynamic = "force-static";

export function GET() {
  return new Response(llmsTxt(), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
