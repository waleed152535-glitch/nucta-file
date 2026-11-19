import { pageMeta } from "@/lib/seo";
import Link from "next/link";
import { GUIDES } from "@/lib/guides";

export const metadata = pageMeta({ title: "Guides to Company Tax Returns and accounts", path: "/guides", description: "Plain-English guides for small UK companies: CT600 deadlines and penalties, micro-entity accounts, dormant companies, director's loans and the 2028 Companies House changes." });

export default function Guides() {
  return (
    <section className="page-top" style={{ paddingBottom: 120 }}>
      <div className="wrap">
        <h1>Guides</h1>
        <p className="intro">The rules small companies ask about most, in plain words, with the sources.</p>
        <ul className="guide-list">
          {GUIDES.map((g) => (
            <li key={g.slug}><Link href={`/guides/${g.slug}`}><h3>{g.title}</h3><p>{g.summary}</p></Link></li>
          ))}
        </ul>
      </div>
    </section>
  );
}
