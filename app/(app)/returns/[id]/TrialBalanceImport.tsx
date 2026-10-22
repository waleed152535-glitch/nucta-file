"use client";

/**
 * Fills the profit and loss and the balance sheet from a trial balance
 * exported from Xero, QuickBooks, FreeAgent, Sage or similar. Each account's
 * match can be changed before anything is filled in.
 */
import { useMemo, useState } from "react";
import { PL_KEYS, TARGETS, readTrialBalance, totals, type BsKey, type PlKey, type Target, type TbMatch } from "@/lib/trial-balance";

const gbp = (n: number) => `£${Math.round(n).toLocaleString("en-GB")}`;
const GROUPS = ["Profit and loss", "Balance sheet", "Leave out"] as const;
const WHY: Record<TbMatch["why"], string> = { name: "by name", type: "by account type", code: "by code", guess: "a guess: check it" };

export default function TrialBalanceImport({ onApply, onClose }: { onApply: (pl: Record<PlKey, number>, bs: Partial<Record<BsKey, number>>) => void; onClose: () => void }) {
  const [rows, setRows] = useState<TbMatch[] | null>(null);
  const [check, setCheck] = useState<{ debits: number; credits: number } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [paste, setPaste] = useState("");
  const read = (text: string) => {
    const r = readTrialBalance(text);
    if (!r.ok) { setProblem(r.problem ?? "Couldn't read it."); setRows(null); return; }
    setProblem(null); setRows(r.rows); setCheck({ debits: r.debits, credits: r.credits });
  };
  const t = useMemo(() => (rows ? totals(rows) : null), [rows]);
  const profit = t ? t.turnover + t.otherIncome + t.interestReceived - t.costOfSales - t.staffCosts - t.depreciation - t.otherCharges : 0;
  const guessed = rows?.filter((r) => r.why === "guess").length ?? 0;
  const apply = () => {
    if (!t) return;
    const pl = Object.fromEntries(PL_KEYS.map((k) => [k, t[k]])) as Record<PlKey, number>;
    const bs: Partial<Record<BsKey, number>> = {
      fixedAssets: t.fixedAssets, stock: t.stock, debtors: t.debtors, cash: t.cash, prepayments: t.prepayments, creditorsWithin: t.creditorsWithin,
      owedToDirectors: Math.max(0, t.owedToDirectors), creditorsAfter: t.creditorsAfter, provisions: t.provisions, shareCapital: t.shareCapital,
      reservesBroughtForward: t.reservesBroughtForward, dividendsPaid: t.dividendsPaid,
      ...(t.corporationTaxOwed ? { corporationTaxOwed: t.corporationTaxOwed } : {}),
    };
    onApply(pl, bs);
  };

  return (
    <div className="card">
      <div className="hd"><h3>Import a trial balance</h3><button type="button" className="btn ghost sm" onClick={onClose}>Close</button></div>
      <div className="bd">
        {!rows && (
          <>
            <p className="note" style={{ marginTop: 0 }}>Export the trial balance for the year end from your bookkeeping software as a CSV file: in Xero, Reports then Trial Balance then Export; in QuickBooks, Reports then Trial Balance then Export to CSV; in FreeAgent, Accounting then Trial Balance; in Sage, Reports then Trial Balance. Each account is matched to a figure here, and you can change any match before anything is filled in.</p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
              <label className="btn" style={{ cursor: "pointer" }}>Choose the CSV file<input type="file" accept=".csv,.txt,text/csv,text/plain" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) read(await f.text()); }} /></label>
              <span className="note">or paste it below</span>
            </div>
            <textarea rows={6} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={"Account,Debit,Credit\nSales,,182400\nCost of Goods Sold,104300,\n…"} style={{ resize: "vertical", fontVariantNumeric: "tabular-nums" }} aria-label="Trial balance" />
            <div style={{ marginTop: 10 }}><button type="button" className="btn ghost" disabled={!paste.trim()} onClick={() => read(paste)}>Read what I pasted</button></div>
          </>
        )}
        {problem && <div className="banner bad" style={{ marginTop: 12 }}><span>✕</span><span>{problem}</span></div>}
        {rows && t && check && (
          <>
            <div className={`banner ${Math.abs(check.debits - check.credits) < 1 ? "good" : "warn"}`}>
              <span>{Math.abs(check.debits - check.credits) < 1 ? "✓" : "!"}</span>
              <span>{rows.length} accounts read. Debits {gbp(check.debits)}, credits {gbp(check.credits)}{Math.abs(check.debits - check.credits) < 1 ? ": they balance." : `: they differ by ${gbp(Math.abs(check.debits - check.credits))}, so an account may be missing from the export.`}
                {guessed ? ` ${guessed} match${guessed === 1 ? " is a guess" : "es are guesses"}, shown in yellow: check ${guessed === 1 ? "it" : "them"}.` : ""}</span>
            </div>
            <div className="grid2" style={{ marginBottom: 14 }}>
              <div>
                {PL_KEYS.map((k) => <div className="kv" key={k}><span className="k">{TARGETS.find((x) => x.key === k)!.label}</span><span className="v">{gbp(t[k])}</span></div>)}
                <div className="kv"><span className="k"><b>{profit < 0 ? "Loss" : "Profit"} before tax</b></span><span className="v">{gbp(profit)}</span></div>
              </div>
              <div>
                {(["fixedAssets", "stock", "debtors", "cash", "prepayments", "creditorsWithin", "owedToDirectors", "corporationTaxOwed", "creditorsAfter", "shareCapital", "reservesBroughtForward", "dividendsPaid"] as BsKey[])
                  .filter((k) => t[k]).map((k) => <div className="kv" key={k}><span className="k">{TARGETS.find((x) => x.key === k)!.label}</span><span className="v">{gbp(t[k])}</span></div>)}
                {t.owedToDirectors < 0 && <p className="note">The director&apos;s loan account is overdrawn by {gbp(-t.owedToDirectors)}: enter that in the Director&apos;s loans step, not here.</p>}
              </div>
            </div>
            <div style={{ maxHeight: 440, overflow: "auto", border: "1px solid var(--border-2)", borderRadius: 12 }}>
              <table>
                <thead><tr><th>Account</th><th className="num">Debit</th><th className="num">Credit</th><th>Goes to</th></tr></thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} style={r.why === "guess" ? { background: "rgba(255,216,77,.07)" } : undefined}>
                      <td><b style={{ fontWeight: 600 }}>{r.name}</b><div className="note">{[r.code, r.type].filter(Boolean).join(", ")}{r.code || r.type ? ". " : ""}Matched {WHY[r.why]}</div></td>
                      <td className="num">{r.net > 0 ? gbp(r.net) : ""}</td>
                      <td className="num">{r.net < 0 ? gbp(-r.net) : ""}</td>
                      <td>
                        <select value={r.target} aria-label={`Where ${r.name} goes`} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, target: e.target.value as Target, why: "name" } : x)))}>
                          {GROUPS.map((g) => <optgroup key={g} label={g}>{TARGETS.filter((x) => x.group === g).map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}</optgroup>)}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
              <button type="button" className="btn" onClick={apply}>Fill in the profit and loss and the balance sheet</button>
              <button type="button" className="btn ghost" onClick={() => { setRows(null); setCheck(null); }}>Use a different file</button>
            </div>
            <p className="note">Amounts are rounded to whole pounds. Check the expenses tax doesn&apos;t allow, equipment bought and director&apos;s loans in their own steps: a trial balance doesn&apos;t say which those are.</p>
          </>
        )}
      </div>
    </div>
  );
}
