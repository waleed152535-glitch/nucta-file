"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CompanyRow } from "@/lib/return-actions";
import AddCompany from "./AddCompany";
import ImportCompanies from "./ImportCompanies";

const STATUS: Record<string, [string, string]> = {
  draft: ["Not filed yet", "draft"], "accepted-test": ["Ready to file", "live"], "rejected-test": ["Test found a problem", "bad"], "submitted-test": ["Being checked", "warn"],
  "partly-sent-test": ["One of two checked", "warn"], accepted: ["Filed with HMRC", "ok"], "submitted-live": ["Waiting for HMRC", "warn"], "partly-filed": ["One of two filed", "warn"],
};
const short = (iso: string) => new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

export default function CompaniesClient({ companies, error, chReady, startAdding = false }: { companies: CompanyRow[]; error?: string; chReady: boolean; startAdding?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(companies.length === 0 || startAdding);
  const [importing, setImporting] = useState(false);
  const [q, setQ] = useState("");
  const [only, setOnly] = useState<"all" | "none" | "draft" | "filed">("all");
  const rows = companies.filter((c) =>
    (!q.trim() || `${c.name} ${c.companyNo ?? ""} ${c.utr ?? ""}`.toLowerCase().includes(q.trim().toLowerCase()))
    && (only === "all" || (only === "none" ? !c.latest : only === "filed" ? c.latest?.status === "accepted" : Boolean(c.latest && c.latest.status !== "accepted"))));

  return (
    <>
      <div className="topbar">
        <div>
          <h2>Companies</h2>
          <div className="sub">Each company&apos;s returns, prepared step by step and filed from here.</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <a className="btn ghost" href="/companies/export">Download as a spreadsheet</a>
          <button className="btn ghost" onClick={() => { setImporting(true); setOpen(false); }}>Import a list</button>
          <button className="btn" onClick={() => { setOpen(true); setImporting(false); }}>Add a company</button>
        </div>
      </div>
      <div className="content">
        {error && <div className="banner bad"><span>✕</span><span>{error}</span></div>}

        {importing && <ImportCompanies chReady={chReady} onClose={() => setImporting(false)} />}
        {open && !importing && <AddCompany chReady={chReady} onCancel={companies.length > 0 ? () => setOpen(false) : undefined} />}
        {open && !importing && companies.length === 0 && <p className="note" style={{ marginTop: -6, marginBottom: 16 }}>Bringing many clients across? <button type="button" className="btn ghost sm" onClick={() => setImporting(true)}>Import a list instead</button></p>}

        <div className="card">
          <div className="hd">
            <h3>{companies.length} compan{companies.length === 1 ? "y" : "ies"}</h3>
            <div className="searchrow">
              <div className="chips" style={{ margin: 0 }}>
                {([["all", "All"], ["draft", "Return in progress"], ["filed", "Filed"], ["none", "No returns yet"]] as const).map(([k, l]) => (
                  <button key={k} type="button" className={`chip ${only === k ? "on" : ""}`} onClick={() => setOnly(k)}>{l}</button>
                ))}
              </div>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by name, number or UTR" aria-label="Filter companies" style={{ maxWidth: 260 }} />
            </div>
          </div>
          {companies.length === 0 ? <div className="bd"><p className="note">No companies yet. Add the first one above.</p></div> : (
            <table className="ctable">
              <thead><tr><th>Company</th><th className="hide-m">UTR</th><th className="hide-m num">Returns</th><th>Latest return</th><th className="num">Year end</th></tr></thead>
              <tbody>
                {rows.map((c) => {
                  const st = c.latest ? STATUS[c.latest.status] ?? [c.latest.status, "draft"] : null;
                  return (
                    <tr key={c.id} onClick={() => router.push(`/companies/${c.id}`)}>
                      <td><Link href={`/companies/${c.id}`} className="co" style={{ color: "var(--text)" }}>{c.name}<small>{c.companyNo}</small></Link></td>
                      <td className="hide-m" style={{ fontVariantNumeric: "tabular-nums" }}>{c.utr}</td>
                      <td className="hide-m num">{c.returns}</td>
                      <td>{st ? <span className={`pill ${st[1]}`}>{st[0]}</span> : <span className="note">None yet</span>}</td>
                      <td className="num">{c.latest ? short(c.latest.periodEnd) : ""}</td>
                    </tr>
                  );
                })}
                {!rows.length && <tr><td colSpan={5} className="note">No company matches.</td></tr>}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
