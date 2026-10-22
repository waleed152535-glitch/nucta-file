/** The approval pack, for the director's approval link: no sign-in, the token is the key. */
import { returnForToken } from "@/lib/approval-core";
import { returnDocumentsFor } from "@/lib/return-docs";
import { approvalPackPdf } from "@/lib/approval-pack";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const r = await returnForToken(token);
  if (!r?.id) return new Response("This approval link isn't valid any more.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  const d = await returnDocumentsFor(r.id, r);
  if (!d.ok) return new Response(d.error ?? "The approval pack can't be built.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  const slug = d.company.name.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return new Response(await approvalPackPdf(d) as BodyInit, {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${slug}-approval-pack-${d.periodTo}.pdf"`, "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" },
  });
}
