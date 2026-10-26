import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import CompanySearch from "../_parts/CompanySearch";
import { asCompanyNumber } from "@/lib/company-deadlines";
import { lookupReady, publicSearch } from "@/lib/public-lookup";

export const dynamic = "force-dynamic";

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ q?: string }> }): Promise<Metadata> {
  const q = ((await searchParams).q ?? "").trim();
  return {
    title: "Check a company's deadlines",
    description: "When a UK company's accounts, Company Tax Return and Corporation Tax are due, from its Companies House record. Free, no account needed.",
    // The checker itself can be found; each search's results are just for the visitor.
    robots: q ? { index: false, follow: true } : undefined,
    alternates: { canonical: "/check" },
  };
}

const STATUS: Record<string, string> = { active: "Active", dissolved: "Dissolved", liquidation: "In liquidation", administration: "In administration", "voluntary-arrangement": "Voluntary arrangement", "converted-closed": "Closed", "insolvency-proceedings": "Insolvency proceedings", receivership: "In receivership", open: "Open", closed: "Closed", registered: "Registered", removed: "Removed" };
const formed = (iso: string | null) => (iso ? new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : null);

export default async function Check({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = ((await searchParams).q ?? "").trim().slice(0, 120);
  const number = q ? asCompanyNumber(q) : null;
  if (number) redirect(`/check/${number}`);
  const ready = lookupReady();
  const r = ready && q.length >= 2 ? await publicSearch(q) : null;

  return (
    <section className="page-top check">
      <div className="wrap">
        <h1>Check a company&apos;s deadlines</h1>
        <p className="intro">Search Companies House by name or number to see when the accounts, the Company Tax Return and the tax are due. Free, and no account needed.</p>
        <CompanySearch q={q} label="Company name or number" id="check-q" autoFocus={!q} />

        {!ready && (
          <div className="not-yet" style={{ marginTop: 40 }}>
            <h2>The lookup isn&apos;t switched on yet</h2>
            <p>Company search needs a connection to Companies House that isn&apos;t set up on this site yet. You can still <Link href="/sign-up">create an account</Link> and type the company&apos;s details in.</p>
          </div>
        )}

        {r && !r.ok && <p className="err" role="alert" style={{ marginTop: 28 }}>{r.error}</p>}

        {r?.ok && (r.value.length === 0 ? (
          <div className="co-none">
            <p><b>Companies House have no company matching &ldquo;{q}&rdquo;.</b></p>
            <p>Try fewer words, or the company number: it&apos;s eight characters, like 15123456 or SC612345, and it&apos;s on every letter from Companies House.</p>
          </div>
        ) : (
          <>
            <h2 className="sr">Companies matching {q}</h2>
            <ul className="co-hits">
              {r.value.map((h) => (
                <li key={h.number}>
                  <Link href={`/check/${h.number}`} prefetch={false}>
                    <span className="nm">{h.name}</span>
                    <span className="meta">
                      <span>{h.number}</span>
                      <span className={h.status === "active" ? "on" : "off"}>{STATUS[h.status] ?? h.status}</span>
                      {formed(h.incorporatedOn) && <span>Formed {formed(h.incorporatedOn)}</span>}
                    </span>
                    {h.address && <span className="addr">{h.address}</span>}
                  </Link>
                </li>
              ))}
            </ul>
            <p className="small" style={{ marginTop: 18 }}>From Companies House&apos;s public register. Showing up to 10 matches; add more of the name, or use the company number, to narrow them down.</p>
          </>
        ))}
      </div>
    </section>
  );
}
