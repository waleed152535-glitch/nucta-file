import Link from "next/link";
import { GUIDES } from "@/lib/guides";

export const metadata = { title: "Guides", description: "Plain-English guides to Company Tax Returns, accounts and deadlines for small UK companies." };

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
