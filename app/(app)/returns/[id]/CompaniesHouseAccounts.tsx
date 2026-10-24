"use client";

/**
 * The accounts for Companies House, box by box as their online form asks for
 * them, from the same figures HMRC receive with the CT600 — plus the pages
 * that follow the balance sheet, and the Companies House copy to keep.
 */
import { useState } from "react";
import type { CompaniesHouseForm } from "@/lib/accounts/ch-form";
import { addMonths } from "@/lib/tax/dates";

const day = (iso: string) => new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
/** As Companies House want it typed: whole pounds, no commas, a minus sign for a negative. */
const plain = (n: number) => String(Math.round(n));

export default function CompaniesHouseAccounts({ returnId, form }: { returnId: string; form: CompaniesHouseForm }) {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (key: string, v: string) => {
    try { await navigator.clipboard.writeText(v); setCopied(key); setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500); } catch { /* the figure is on screen to type */ }
  };
  const cell = (key: string, v: number | null) => v === null ? <td className="num note">—</td> : (
    <td className="num">
      <button type="button" className={`copyval${copied === key ? " done" : ""}`} onClick={() => copy(key, plain(v))} title="Copy">{copied === key ? "Copied" : plain(v)}</button>
    </td>
  );
  const loans = form.directorsLoans.filter((l) => l.advanced || l.repaid || l.closing);

  return (
    <div className="card" id="companies-house" style={{ padding: "16px 18px", marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
        <h4 style={{ margin: 0, fontFamily: "var(--display)", fontSize: 19, fontWeight: 600 }}>Accounts for Companies House</h4>
        <span className="note">{form.priorTo ? <>Due by <b>{day(addMonths(form.madeUpTo, 9))}</b></> : "First accounts: due 21 months after the company was set up"}</span>
      </div>
      <p className="note" style={{ margin: "6px 0 12px" }}>
        Companies House need the accounts separately from HMRC. On their online service, choose <b>{form.dormant ? "dormant company accounts" : "micro-entity accounts"}</b>{" "}and type in these
        figures — they match the accounts HMRC have. Press a figure to copy it. You&apos;ll need the company&apos;s 6-character Companies House authentication code.
      </p>
      <div style={{ overflowX: "auto" }}>
        <table className="chform">
          <thead><tr><th>Box on Companies House&apos;s form</th><th className="num">{day(form.madeUpTo)}</th>{form.priorTo && <th className="num">{day(form.priorTo)}</th>}</tr></thead>
          <tbody>
            {form.rows.map((r, i) => (
              <tr key={r.label} className={r.total ? "t" : ""}>
                <td>{r.label}</td>{cell(`n${i}`, r.now)}{form.priorTo && cell(`p${i}`, r.then)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h5 style={{ margin: "16px 0 6px", fontSize: 14 }}>The pages after the balance sheet</h5>
      <ul className="chsteps">
        <li><b>Profit and loss account:</b> not needed for a micro-entity. Choose not to include it.</li>
        <li><b>Advances and credits to directors:</b> {loans.length ? loans.map((l) => `${l.name}: £${l.advanced.toLocaleString("en-GB")} advanced, £${l.repaid.toLocaleString("en-GB")} repaid, £${l.closing.toLocaleString("en-GB")} owed at the year end${l.terms ? ` (${l.terms.replace(/\.$/, "")})` : ""}`).join("; ") : "none"}.</li>
        <li><b>Guarantees and other financial commitments:</b> none.</li>
        <li><b>Statements:</b> tick all three — exemption from audit (section 477), the directors&apos; responsibilities, and the micro-entity provisions.</li>
        <li><b>Approval:</b> date <b>{form.approvedOn ? day(form.approvedOn) : "the day the director approves"}</b>, by <b>{form.director || "the director"}</b> — the same as the accounts sent to HMRC.</li>
      </ul>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
        <a className="btn sm" href="https://ewf.companieshouse.gov.uk/" target="_blank" rel="noreferrer">Open Companies House&apos;s online filing</a>
        <a className="btn ghost sm" href={`/returns/${returnId}/documents/accounts-ch.pdf`} target="_blank" rel="noreferrer">Companies House copy (PDF)</a>
      </div>
    </div>
  );
}
