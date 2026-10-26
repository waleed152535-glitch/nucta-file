import Link from "next/link";
import { cache } from "react";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import CompanySearch from "../../_parts/CompanySearch";
import { chNumber } from "@/lib/ch-api";
import { companyPicture, whenWords, type PublicDeadline } from "@/lib/company-deadlines";
import { lookupReady, publicProfile } from "@/lib/public-lookup";

export const dynamic = "force-dynamic";

/** One lookup per request, shared by the title and the page. */
const lookup = cache((n: string) => publicProfile(n));

const valid = (n: string) => /^[A-Z0-9]{8}$/.test(n);

export async function generateMetadata({ params }: { params: Promise<{ number: string }> }): Promise<Metadata> {
  const n = chNumber(decodeURIComponent((await params).number));
  const r = valid(n) && lookupReady() ? await lookup(n) : null;
  return {
    title: r?.ok ? `${r.value.name}: deadlines` : "Company deadlines",
    // A page per company would only repeat the public register: keep these out of search results.
    robots: { index: false, follow: true },
  };
}

const long = (iso: string) => new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const STATE_WORDS: Record<PublicDeadline["state"], (d: PublicDeadline) => string> = {
  late: (d) => `Overdue, ${whenWords(d.days)}`,
  passed: (d) => `Passed ${whenWords(d.days)}`,
  soon: (d) => whenWords(d.days),
  later: (d) => whenWords(d.days),
};
const PILL: Record<PublicDeadline["state"], string> = { late: "late", passed: "late", soon: "soon", later: "wait" };

function periodWords(p: PublicDeadline["period"]): string | null {
  if (!p) return null;
  return p.from ? `${long(p.from)} to ${long(p.to)}` : `Period ending ${long(p.to)}`;
}

function DateBlock({ iso }: { iso: string }) {
  const [y, m, d] = iso.split("-").map(Number);
  return <time className="dl-date" dateTime={iso}><b>{d} {MONTHS[m - 1]}</b><span>{y}</span></time>;
}

export default async function CompanyDeadlines({ params }: { params: Promise<{ number: string }> }) {
  const n = chNumber(decodeURIComponent((await params).number));
  if (!valid(n)) notFound();
  if (!lookupReady()) {
    return (
      <section className="page-top check">
        <div className="wrap">
          <h1>Company deadlines</h1>
          <p className="intro">The company lookup isn&apos;t switched on on this site yet. <Link href="/sign-up">Create an account</Link> and type the company&apos;s details in instead.</p>
        </div>
      </section>
    );
  }

  const r = await lookup(n);
  if (!r.ok) {
    return (
      <section className="page-top check">
        <div className="wrap">
          <p className="crumb"><Link href="/check">Check another company</Link></p>
          <h1>Company {n}</h1>
          <p className="err" role="alert" style={{ marginTop: 28 }}>{r.error}</p>
          <CompanySearch label="Search again" id="again-q" />
        </div>
      </section>
    );
  }

  const p = r.value;
  const today = new Date().toISOString().slice(0, 10);
  const pic = companyPicture(p, today);
  const first = pic.lead;
  const rest = pic.deadlines.filter((d) => d !== first);
  const signedIn = (await cookies()).get("nf_in")?.value === "1";
  const addHref = `/companies?add=1&number=${encodeURIComponent(p.number)}`;
  const ard = p.ard ? `${p.ard.day} ${MONTHS[p.ard.month - 1]}` : null;
  const status = p.status ? p.status.charAt(0).toUpperCase() + p.status.slice(1).replace(/-/g, " ") : "Unknown";

  return (
    <section className="page-top check co-page">
      <div className="wrap">
        <p className="crumb"><Link href="/check">Check another company</Link></p>
        <h1 className="co-name">{p.name}</h1>
        <dl className="co-facts">
          <div><dt>Company number</dt><dd>{p.number}</dd></div>
          <div><dt>Status</dt><dd className={pic.active ? "on" : "off"}>{status}</dd></div>
          {p.incorporatedOn && <div><dt>Formed</dt><dd>{long(p.incorporatedOn)}</dd></div>}
          {ard && <div><dt>Year end</dt><dd>{ard}</dd></div>}
          {p.registeredOffice && <div className="wide"><dt>Registered office</dt><dd>{p.registeredOffice}</dd></div>}
        </dl>

        {pic.notes.length > 0 && <div className="co-notes">{pic.notes.map((t) => <p key={t}>{t}</p>)}</div>}

        {first && (
          <div className={`dl-next ${first.state}`}>
            <p className="lbl">{first.state === "late" ? "Overdue" : first.state === "passed" ? "Date passed" : "Next deadline"}</p>
            <DateBlock iso={first.date} />
            <div className="what">
              <h2>{first.title}</h2>
              <p>To {first.to}{periodWords(first.period) ? `, for ${periodWords(first.period)}` : ""}.</p>
              {first.note && <p className="small">{first.note}</p>}
              <span className={`pill ${PILL[first.state]}`}>{STATE_WORDS[first.state](first)}</span>
            </div>
          </div>
        )}

        {rest.length > 0 && (
          <ol className="dl-list" aria-label={first ? "The other dates, earliest first" : "Every date, earliest first"}>
            {rest.map((d) => (
              <li key={`${d.kind}-${d.date}-${d.title}`} className={d.state}>
                <DateBlock iso={d.date} />
                <div className="what">
                  <h3>{d.title}</h3>
                  <p>To {d.to}{periodWords(d.period) ? `, for ${periodWords(d.period)}` : ""}.</p>
                  {d.note && <p className="small">{d.note}</p>}
                </div>
                <span className={`pill ${PILL[d.state]}`}>{STATE_WORDS[d.state](d)}</span>
              </li>
            ))}
          </ol>
        )}

        {pic.active && !first && <p className="intro">Companies House have no coming dates for this company.</p>}

        <p className="small co-source">
          From Companies House&apos;s public register, read {new Date(p.fetchedAt).toLocaleString("en-GB", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" })}.
          {pic.corporationTax && " The Corporation Tax dates are worked out from the accounts dates: HMRC's records aren't public, so this page can't show whether a return has been sent. HMRC charge £100 as soon as a return is a day late, and another £100 at three months."}
        </p>

        {pic.active && pic.corporationTax && (
          <div className="co-cta">
            <div>
              <h2>Prepare this return in Nucta File</h2>
              <p>The company&apos;s details and dates come straight from Companies House. Enter the year&apos;s figures and Nucta File works out the tax, prepares the accounts and files the CT600 with HMRC.</p>
            </div>
            <div className="ctas">
              {signedIn ? (
                <Link href={addHref} className="s-btn big" prefetch={false}>Add this company</Link>
              ) : (
                <>
                  <Link href={`/sign-up?company=${encodeURIComponent(p.number)}`} className="s-btn big" prefetch={false}>Create your account</Link>
                  <Link href={addHref} className="s-btn quiet big" prefetch={false}>Sign in and add it</Link>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
