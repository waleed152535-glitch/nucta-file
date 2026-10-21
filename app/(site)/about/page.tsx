import Link from "next/link";
import { SITE } from "@/lib/site";

export const metadata = { title: "About", description: "Who makes Nucta File, and why." };

export default function About() {
  return (
    <section className="read">
      <div className="wrap">
        <h1>About Nucta File</h1>
        <p style={{ fontSize: 19 }}>Nucta File is made by {SITE.company}, a UK company formation and compliance business that looks after small companies — many of them run by directors who live outside the UK.</p>
        <h2>Why we built it</h2>
        <p>When HMRC closed their free filing service on 31 March 2026, every company needed software to file its Company Tax Return. We needed it for our own clients, and wanted it to do the work an accountant would — the computation, the allowances, the director&apos;s loans, the awkward first year — rather than ask for the answers.</p>
        <h2>Where it stands</h2>
        <p>Nucta File is registered with HMRC as a software developer (vendor {SITE.vendorId}). Its returns pass HMRC&apos;s test service, and we&apos;ve applied for recognition, which is what allows live filing. Filing accounts with Companies House is built and waiting for their test approval.</p>
        <h2>How we work</h2>
        <p>Every rule Nucta File applies is written down with where it comes from, and every return is checked against HMRC&apos;s own schema and business rules before it&apos;s sent. Where a company is outside what Nucta File handles, it says so.</p>
        <p style={{ marginTop: 28 }}><Link href="/contact">Get in touch</Link></p>
      </div>
    </section>
  );
}
