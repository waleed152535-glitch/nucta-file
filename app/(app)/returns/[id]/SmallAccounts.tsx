"use client";

/**
 * The inputs small-company accounts (FRS 102 Section 1A) need beyond
 * micro-entity accounts: the balance sheet line by line, equipment's cost and
 * depreciation, deferred tax, shares, and last year line by line.
 */
import type { ReturnData } from "@/lib/return-model";
import { effectiveBalanceSheet } from "@/lib/return-model";
import { priorSmallProfit, shareCapitalOf, suggestDeferredTax, syncPriorFromSmall, tangibleNote, type SmallDetail, priorSmallFromTotals } from "@/lib/accounts/small";
import type { PriorSmall, PriorYear } from "@/lib/ixbrl";
import { Money, Whole, TextArea, Pence, DateField, gbp } from "./fields";

const Sub = ({ children }: { children: React.ReactNode }) => <div className="note" style={{ margin: "4px 0 6px", fontWeight: 600, color: "var(--muted)" }}>{children}</div>;

export function SmallBalanceSheet(props: {
  d: ReturnData;
  setIn: (k: "balanceSheet", f: keyof ReturnData["balanceSheet"], v: number) => void;
  setSmall: <K extends keyof SmallDetail>(k: K, v: SmallDetail[K]) => void;
  /** Owed to the company by directors and shareholders, from the loans step. */
  a75: number;
  /** This year's Corporation Tax, added to what the company owes. */
  ct: number;
  capitalAndReserves: number | null;
  profitAfterTax: number | null;
  /** The tax pools carried forward, for the deferred tax suggestion. */
  pools: number;
  chargeable: number;
  /** Equipment bought, from the capital allowances step. */
  bought: number;
  problems: string[];
}) {
  const { d, setIn, setSmall, a75, ct } = props;
  const s = d.small, b = d.balanceSheet;
  const eff = effectiveBalanceSheet(d);
  const tn = tangibleNote(s, d.pl.depreciation);
  const has = eff.fixedAssets + b.stock + eff.debtors + b.cash + b.prepayments + b.shareCapitalNotPaid + a75;
  const owes = eff.creditorsWithin + b.owedToDirectors + eff.creditorsAfter + eff.provisions + ct;
  const sug = suggestDeferredTax(tn.nbvCf, props.pools, props.chargeable);
  const equipmentProblems = props.problems.filter((p) => /equipment|depreciation/i.test(p));
  const otherProblems = props.problems.filter((p) => !equipmentProblems.includes(p));
  return (
    <>
      <div className="bsgroup">
        <h5><span>Equipment and vehicles</span><b>{gbp(tn.nbvCf)}</b></h5>
        <div className="row3">
          <Money label="Cost at the start of the year" hint="last year's fixed assets note" value={s.tangibleCostBroughtForward} onChange={(v) => setSmall("tangibleCostBroughtForward", v)} />
          <Money label="Bought this year" hint="at cost" value={s.tangibleAdditions} onChange={(v) => setSmall("tangibleAdditions", v)}
            help={props.bought > 0 && props.bought !== s.tangibleAdditions ? `The equipment step lists ${gbp(props.bought)} bought.` : undefined} />
          <Money label="Cost of items sold or scrapped" value={s.tangibleDisposalsCost} onChange={(v) => setSmall("tangibleDisposalsCost", v)} />
        </div>
        <div className="row3">
          <Money label="Depreciation at the start of the year" hint="written off in earlier years" value={s.depreciationBroughtForward} onChange={(v) => setSmall("depreciationBroughtForward", v)} />
          <Money label="Depreciation on items sold or scrapped" value={s.depreciationOnDisposals} onChange={(v) => setSmall("depreciationOnDisposals", v)} />
          <div className="field"><label>This year&apos;s depreciation<span className="hint">from the profit and loss step</span></label><div className="kv" style={{ margin: 0 }}><span className="v">{gbp(d.pl.depreciation)}</span></div></div>
        </div>
        {props.bought > 0 && props.bought !== s.tangibleAdditions && (
          <p className="note" style={{ margin: "-4px 0 8px" }}><button type="button" className="btn ghost sm" onClick={() => setSmall("tangibleAdditions", props.bought)}>Use {gbp(props.bought)} as bought this year</button></p>
        )}
        <TextArea label="How equipment is depreciated" hint="for the accounting policies note" rows={2} value={s.depreciationPolicy} onChange={(v) => setSmall("depreciationPolicy", v)} />
        <p className="note" style={{ margin: 0 }}>Cost at the year end {gbp(tn.costCf)}, less depreciation of {gbp(tn.depCf)}: the value in the books is {gbp(tn.nbvCf)}.</p>
        {equipmentProblems.length > 0 && <ul className="note" style={{ color: "var(--bad-ink)", margin: "6px 0 8px", paddingLeft: 18 }}>{equipmentProblems.map((p) => <li key={p}>{p}</li>)}</ul>}
      </div>

      <div className="bsgroup">
        <h5><span>What the company has</span><b>{gbp(has)}</b></h5>
        <div className="row3">
          <Money label="Cash at bank" hint="every account, at the year end" value={b.cash} onChange={(v) => setIn("balanceSheet", "cash", v)} />
          <Money label="Owed by customers" hint="trade debtors, payouts due" value={s.tradeDebtors} onChange={(v) => setSmall("tradeDebtors", v)} />
          <Money label="Other money owed to the company" hint="VAT refund, deposits" value={s.otherDebtors} onChange={(v) => setSmall("otherDebtors", v)} />
        </div>
        <div className="row3">
          <Money label="Stock" hint="unsold goods, at cost" value={b.stock} onChange={(v) => setIn("balanceSheet", "stock", v)} />
          <Money label="Prepayments" hint="paid in advance" value={b.prepayments} onChange={(v) => setIn("balanceSheet", "prepayments", v)} />
          <Money label="Investments" hint="shares held long term, at cost" value={s.investments} onChange={(v) => setSmall("investments", v)} />
        </div>
        {a75 > 0 && <p className="note" style={{ margin: 0 }}>Includes {gbp(a75)} the directors or shareholders owe the company, from the director&apos;s loans step.</p>}
      </div>

      <div className="bsgroup">
        <h5><span>What the company owes</span><b>{gbp(owes)}</b></h5>
        <Sub>Due within a year</Sub>
        <div className="row3">
          <Money label="Owed to suppliers" hint="trade creditors" value={s.tradeCreditors} onChange={(v) => setSmall("tradeCreditors", v)} />
          <Money label="Bank loans and overdrafts" hint="the part due within a year" value={s.bankWithin} onChange={(v) => setSmall("bankWithin", v)} />
          <Money label="PAYE, National Insurance and VAT" hint="not Corporation Tax" value={s.taxationSocialSecurity} onChange={(v) => setSmall("taxationSocialSecurity", v)} />
        </div>
        <div className="row3">
          <Money label="Owed to directors" hint="director's loan account in credit" value={b.owedToDirectors} onChange={(v) => setIn("balanceSheet", "owedToDirectors", v)} />
          <Money label="Accruals" hint="the year's costs not yet invoiced" value={s.accrualsWithin} onChange={(v) => setSmall("accrualsWithin", v)} />
          <Money label="Other money owed" value={s.otherCreditorsWithin} onChange={(v) => setSmall("otherCreditorsWithin", v)} />
        </div>
        <Sub>Due after more than a year</Sub>
        <div className="row2">
          <Money label="Bank loans" value={s.bankAfter} onChange={(v) => setSmall("bankAfter", v)} />
          <Money label="Other loans" value={s.otherAfter} onChange={(v) => setSmall("otherAfter", v)} />
        </div>
        <Sub>Provisions</Sub>
        <div className="row3">
          <Money label="Deferred tax at the start" hint="last year's provision" value={s.deferredTaxBroughtForward} onChange={(v) => setSmall("deferredTaxBroughtForward", v)} />
          <Money label="Deferred tax at the end" value={s.deferredTaxCarriedForward} onChange={(v) => setSmall("deferredTaxCarriedForward", v)}
            help={sug.gap > 0 ? `Suggested ${gbp(sug.amount)}: ${Math.round(sug.rate * 100)}% of the ${gbp(sug.gap)} by which equipment's value in the books is more than its value for tax.` : undefined} />
          <Money label="Other provisions" hint="usually nothing" value={b.provisions} onChange={(v) => setIn("balanceSheet", "provisions", v)} />
        </div>
        {sug.gap > 0 && sug.amount !== s.deferredTaxCarriedForward && (
          <p className="note" style={{ margin: "-4px 0 8px" }}><button type="button" className="btn ghost sm" onClick={() => setSmall("deferredTaxCarriedForward", sug.amount)}>Use the suggested {gbp(sug.amount)}</button> Check it with whoever prepares the accounts: it&apos;s a starting point.</p>
        )}
        {ct > 0 && <p className="note" style={{ margin: 0 }}>Includes this year&apos;s Corporation Tax of {gbp(ct)}, which Nucta File adds for you.</p>}
      </div>

      <div className="bsgroup">
        <h5><span>Shares and reserves</span>{props.capitalAndReserves !== null && <b>{gbp(props.capitalAndReserves)}</b>}</h5>
        <div className="row3">
          <Whole label="Number of shares issued" value={s.sharesNumber} onChange={(v) => setSmall("sharesNumber", v)} />
          <Pence label="Value of each share" hint="£, e.g. 1 or 0.01" value={s.shareNominal} onChange={(v) => setSmall("shareNominal", v)} />
          <div className="field"><label>Share capital</label><div className="kv" style={{ margin: 0 }}><span className="v">{gbp(shareCapitalOf(s), !Number.isInteger(shareCapitalOf(s)))}</span></div></div>
        </div>
        <div className="row3">
          <Money label="Reserves at the start of the year" hint="minus for losses" value={b.reservesBroughtForward} onChange={(v) => setIn("balanceSheet", "reservesBroughtForward", v)} />
          <Money label="Dividends paid this year" value={b.dividendsPaid} onChange={(v) => setIn("balanceSheet", "dividendsPaid", v)} />
          <Money label="Share capital not paid" hint="usually nothing" value={b.shareCapitalNotPaid} onChange={(v) => setIn("balanceSheet", "shareCapitalNotPaid", v)} />
        </div>
        {props.profitAfterTax !== null && <p className="note" style={{ margin: 0 }}>Includes this year&apos;s {props.profitAfterTax < 0 ? "loss" : "profit"} after tax and deferred tax of {gbp(Math.abs(props.profitAfterTax))}.</p>}
      </div>

      <div className="bsgroup">
        <h5><span>For the directors&apos; report and notes</span></h5>
        <TextArea label="Other directors in the year" hint="one per line; the director approving the accounts is included already" rows={2} value={s.otherDirectors} onChange={(v) => setSmall("otherDirectors", v)} />
        <TextArea label="Commitments, guarantees and contingencies not on the balance sheet" hint="leases, guarantees given, legal claims"
          placeholder="Leave blank if there are none: the accounts then say there were none." rows={2} value={s.commitments} onChange={(v) => setSmall("commitments", v)} />
        {otherProblems.length > 0 && <ul className="note" style={{ color: "var(--bad-ink)", margin: "0 0 8px", paddingLeft: 18 }}>{otherProblems.map((p) => <li key={p}>{p}</li>)}</ul>}
      </div>
    </>
  );
}

