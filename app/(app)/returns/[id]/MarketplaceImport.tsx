"use client";

/**
 * Fills the profit and loss from Amazon and eBay sellers' transaction
 * reports: sales less refunds, marketplace reimbursements, and the fees by
 * kind. Several reports can be added (Amazon and eBay, or one per month).
 * The files are read here in the browser; nothing is uploaded.
 */
import { useMemo, useState } from "react";
import { addTotals, forProfitAndLoss, readMarketplaceReport, totalFees, type MarketplaceRead } from "@/lib/marketplace-import";

const gbp = (n: number) => `${n < 0 ? "−" : ""}£${Math.abs(n).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (iso: string) => new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const NAME = { amazon: "Amazon", ebay: "eBay" } as const;
const FEES: { key: keyof MarketplaceRead["totals"]["fees"]; label: string }[] = [
  { key: "selling", label: "Selling and final value fees" },
  { key: "fulfilment", label: "Fulfilment (FBA) fees" },
  { key: "postage", label: "Postage labels bought through the marketplace" },
  { key: "advertising", label: "Advertising and promoted listings" },
  { key: "subscription", label: "Seller subscriptions and shop fees" },
  { key: "storage", label: "Storage, removal and inventory fees" },
  { key: "other", label: "Other fees and charges" },
];

export default function MarketplaceImport({ periodFrom, periodTo, onApply, onClose }: {
  periodFrom: string; periodTo: string;
  onApply: (v: { turnover: number; otherIncome: number; otherCharges: number }, mode: "replace" | "add") => void;
  onClose: () => void;
}) {
  const [files, setFiles] = useState<{ name: string; read: MarketplaceRead }[]>([]);
  const [vat, setVat] = useState<"none" | "included" | "separate">("none");
  const add = async (list: FileList | null) => {
    if (!list) return;
    const next = [...files];
    for (const f of Array.from(list)) next.push({ name: f.name, read: readMarketplaceReport(await f.text(), periodFrom, periodTo) });
    setFiles(next);
    if (next.some((x) => x.read.ok && x.read.totals.taxSeparated !== 0)) setVat("separate");
  };
  const good = files.filter((x) => x.read.ok);
  const t = useMemo(() => addTotals(good.map((x) => x.read.totals)), [good]);
  const pl = forProfitAndLoss(t, vat === "included" ? 20 : null);

  return (
    <div className="card">
      <div className="hd"><h3>Import Amazon or eBay reports</h3><button type="button" className="btn ghost sm" onClick={onClose}>Close</button></div>
      <div className="bd">
        <p className="note" style={{ marginTop: 0 }}>
          Download the transaction report for the year as a CSV file, then choose it here. You can add several: Amazon and eBay, or one per month.
        </p>
        <ul className="note" style={{ margin: "0 0 12px", paddingLeft: 18 }}>
          <li><b>Amazon:</b> Seller Central → Payments → Reports Repository → choose Transaction, the dates {day(periodFrom)} to {day(periodTo)}, then Request report and download the CSV.</li>
          <li><b>eBay:</b> Seller Hub → Payments → Reports → Transaction report, the same dates, then download the CSV.</li>
        </ul>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
          <label className="btn" style={{ cursor: "pointer" }}>{files.length ? "Add another report" : "Choose the report"}
            <input type="file" multiple accept=".csv,.txt,text/csv,text/plain" hidden onChange={(e) => { void add(e.target.files); e.target.value = ""; }} />
          </label>
          <span className="note">The file is read on this computer and isn&apos;t uploaded.</span>
        </div>

        {files.map((f, i) => (
          <div key={`${f.name}-${i}`} className={`banner ${f.read.ok ? "info" : "bad"}`} style={{ marginBottom: 8 }}>
            <span>{f.read.ok ? "✓" : "✕"}</span>
            <span style={{ flex: 1 }}>
              <b>{f.name}</b>{f.read.ok && f.read.source ? ` · ${NAME[f.read.source]} · ${f.read.inPeriod} transaction${f.read.inPeriod === 1 ? "" : "s"} in the period` : ""}
              {f.read.ok && f.read.firstDate && f.read.lastDate && <span className="note"> ({day(f.read.firstDate)} to {day(f.read.lastDate)}{f.read.outside ? `; ${f.read.outside} outside the period left out` : ""})</span>}
              {!f.read.ok && <div>{f.read.problem}</div>}
              {f.read.warnings.length > 0 && <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>{f.read.warnings.map((w, j) => <li key={j}>{w}</li>)}</ul>}
              {f.read.unrecognised.length > 0 && (
                <div className="note" style={{ marginTop: 4 }}>
                  Not counted, because Nucta Filings doesn&apos;t know what they are: {f.read.unrecognised.map((u) => `${u.type} (${u.rows}, ${gbp(u.total)})`).join("; ")}. Add them by hand if they belong in the accounts.
                </div>
              )}
            </span>
            <button type="button" className="btn ghost sm" onClick={() => setFiles(files.filter((_, j) => j !== i))}>Remove</button>
          </div>
        ))}

        {good.length > 0 && (
          <>
            <table className="paytable" style={{ marginTop: 8 }}>
              <tbody>
                <tr><td>Sales, postage charged and gift wrap, less promotions</td><td className="num">{gbp(t.sales - t.refunds)}</td></tr>
                <tr><td>Refunds to buyers</td><td className="num">{gbp(t.refunds)}</td></tr>
                <tr className="t"><td><b>Sales after refunds</b></td><td className="num"><b>{gbp(t.sales)}</b></td></tr>
                <tr><td>Reimbursements (lost or damaged stock, claims)</td><td className="num">{gbp(t.reimbursements)}</td></tr>
                {FEES.filter((x) => t.fees[x.key] !== 0).map((x) => <tr key={x.key}><td>{x.label}</td><td className="num">{gbp(-t.fees[x.key])}</td></tr>)}
                <tr className="t"><td><b>Marketplace fees</b></td><td className="num"><b>{gbp(-totalFees(t))}</b></td></tr>
                <tr><td className="note">Paid out to the bank (for checking against the bank statements; not income)</td><td className="num note">{gbp(t.payouts)}</td></tr>
              </tbody>
            </table>

            <div className="field" style={{ marginTop: 14 }}>
              <label>VAT</label>
              <div className="yn" role="radiogroup" style={{ flexWrap: "wrap", display: "flex", width: "fit-content", maxWidth: "100%" }}>
                <button type="button" aria-pressed={vat === "none"} onClick={() => setVat("none")}>The company isn&apos;t VAT registered</button>
                <button type="button" aria-pressed={vat === "included"} onClick={() => setVat("included")}>VAT registered: take 20% VAT out of sales</button>
                <button type="button" aria-pressed={vat === "separate"} onClick={() => setVat("separate")}>The report already shows VAT separately</button>
              </div>
              <span className="hint">
                {vat === "included" ? `Takes ${gbp(pl.vatRemoved)} of VAT out of sales, as if every sale were at 20%. If some goods are zero-rated or sales went abroad, use the sales figure from the VAT returns instead.`
                  : vat === "separate" ? `The report shows ${gbp(t.taxSeparated)} of VAT or sales tax separately, which is left out of sales already.`
                  : "Turnover is sales as they are."}
              </span>
            </div>

            <div className="grid2" style={{ marginTop: 10 }}>
              <div className="kv"><span className="k">Turnover</span><span className="v">{gbp(pl.turnover)}</span></div>
              <div className="kv"><span className="k">Other income</span><span className="v">{gbp(pl.otherIncome)}</span></div>
              <div className="kv"><span className="k">All other expenses</span><span className="v">{gbp(pl.otherCharges)}</span></div>
            </div>
            <div className="banner info" style={{ marginTop: 10 }}><span>!</span><span>
              <b>Still to add yourself:</b> what the goods cost to buy (Cost of goods sold), other costs paid from the bank, and on the balance sheet any money the marketplace still held at the year end (under Owed to the company) and unsold stock.
              Fees are as the marketplace shows them; if the company reclaims VAT on them, take that VAT off.
            </span></div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
              <button type="button" className="btn" onClick={() => onApply({ turnover: pl.turnover, otherIncome: pl.otherIncome, otherCharges: pl.otherCharges }, "replace")}>Use these figures</button>
              <button type="button" className="btn ghost" onClick={() => onApply({ turnover: pl.turnover, otherIncome: pl.otherIncome, otherCharges: pl.otherCharges }, "add")}>Add them to the figures already entered</button>
            </div>
            <p className="note" style={{ marginTop: 6 }}>“Use these figures” replaces turnover, other income and other expenses. The other boxes are left as they are.</p>
          </>
        )}
      </div>
    </div>
  );
}
