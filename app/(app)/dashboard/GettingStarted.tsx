"use client";

/**
 * The getting-started guide on the dashboard: the five things a new account
 * does once, in order, each ticked off as it happens and each with a button
 * to the place it's done. It stays until everything is done or it's hidden,
 * and can be brought back from the Help page.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import type { GettingStarted as Progress } from "@/lib/return-actions";

const HIDE_KEY = "nf_getting_started_hidden";

export default function GettingStarted({ p, practice, onAddCompany }: { p: Progress; practice: boolean; onAddCompany: () => void }) {
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    try { setHidden(localStorage.getItem(HIDE_KEY) === "1"); } catch { setHidden(false); }
  }, []);
  const ret = p.latestReturnId ? `/returns/${p.latestReturnId}` : null;
  const steps: { done: boolean; title: string; why: string; action: React.ReactNode }[] = [
    {
      done: p.companies > 0,
      title: practice ? "Add a client company" : "Add your company",
      why: "Search Companies House by name or number. Add the Corporation Tax UTR from HMRC's letters too, if you have it.",
      action: <button type="button" className="btn sm" onClick={onAddCompany}>Add a company</button>,
    },
    {
      done: p.returns > 0,
      title: "Start the return",
      why: "Open the company and press Start a return. Nucta Filings suggests the dates from the company's accounts dates.",
      action: p.latestCompanyId ? <Link className="btn sm" href={`/companies/${p.latestCompanyId}`}>Open the company</Link> : null,
    },
    {
      done: p.approved > 0,
      title: "Enter the figures and get the director's approval",
      why: "Nine short steps, from the bookkeeping or a trial balance. The director approves online from a link, or signs the approval pack.",
      action: ret ? <Link className="btn sm" href={ret}>Continue the return</Link> : null,
    },
    {
      done: p.filedHmrc > 0,
      title: "File the CT600 with HMRC",
      why: "On the last step, with the company's HMRC sign-in (or yours as an agent). The sign-in is used once and never stored.",
      action: ret ? <Link className="btn sm" href={`${ret}?step=file`}>Go to filing</Link> : null,
    },
    {
      done: p.filedCh > 0,
      title: "File the accounts with Companies House",
      why: "From the same screen, with the company's 6-character Companies House authentication code. Accounts can go before or after the CT600.",
      action: ret ? <Link className="btn sm" href={`${ret}?step=file`}>Go to filing</Link> : null,
    },
  ];
  const done = steps.filter((x) => x.done).length;
  if (hidden || done === steps.length) return null;
  const next = steps.findIndex((x) => !x.done);
  const hide = () => { try { localStorage.setItem(HIDE_KEY, "1"); } catch { /* hidden for this visit */ } setHidden(true); };

  return (
    <div className="card getting-started" aria-labelledby="gs-h">
      <div className="hd">
        <h3 id="gs-h">Getting started</h3>
        <span className="note">{done} of {steps.length} done · <Link href="/help">How Nucta Filings works</Link> · <button type="button" className="linkish" onClick={hide}>Hide this</button></span>
      </div>
      <div className="bd">
        <div className="gs-bar" aria-hidden><span style={{ width: `${(done / steps.length) * 100}%` }} /></div>
        <ol className="gs-steps">
          {steps.map((x, i) => (
            <li key={x.title} className={x.done ? "done" : i === next ? "next" : ""}>
              <span className="gs-mark" aria-label={x.done ? "Done" : i === next ? "Next" : "To do"}>{x.done ? "✓" : i + 1}</span>
              <span className="gs-text"><b>{x.title}</b>{!x.done && <span>{x.why}</span>}</span>
              {i === next && x.action && <span className="gs-act">{x.action}</span>}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