/** Last year line by line, for the comparative column of small-company accounts. */
export function PriorSmallFields({ prior, onChange }: { prior: NonNullable<ReturnData["prior"]>; onChange: (p: NonNullable<ReturnData["prior"]>) => void }) {
  const f = prior.figures, s = f.small ?? priorSmallFromTotals(f);
  const setS = (k: keyof PriorSmall, v: number) => onChange({ ...prior, figures: syncPriorFromSmall({ ...f, small: { ...s, [k]: v } }) });
  const setF = (k: keyof Pick<PriorYear, "turnover" | "employees" | "shareCapitalNotPaid">, v: number) => onChange({ ...prior, figures: syncPriorFromSmall({ ...f, [k]: v, small: s }) });
  const m = (label: string, k: keyof PriorSmall, hint?: string) => <Money label={label} hint={hint} value={s[k]} onChange={(v) => setS(k, v)} />;
  const synced = syncPriorFromSmall({ ...f, small: s });
  const net = synced.shareCapitalNotPaid + synced.fixedAssets + synced.currentAssets + synced.prepayments - synced.creditorsWithin - synced.creditorsAfter - synced.provisions;
  return (
    <>
      <p className="note">Copy these from last year&apos;s accounts, line by line.</p>
      <div className="row2">
        <DateField label="Last year started" value={prior.from} onChange={(v) => onChange({ ...prior, from: v })} />
        <DateField label="Last year ended" value={prior.to} onChange={(v) => onChange({ ...prior, to: v })} />
      </div>
      <div className="bsgroup">
        <h5><span>Profit and loss account</span><b>{gbp(priorSmallProfit(f.turnover, s))} before tax</b></h5>
        <div className="row3">
          <Money label="Turnover" value={f.turnover} onChange={(v) => setF("turnover", v)} />
          {m("Cost of sales", "costOfSales")}
          {m("Administrative expenses", "administrativeExpenses")}
        </div>
        <div className="row3">
          {m("Other operating income", "otherOperatingIncome")}
          {m("Interest received", "interestReceivable")}
          {m("Interest paid", "interestPayable")}
        </div>
        <div className="row3">
          {m("Corporation Tax", "currentTax", "the year's current tax")}
          {m("Deferred tax", "deferredTax", "charge; minus for a credit")}
          <Whole label="Employees" value={f.employees} onChange={(v) => setF("employees", v)} />
        </div>
      </div>
      <div className="bsgroup">
        <h5><span>Balance sheet: what it had</span><b>{gbp(synced.fixedAssets + synced.currentAssets + synced.prepayments + synced.shareCapitalNotPaid)}</b></h5>
        <div className="row3">{m("Equipment", "tangibleAssets", "value in the books")}{m("Investments", "investments")}{m("Stock", "stocks")}</div>
        <div className="row3">{m("Owed by customers", "tradeDebtors")}{m("Owed by directors", "owedByDirectors")}{m("Other debtors", "otherDebtors")}</div>
        <div className="row3">{m("Prepayments", "prepayments")}{m("Cash at bank", "cash")}<Money label="Share capital not paid" value={f.shareCapitalNotPaid} onChange={(v) => setF("shareCapitalNotPaid", v)} /></div>
      </div>
      <div className="bsgroup">
        <h5><span>Balance sheet: what it owed</span><b>{gbp(synced.creditorsWithin + synced.creditorsAfter + synced.provisions)}</b></h5>
        <div className="row3">{m("Owed to suppliers", "tradeCreditors")}{m("Bank loans and overdrafts", "bankWithin", "due within a year")}{m("Corporation Tax", "corporationTax")}</div>
        <div className="row3">{m("PAYE, NI and VAT", "otherTaxation")}{m("Owed to directors", "owedToDirectors")}{m("Accruals", "accrualsWithin")}</div>
        <div className="row3">{m("Other creditors", "otherCreditorsWithin", "due within a year")}{m("Bank loans", "bankAfter", "due after a year")}{m("Other loans", "otherAfter", "due after a year")}</div>
        <div className="row2">{m("Deferred tax provision", "deferredTaxProvision")}{m("Other provisions", "otherProvisions")}</div>
      </div>
      <div className="bsgroup">
        <h5><span>Shares and reserves</span><b>{gbp(net)}</b></h5>
        <div className="row3">{m("Share capital", "shareCapital")}{m("Dividends paid", "dividendsPaid")}
          <div className="field"><label>Profit and loss reserve</label><div className="kv" style={{ margin: 0 }}><span className="v">{gbp(net - s.shareCapital)}</span></div></div>
        </div>
        <p className="note" style={{ margin: 0 }}>Net assets come to {gbp(net)}. They should match last year&apos;s balance sheet.</p>
      </div>
    </>
  );
}
