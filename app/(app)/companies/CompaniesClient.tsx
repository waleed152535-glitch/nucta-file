"use client";

import { useState } from "react";
import Link from "next/link";
import type { CompanyRow } from "@/lib/return-actions";
import AddCompany from "./AddCompany";

const STATUS: Record<string, string> = {
  draft: "Draft", "accepted-test": "Passed HMRC test", "rejected-test": "Test rejected", "submitted-test": "Test sent", accepted: "Filed",
};

export default function CompaniesClient({ companies, error, chReady }: { companies: CompanyRow[]; error?: string; chReady: boolean }) {
  const [open, setOpen] = useState(companies.length === 0);

  return (
    <>
      <div className="topbar">
        <div>
          <h2>Companies</h2>
          <div className="sub">Each company&apos;s returns, prepared step by step and filed from here.</div>
        </div>
        <button className="btn" onClick={() => setOpen(true)}>Add a company</button>
      </div>
      <div className="content">
        {error && <div className="banner bad"><span>✕</span><span>{error}</span></div>}

        {open && <AddCompany chReady={chReady} onCancel={companies.length > 0 ? () => setOpen(false) : undefined} />}

        <div className="card">
          <div className="hd"><h3>{companies.length} compan{companies.length === 1 ? "y" : "ies"}</h3></div>
          <div className="bd">
            {companies.length === 0 && <p className="note">No companies yet. Add the first one above.</p>}
            {companies.map((c) => (
              <Link key={c.id} href={`/companies/${c.id}`} className="check" style={{ textDecoration: "none", color: "inherit" }}>
                <span className="mark ok">⌂</span>
                <span style={{ flex: 1 }}>
                  <div className="t">{c.name}</div>
                  <div className="d mono">{c.companyNo} · UTR {c.utr}</div>
                </span>
                <span className="note">
                  {c.latest ? `${STATUS[c.latest.status] ?? c.latest.status} · year to ${c.latest.periodEnd}` : "No returns yet"}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
