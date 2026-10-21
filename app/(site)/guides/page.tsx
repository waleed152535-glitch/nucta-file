import Link from "next/link";
import { GUIDES } from "@/lib/guides";

export const metadata = { title: "Guides", description: "Plain-English guides to Company Tax Returns, accounts and deadlines for small UK companies." };

export default function Guides() {
  return (
    <section className="read">
      <div className="wrap">
        <h1>Guides</h1>
        <p className="meta">The rules small companies ask about most, in plain words, with the sources.</p>
        <ul className="guide-list">
          {GUIDES.map((g) => (
            <li key={g.slug}><Link href={`/guides/${g.slug}`}>{g.title}</Link><p>{g.summary}</p></li>
          ))}
        </ul>
      </div>
    </section>
  );
}
