import Link from "next/link";
import TaxEngine from "../_parts/TaxEngine";
import JsonLd from "@/components/JsonLd";
import { CALCULATOR as C } from "@/lib/calculator-content";
import { guide } from "@/lib/guides";
import { calculatorGraph, pageMeta } from "@/lib/seo";

// The share image comes from opengraph-image.tsx beside this page.
export const metadata = pageMeta({ title: C.metaTitle, description: C.description, path: C.path, image: null });

export default function CorporationTaxCalculator() {
  const next = C.related.map((s) => guide(s)).filter((g) => g !== undefined);
  return (
    <>
      <JsonLd data={calculatorGraph({ title: C.title, description: C.description, path: C.path })} />
      <section className="page-top calc-top">
        <div className="wrap">
          <h1>{C.title}</h1>
          <p className="intro">{C.intro}</p>
          <TaxEngine chooseEnd />
        </div>
      </section>

      <section className="s-sec tight calc-how" aria-labelledby="how-h">
        <div className="wrap">
          <h2 id="how-h">How it&apos;s worked out</h2>
          <div className="calc-cols">
            {C.how.map((s) => (
              <div key={s.heading}>
                <h3>{s.heading}</h3>
                {s.paragraphs.map((p, i) => <p key={i}>{p}</p>)}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="s-sec tight alt" aria-labelledby="faq-h">
        <div className="wrap">
          <h2 id="faq-h">Questions people ask</h2>
          <div className="faq">
            {C.faq.map((f) => (
              <details key={f.q}>
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="s-sec tight" aria-labelledby="next-h">
        <div className="wrap">
          <h2 id="next-h">From the tax to the return</h2>
          <p className="intro">Nucta Filings uses this same calculation to prepare the company&apos;s accounts, the computation and the CT600, and files them with HMRC.</p>
          <p className="calc-cta"><Link href="/sign-up" className="s-btn big">Prepare a return with Nucta Filings</Link></p>
          <ul className="guide-list">
            {next.map((g) => (
              <li key={g.slug}><Link href={`/guides/${g.slug}`}><h3>{g.title}</h3><p>{g.summary}</p></Link></li>
            ))}
          </ul>
        </div>
      </section>
    </>
  );
}
