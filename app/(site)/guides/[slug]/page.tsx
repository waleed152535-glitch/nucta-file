import Link from "next/link";
import { notFound } from "next/navigation";
import { GUIDES, guide, relatedTo } from "@/lib/guides";
import { articleGraph, pageMeta } from "@/lib/seo";
import JsonLd from "@/components/JsonLd";

export function generateStaticParams() {
  return GUIDES.map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const g = guide((await params).slug);
  if (!g) return {};
  // The share image comes from opengraph-image.tsx beside this page.
  return pageMeta({ title: g.title, description: g.summary, path: `/guides/${g.slug}`, type: "article", image: null, modified: g.updated, published: g.published });
}

const longDate = (iso: string) => new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

export default async function GuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const g = guide((await params).slug);
  if (!g) notFound();
  const next = relatedTo(g);
  return (
    <article className="read">
      <JsonLd data={articleGraph({ title: g.title, description: g.summary, path: `/guides/${g.slug}`, modified: g.updated, published: g.published, section: "Guides" })} />
      <div className="wrap">
        <p className="crumb"><Link href="/guides">All guides</Link></p>
        <div className="paper">
        <h1>{g.title}</h1>
        <p className="meta">Updated <time dateTime={g.updated}>{longDate(g.updated)}</time></p>
        <p style={{ fontSize: 19 }}>{g.summary}</p>
        {g.sections.map((s) => (
          <section key={s.heading}>
            <h2>{s.heading}</h2>
            {s.paragraphs.map((p, i) => <p key={i}>{p}</p>)}
          </section>
        ))}
        <div className="sources">
          <b>Sources</b>
          <ul>{g.sources.map((s) => <li key={s.url}><a href={s.url} rel="noopener" target="_blank">{s.label}</a></li>)}</ul>
          <p className="small">This guide explains the general rules. It isn&apos;t advice about a particular company. If a situation isn&apos;t straightforward, ask an accountant.</p>
        </div>
        </div>
        {next.length > 0 && (
          <nav className="related" aria-labelledby="related-h">
            <h2 id="related-h">Read next</h2>
            <ul>
              {next.map((r) => <li key={r.slug}><Link href={`/guides/${r.slug}`}><b>{r.title}</b><span>{r.summary}</span></Link></li>)}
            </ul>
          </nav>
        )}
        <p className="after"><Link href="/sign-up" className="s-btn big">Prepare a return with Nucta Filings</Link></p>
      </div>
    </article>
  );
}
