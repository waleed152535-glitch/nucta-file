import Link from "next/link";
import { notFound } from "next/navigation";
import { GUIDES, guide } from "@/lib/guides";

export function generateStaticParams() {
  return GUIDES.map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const g = guide((await params).slug);
  return g ? { title: g.title, description: g.summary } : {};
}

export default async function GuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const g = guide((await params).slug);
  if (!g) notFound();
  const updated = new Date(g.updated + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  return (
    <article className="read">
      <div className="wrap">
        <p className="crumb"><Link href="/guides">All guides</Link></p>
        <div className="paper">
        <h1>{g.title}</h1>
        <p className="meta">Updated {updated}</p>
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
        <p className="after"><Link href="/sign-up" className="s-btn big">Prepare a return with Nucta File</Link></p>
      </div>
    </article>
  );
}
