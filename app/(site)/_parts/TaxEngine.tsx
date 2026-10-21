"use client";

/**
 * Try the engine: the same Corporation Tax calculation that prepares a return,
 * running in the page. Profit, period length and associated companies in;
 * the CT600's tax boxes out.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { compute, type ReturnFigures } from "@/lib/tax/computation";
import { addMonths } from "@/lib/tax/dates";

const END = "2026-03-31";
const PERIODS = [12, 9, 6] as const;
const ASSOCIATED = [0, 1, 2, 3] as const;
const MAX = 500_000;

const gbp = (v: number, pence = false) => `£${v.toLocaleString("en-GB", { minimumFractionDigits: pence ? 2 : 0, maximumFractionDigits: pence ? 2 : 0 })}`;
const long = (iso: string) => new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

function figures(profit: number, months: number, associated: number): ReturnFigures {
  // The day after the same date `months` earlier: 12 months to 31 March 2026 starts 1 April 2025.
  const from = new Date(addMonths(END, -months) + "T12:00:00Z");
  from.setUTCDate(from.getUTCDate() + 1);
  return {
    periodFrom: from.toISOString().slice(0, 10), periodTo: END, associatedCompanies: associated,
    pl: { turnover: profit, otherIncome: 0, interestReceived: 0, costOfSales: 0, staffCosts: 0, depreciation: 0, otherCharges: 0 },
    disallowable: { entertainment: 0, finesAndPenalties: 0, charitableDonations: 0, politicalDonations: 0, privateExpenses: 0, capitalItemsExpensed: 0, lossOnDisposals: 0, other: 0 },
    profitOnDisposals: 0,
    capitalAllowances: { additions: [], disposals: [], mainPoolBroughtForward: 0, specialPoolBroughtForward: 0 },
    tradingLossesBroughtForward: 0, qualifyingDonations: 0,
  };
}

/** Counts towards a number rather than jumping to it, unless motion is unwelcome. */
function useTween(target: number) {
  const [shown, setShown] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setShown(target); from.current = target; return; }
    const start = performance.now(), a = from.current;
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / 450), e = 1 - Math.pow(1 - k, 3);
      const v = a + (target - a) * e;
      from.current = v; setShown(v);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return shown;
}

export default function TaxEngine() {
  const [profit, setProfit] = useState(85_000);
  const [text, setText] = useState("85,000");
  const [months, setMonths] = useState<number>(12);
  const [associated, setAssociated] = useState<number>(0);

  const r = useMemo(() => compute(figures(profit, months, associated)), [profit, months, associated]);
  const y = r.years[0];
  const lower = r.years.reduce((s, x) => s + x.lowerLimit, 0), upper = r.years.reduce((s, x) => s + x.upperLimit, 0);
  const band = profit <= 0 ? "none" : r.marginalRelief > 0 ? "marginal" : r.rate === 19 ? "small" : "main";
  const tax = useTween(r.taxChargeable);
  const scaleMax = Math.max(upper * 1.25, profit * 1.08, 1);
  const at = (v: number) => `${Math.min(100, (v / scaleMax) * 100)}%`;
  const due = (() => { const d = new Date(addMonths(END, 9) + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); })();

  const setFromText = (v: string) => {
    setText(v);
    const n = Math.round(Number(v.replace(/[^\d.]/g, "")) || 0);
    setProfit(Math.min(10_000_000, n));
  };
  const setFromSlider = (n: number) => { setProfit(n); setText(n.toLocaleString("en-GB")); };

  return (
    <div className="engine">
      <div className="in">
        <div className="e-field">
          <label className="q" htmlFor="eng-profit">Taxable profit<small>Trading profit after expenses and capital allowances</small></label>
          <div className="money">
            <span aria-hidden>£</span>
            <input id="eng-profit" inputMode="numeric" autoComplete="off" value={text}
              onChange={(e) => setFromText(e.target.value)}
              onBlur={() => setText(profit.toLocaleString("en-GB"))} />
          </div>
          <input type="range" min={0} max={MAX} step={1000} value={Math.min(profit, MAX)} aria-label="Taxable profit"
            onChange={(e) => setFromSlider(Number(e.target.value))} />
        </div>
        <div className="e-field">
          <span className="q" id="eng-period">Length of the accounting period<small>A shorter period has lower limits</small></span>
          <div className="seg" role="group" aria-labelledby="eng-period">
            {PERIODS.map((m) => <button key={m} type="button" aria-pressed={months === m} onClick={() => setMonths(m)}>{m} months</button>)}
          </div>
        </div>
        <div className="e-field" style={{ marginBottom: 0 }}>
          <span className="q" id="eng-assoc">Associated companies<small>Other companies under the same control share the limits</small></span>
          <div className="seg" role="group" aria-labelledby="eng-assoc">
            {ASSOCIATED.map((n) => <button key={n} type="button" aria-pressed={associated === n} onClick={() => setAssociated(n)}>{n === 0 ? "None" : n}</button>)}
          </div>
        </div>
      </div>
      <div className="out" aria-live="polite">
        <div className="big-l">Corporation Tax for the period ending 31 March 2026</div>
        <div className="big">{gbp(Math.round(tax * 100) / 100, true)}</div>
        <span className={`band ${band}`}>
          {band === "none" ? "No profit, no Corporation Tax" : band === "small" ? "Small profits rate, 19%" : band === "main" ? "Main rate, 25%" : `Main rate of 25%, less ${gbp(r.marginalRelief, true)} marginal relief`}
        </span>
        <div className="gauge" aria-hidden>
          <div className="track">
            <i className="z1" style={{ width: at(lower) }} />
            <i className="z2" style={{ width: `calc(${at(upper)} - ${at(lower)})` }} />
            <i className="z3" style={{ flex: 1 }} />
          </div>
          <div className="mark" style={{ left: `calc(${at(Math.max(0, profit))} - 1px)` }} />
          <span className="lim" style={{ left: at(lower) }}>{gbp(lower)}</span>
          <span className="lim" style={{ left: at(upper) }}>{gbp(upper)}</span>
        </div>
        <div className="lines">
          <div className="line"><span className="bx">315</span><span>Profits chargeable to Corporation Tax</span><span className="v">{gbp(r.chargeableProfits)}</span></div>
          <div className="line"><span className="bx">430</span><span>Corporation Tax{y ? ` at ${r.rate}%` : ""}</span><span className="v">{gbp(r.corporationTax, true)}</span></div>
          <div className="line"><span className="bx">435</span><span>Marginal relief</span><span className="v">{gbp(r.marginalRelief, true)}</span></div>
          <div className="line total"><span className="bx">440</span><span>Tax chargeable</span><span className="v">{gbp(r.taxChargeable, true)}</span></div>
        </div>
        <p className="e-note">
          {profit > 0 ? <>That&apos;s {(r.taxChargeable / profit * 100).toFixed(1)}% of the profit, payable by {long(due)}. </> : null}
          Worked out by the same engine that prepares the return.
        </p>
      </div>
    </div>
  );
}
