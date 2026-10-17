"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { addCompany, type CompanyRow } from "@/lib/return-actions";

const STATUS: Record<string, string> = {
  draft: "Draft", "accepted-test": "Passed HMRC test", "rejected-test": "Test rejected", "submitted-test": "Test sent", accepted: "Filed",
};

export default function CompaniesClient({ companies, error }: { companies: CompanyRow[]; error?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(companies.length === 0);
  const [f, setF] = useState({ name: "", companyNo: "", utr: "", incorporatedOn: "" });
  const [problems, setProblems] = useState<string[]>([]);
  const [pending, start] = useTransition();

  const add = () => start(async () => {
    const r = await addCompany(f);
    if (r.ok && r.id) router.push(`/companies/${r.id}`);
    else setProblems(r.problems);
  });

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

        {open && (
          <div className="card">
            <div className="hd"><h3>Add a company</h3></div>
            <div className="bd">
              <div className="row2">
                <div className="field"><label>Company name <span className="hint">as at Companies House</span></label>
                  <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
                <div className="field"><label>Company number</label>
                  <input className="mono" value={f.companyNo} onChange={(e) => setF({ ...f, companyNo: e.target.value })} placeholder="e.g. 15123456 or SC123456" /></div>
              </div>
              <div className="row2">
                <div className="field"><label>Corporation Tax UTR <span className="hint">10 digits, from HMRC&apos;s letters to the company</span></label>
                  <input className="mono" value={f.utr} onChange={(e) => setF({ ...f, utr: e.target.value })} /></div>
                <div className="field"><label>Incorporated on <span className="hint">optional</span></label>
                  <input type="date" value={f.incorporatedOn} onChange={(e) => setF({ ...f, incorporatedOn: e.target.value })} /></div>
              </div>
              {problems.length > 0 && <div className="banner bad"><span>✕</span><span><ul style={{ margin: 0, paddingLeft: 18 }}>{problems.map((p, i) => <li key={i}>{p}</li>)}</ul></span></div>}
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn" disabled={pending} onClick={add}>{pending ? "Adding…" : "Add the company"}</button>
                {companies.length > 0 && <button className="btn ghost" onClick={() => setOpen(false)}>Cancel</button>}
              </div>
            </div>
          </div>
        )}

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
