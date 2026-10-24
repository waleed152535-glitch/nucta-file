"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  saveReturn, previewReturn, sendReturnToTest, startAmendment,
  type ReturnPreview, type SendResult,
} from "@/lib/return-actions";
import type { ReturnData } from "@/lib/return-model";
import { SCOPE_QUESTIONS } from "@/lib/tax/scope";
import { checkMicroAccounts } from "@/lib/accounts/micro";
import type { FirstPartLoans, ParticipatorAccount } from "@/lib/tax/directors-loans";
import type { AssetKind, DisposalPool } from "@/lib/tax/capital-allowances";
import { accountingPeriodsOf, computePeriodOfAccount } from "@/lib/tax/long-period";
import { monthsIn } from "@/lib/tax/dates";
import { toPeriodOfAccountInput, toFigures, dormantBalanceSheet } from "@/lib/return-model";
import { Money, Whole, Text, DateField, YesNo, gbp } from "./fields";
import OnlineApproval from "./OnlineApproval";
import TrialBalanceImport from "./TrialBalanceImport";
import LiveFiling from "./LiveFiling";
import CompaniesHouseAccounts from "./CompaniesHouseAccounts";

const STEPS = [
  "The company", "Profit and loss", "Expenses tax doesn't allow", "Equipment and vehicles",
  "Director's loans", "Last year", "Balance sheet", "Approval", "Review and file",
] as const;

const ASSET_KINDS: { key: AssetKind; label: string }[] = [
  { key: "plantNew", label: "New equipment (computers, machinery, furniture, vans) — not a car" },
  { key: "plantUsed", label: "Second-hand equipment or vans — not a car" },
  { key: "specialRate", label: "Building fixtures: heating, lighting, electrics, air conditioning, lifts, solar panels" },
  { key: "carZeroEmissionNew", label: "Car — new and fully electric (0 g/km)" },
  { key: "carLowEmission", label: "Car — other, 50 g/km CO₂ or less" },
  { key: "carHighEmission", label: "Car — over 50 g/km CO₂" },
];

const DISPOSAL_POOLS: { key: DisposalPool; label: string }[] = [
  { key: "main", label: "Equipment or car from the main pool (including electric cars)" },
  { key: "special", label: "Building fixtures, or a car over 50 g/km" },
  { key: "fullExpensing", label: "New equipment that had full expensing (100%)" },
];

export default function ReturnWizard(props: {
  id: string; periodStart: string; periodEnd: string; status: string;
  company: { id: string; name: string; companyNo: string | null; utr: string | null };
  initial: ReturnData;
  submissions: { at: string; outcome: string; correlationId: string | null; test: boolean; receipt: boolean; period: string | null }[];
}) {
  const router = useRouter();
  const [d, setD] = useState<ReturnData>(props.initial);
  const [step, setStep] = useState(0);
  const [saved, setSaved] = useState<string | null>(null);
  const [preview, setPreview] = useState<ReturnPreview | null>(null);
  const [sent, setSent] = useState<Record<number, SendResult>>({});
  const [sending, setSending] = useState<number | null>(null);
  const [doc, setDoc] = useState<"accounts" | number>(0);
  const [amendProblems, setAmendProblems] = useState<string[]>([]);
  const [pending, start] = useTransition();
  // Accounts longer than 12 months make two returns: these are their dates.
  const periods = accountingPeriodsOf(props.periodStart, props.periodEnd);
  const long = periods.length > 1;
  const [ap1, ap2] = periods;

  const [tbOpen, setTbOpen] = useState(false);
  const [tbDone, setTbDone] = useState(false);
  const fromTrialBalance = (pl: Partial<ReturnData["pl"]>, bs: Partial<ReturnData["balanceSheet"]>) => {
    const whole = <T extends object>(o: T): T => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === "number" ? Math.round(v) : v])) as T;
    setD((p) => ({ ...p, pl: { ...p.pl, ...whole(pl) }, balanceSheet: { ...p.balanceSheet, ...whole(bs) } }));
    setSaved(null); setTbOpen(false); setTbDone(true);
  };
  const set = <K extends keyof ReturnData>(k: K, v: ReturnData[K]) => { setD((p) => ({ ...p, [k]: v })); setSaved(null); };
  const setIn = <K extends "pl" | "disallowable" | "balanceSheet">(k: K, f: keyof ReturnData[K], v: number) =>
    { setD((p) => ({ ...p, [k]: { ...p[k], [f]: v } })); setSaved(null); };

  // Live figures, worked out in the browser with the same engine the server
  // uses — for both returns when the accounts pass 12 months.
  const live = useMemo(() => {
    const poa = computePeriodOfAccount(toPeriodOfAccountInput(props.periodStart, props.periodEnd, d));
    const computed = poa.parts.length > 0;
    const problems = computed ? [] : poa.problems;
    const loanProblems = computed ? poa.problems : [];
    const hasLoans = poa.parts.some((x) => x.loans);
    const bs = d.dormant ? dormantBalanceSheet(d.balanceSheet) : d.balanceSheet;
    const acc = computed ? checkMicroAccounts({
      companyName: props.company.name, companyNo: props.company.companyNo ?? "", periodFrom: props.periodStart, periodTo: props.periodEnd,
      principalActivities: d.activity, pl: toFigures(props.periodStart, props.periodEnd, d).pl, taxCharge: poa.corporationTax,
      balanceSheet: { ...bs, owedByParticipators: poa.closingLoans?.a75 ?? 0 }, director: d.director || "x",
      approvedOn: d.approvedOn || "9999-12-31",
    }) : null;
    return { poa, computed, problems, loanProblems, hasLoans, acc };
  }, [d, props.periodStart, props.periodEnd, props.company]);

  const save = (next?: number) => start(async () => {
    const res = await saveReturn(props.id, d);
    setSaved(res.ok ? "Saved." : res.error ?? "Couldn't save.");
    if (res.ok && next !== undefined) { setStep(next); window.scrollTo({ top: 0 }); }
  });
  const check = () => start(async () => {
    // A filed return can't be saved, but its documents, receipt and payments are still shown.
    const res: { ok: boolean; error?: string; changed?: boolean } = props.status === "accepted" ? { ok: true, changed: false } : await saveReturn(props.id, d);
    if (!res.ok) { setSaved(res.error ?? "Couldn't save."); return; }
    setPreview(await previewReturn(props.id)); if (res.changed) setSent({});
  });
  const send = (n: number) => start(async () => {
    setSending(n);
    const r = await sendReturnToTest(props.id, n);
    setSent((x) => ({ ...x, [n]: r })); setSending(null);
    // Reload the return's status from the server, so "Amend this return"
    // appears as soon as HMRC accept it, without reloading the page.
    router.refresh();
  });
  const amend = () => start(async () => {
    const r = await startAmendment(props.id);
    if (r.ok && r.id) router.push(`/returns/${r.id}`); else setAmendProblems(r.problems);
  });
  const canAmend = props.status === "accepted";

  const pbt = d.pl.turnover + d.pl.otherIncome + d.pl.interestReceived - d.pl.costOfSales - d.pl.staffCosts - d.pl.depreciation - d.pl.otherCharges;

  return (
    <>
      <div className="topbar">
        <div>
          <h2>{props.company.name}</h2>
          <div className="sub">
            {long
              ? <>{d.amends ? "Amended returns · " : ""}Accounts for {longDate(props.periodStart)} to {longDate(props.periodEnd)} ({monthsIn(props.periodStart, props.periodEnd)} months) — two Company Tax Returns</>
              : <>{d.amends ? "Amended " : ""}Company Tax Return for {longDate(props.periodStart)} to {longDate(props.periodEnd)}</>} ·{" "}
            <Link href={`/companies/${props.company.id}`}>back to the company</Link>
          </div>
        </div>
        {live.computed && (
          <div className="taxsofar">
            <div className="note">Corporation Tax so far{live.poa.loansTax > 0 ? " (with tax on loans)" : ""}{long ? ", both returns" : ""}</div>
            <b>{gbp(live.poa.corporationTax + (live.loanProblems.length ? 0 : live.poa.loansTax), true)}</b>
          </div>
        )}
      </div>

      <div className="content">
        <ol className="wsteps" aria-label="Steps of the return">
          {STEPS.map((s, i) => (
            <li key={s}>
              <button type="button" className={i === step ? "on" : i < step ? "done" : ""} aria-current={i === step ? "step" : undefined} onClick={() => { setStep(i); if (i === 8) check(); }}>
                <b>{i < step ? "✓" : i + 1}</b>{s}
              </button>
            </li>
          ))}
        </ol>

        {canAmend && (
          <div className="banner good" style={{ alignItems: "center" }}>
            <span>✓</span>
            <span style={{ flex: 1 }}>
              <b>{long ? "Both returns have" : "This return has"} been filed with HMRC.</b>{" "}
              To correct {long ? "them" : "it"}, amend: you get a copy to change, which is sent marked as an amendment, and HMRC put it in place of the original.
              {amendProblems.length > 0 && <div style={{ marginTop: 4 }}>{amendProblems.join(" ")}</div>}
            </span>
            <button type="button" className="btn sm" disabled={pending} onClick={amend}>Amend this return</button>
          </div>
        )}
        {d.amends && (
          <div className="banner info">
            <span>✎</span>
            <span>
              <b>Amended return.</b> It replaces the return {d.amends.test ? "HMRC's test service" : "HMRC"} accepted
              {d.amends.acceptedAt ? ` on ${longDate(d.amends.acceptedAt.slice(0, 10))}` : ""}. Change what needs changing, then send it again — HMRC
              replace the original with it. If the change affects the accounts, the accounts filed at Companies House need amending too.
            </span>
          </div>
        )}
        {long && step < 8 && (
          <div className="banner info">
            <span>ℹ</span>
            <span>
              These accounts cover {monthsIn(props.periodStart, props.periodEnd)} months. Enter the figures for the <b>whole period</b>, as in the accounts.
              A Corporation Tax return can&apos;t cover more than 12 months, so Nucta File splits them into two returns —
              {" "}{longDate(ap1.from)} to {longDate(ap1.to)}, and {longDate(ap2.from)} to {longDate(ap2.to)}{" "}— the profit by days, and
              purchases, sales, donations and director&apos;s loans by their dates.
            </span>
          </div>
        )}
        {d.carriedFrom && step < 8 && (
          <div className="banner info">
            <span>ℹ</span>
            <span>Opening figures — pool values, losses, reserves and last year&apos;s accounts — were carried forward from the return for {d.carriedFrom}.</span>
          </div>
        )}

        {step === 0 && (
          <div className="card">
            <div className="hd"><h3>The company</h3><span className="note">Can Nucta File handle this company?</span></div>
            <div className="bd">
              <Text label="What the company does" hint="appears in the accounts and the computation" value={d.activity} onChange={(v) => set("activity", v)} placeholder="e.g. Online retail of household goods" />
              <Whole label="Associated companies" hint="other companies under the same person's control — dormant ones don't count" value={d.associatedCompanies} onChange={(v) => set("associatedCompanies", v)} />
              <div style={{ marginTop: 10 }}>
                <YesNo question="Was the company dormant for the whole period — no income, no spending and no other transactions?" value={d.dormant}
                  onChange={(v) => set("dormant", v)} why="Companies House fees paid by a director don't stop a company being dormant. Bank interest, a sale or any expense paid by the company does." />
              </div>
              {d.dormant ? (
                <>
                  <YesNo question="Has the company ever traded?" value={d.everTraded} onChange={(v) => set("everTraded", v)} why="The accounts say whether a dormant company has never traded or has stopped trading." />
                  <YesNo question="Have HMRC sent the company a notice to file a Company Tax Return for this period?" value={d.ctNoticeReceived ?? undefined}
                    onChange={(v) => set("ctNoticeReceived", v)}
                    why={d.ctNoticeReceived === false
                      ? "Then HMRC don't expect a return. Only the dormant accounts go to Companies House — Nucta File prepares them, and the return stays ready in case HMRC ask."
                      : "HMRC usually tell a dormant company it doesn't need to file. If they've sent a notice (form CT603, or a letter or email asking for a return), a nil return is filed."} />
                  <div className="banner info" style={{ marginTop: 12 }}>
                    <span>ℹ</span>
                    <span>A dormant company has no profit and loss account, no allowances and no director&apos;s loans, so steps 2 to 5 are skipped. Fill in last year (if it had accounts), the balance sheet and the approval.</span>
                  </div>
                </>
              ) : (
                <>
                  <p className="note" style={{ margin: "14px 0 6px" }}>Answer each question. If any answer means Nucta File can&apos;t prepare this return yet, it will say why.</p>
                  {SCOPE_QUESTIONS.map((q) => (
                    <YesNo key={q.key} question={q.ask} value={d.scope[q.key]} onChange={(v) => set("scope", { ...d.scope, [q.key]: v })}
                      why={d.scope[q.key] !== undefined && d.scope[q.key] !== q.expect ? `Not yet: ${q.why}` : undefined} />
                  ))}
                </>
              )}
            </div>
          </div>
        )}

        {d.dormant && step >= 1 && step <= 4 && (
          <div className="card">
            <div className="hd"><h3>{STEPS[step]}</h3><span className="note">Not needed for a dormant company</span></div>
            <div className="bd">
              <p className="note" style={{ margin: 0 }}>
                The company was dormant, so there is nothing to enter here: no income or expenses, no equipment allowances and no director&apos;s loans.
                If that&apos;s not right, go back to step 1 and answer No to the dormant question.
              </p>
            </div>
          </div>
        )}

        {(step === 1 || step === 6) && !d.dormant && !tbOpen && (
          <div className="banner info" style={{ alignItems: "center" }}>
            <span>⇩</span>
            <span style={{ flex: 1 }}>{tbDone ? <><b>Filled in from the trial balance.</b> Check each figure here and on the balance sheet, then save.</> : <>Keep the books in Xero, QuickBooks, FreeAgent or Sage? Import the trial balance to fill in the profit and loss and the balance sheet at once.</>}</span>
            <button type="button" className="btn sm" onClick={() => setTbOpen(true)}>{tbDone ? "Import again" : "Import a trial balance"}</button>
          </div>
        )}
        {(step === 1 || step === 6) && !d.dormant && tbOpen && <TrialBalanceImport onApply={fromTrialBalance} onClose={() => setTbOpen(false)} />}

        {step === 1 && !d.dormant && (
          <div className="card">
            <div className="hd"><h3>Profit and loss</h3><span className="note">From the bookkeeping for the year</span></div>
            <div className="bd">
              <div className="row2">
                <Money label="Turnover" hint="sales, after refunds, without VAT" value={d.pl.turnover} onChange={(v) => setIn("pl", "turnover", v)} />
                <Money label="Other income" hint="e.g. marketplace reimbursements — not interest" value={d.pl.otherIncome} onChange={(v) => setIn("pl", "otherIncome", v)} />
              </div>
              <div className="row2">
                <Money label="Interest received" hint="from the bank or on loans" value={d.pl.interestReceived} onChange={(v) => setIn("pl", "interestReceived", v)} />
                <Money label="Cost of goods sold" hint="stock bought and sold, materials" value={d.pl.costOfSales} onChange={(v) => setIn("pl", "costOfSales", v)} />
              </div>
              <div className="row2">
                <Money label="Staff costs" hint="salaries incl. directors', employer's NI, pensions" value={d.pl.staffCosts} onChange={(v) => setIn("pl", "staffCosts", v)} />
                <Money label="Depreciation" hint="written off equipment in the accounts" value={d.pl.depreciation} onChange={(v) => setIn("pl", "depreciation", v)} />
              </div>
              <Money label="All other expenses" hint="fees, advertising, software, rent, phone, travel, accountancy…" value={d.pl.otherCharges} onChange={(v) => setIn("pl", "otherCharges", v)} />
              <div className="kv"><span className="k">{pbt < 0 ? "Loss" : "Profit"} before tax</span><span className="v">{gbp(pbt)}</span></div>
            </div>
          </div>
        )}

        {step === 2 && !d.dormant && (
          <div className="card">
            <div className="hd"><h3>Expenses tax doesn&apos;t allow</h3><span className="note">Already included in the expenses above</span></div>
            <div className="bd">
              <p className="note" style={{ marginTop: 0 }}>These are added back to the profit. Leave anything that doesn&apos;t apply at nothing. Depreciation is added back automatically — equipment gets capital allowances instead.</p>
              <div className="row2">
                <Money label="Entertaining clients or suppliers" hint="staff parties are allowed" value={d.disallowable.entertainment} onChange={(v) => setIn("disallowable", "entertainment", v)} />
                <Money label="Fines and penalties" hint="incl. HMRC penalties, parking fines" value={d.disallowable.finesAndPenalties} onChange={(v) => setIn("disallowable", "finesAndPenalties", v)} />
              </div>
              <div className="row2">
                <Money label="Donations to charity" hint="relieved separately, below" value={d.disallowable.charitableDonations}
                  onChange={(v) => { setIn("disallowable", "charitableDonations", v); set("qualifyingDonations", v); }} />
                <Money label="Political donations" value={d.disallowable.politicalDonations} onChange={(v) => setIn("disallowable", "politicalDonations", v)} />
              </div>
              <div className="row2">
                <Money label="Personal spending paid by the company" hint="charged as an expense" value={d.disallowable.privateExpenses} onChange={(v) => setIn("disallowable", "privateExpenses", v)} />
                <Money label="Equipment charged as an expense" hint="also enter it under equipment" value={d.disallowable.capitalItemsExpensed} onChange={(v) => setIn("disallowable", "capitalItemsExpensed", v)} />
              </div>
              <div className="row2">
                <Money label="Loss on selling equipment" hint="from the accounts" value={d.disallowable.lossOnDisposals} onChange={(v) => setIn("disallowable", "lossOnDisposals", v)} />
                <Money label="Profit on selling equipment" hint="included in other income" value={d.profitOnDisposals} onChange={(v) => set("profitOnDisposals", v)} />
              </div>
              <Money label="Anything else not allowed" value={d.disallowable.other} onChange={(v) => setIn("disallowable", "other", v)} />
              {d.disallowable.charitableDonations > 0 && (
                <Money label="Charity donations paid to UK charities" hint="these reduce the taxable profit" value={d.qualifyingDonations} onChange={(v) => set("qualifyingDonations", v)} />
              )}
              {long && d.qualifyingDonations > 0 && (
                <Money label={`Of those, paid by ${longDate(ap1.to)}`} hint="donations count in the return for the period they were paid" value={d.donationsInFirstPart} onChange={(v) => set("donationsInFirstPart", v)} />
              )}
              <Money label="Trading losses brought forward" hint="unused losses from earlier years" value={d.tradingLossesBroughtForward} onChange={(v) => set("tradingLossesBroughtForward", v)} />
            </div>
          </div>
        )}

        {step === 3 && !d.dormant && (
          <div className="card">
            <div className="hd"><h3>Equipment and vehicles</h3><span className="note">Capital allowances</span></div>
            <div className="bd">
              <div className="row2">
                <Money label="Main pool brought forward" hint="from last year's computation" value={d.mainPoolBroughtForward} onChange={(v) => set("mainPoolBroughtForward", v)} />
                <Money label="Special rate pool brought forward" value={d.specialPoolBroughtForward} onChange={(v) => set("specialPoolBroughtForward", v)} />
              </div>
              <h4 style={{ margin: "16px 0 6px" }}>Bought this year</h4>
              {d.additions.map((a, n) => (
                <div key={n} className="card" style={{ padding: 12, marginBottom: 8 }}>
                  <div className="row2">
                    <Text label="What" value={a.description} onChange={(v) => set("additions", d.additions.map((x, i) => i === n ? { ...x, description: v } : x))} />
                    <div className="field"><label>Type</label>
                      <select value={a.kind} onChange={(e) => set("additions", d.additions.map((x, i) => i === n ? { ...x, kind: e.target.value as AssetKind } : x))}>
                        {ASSET_KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="row3">
                    <Money label="Cost" value={a.cost} onChange={(v) => set("additions", d.additions.map((x, i) => i === n ? { ...x, cost: v } : x))} />
                    <DateField label="Date bought" value={a.date} onChange={(v) => set("additions", d.additions.map((x, i) => i === n ? { ...x, date: v } : x))} />
                    <div className="field" style={{ display: "flex", alignItems: "flex-end" }}>
                      <button type="button" className="btn ghost sm" onClick={() => set("additions", d.additions.filter((_, i) => i !== n))}>Remove</button>
                    </div>
                  </div>
                </div>
              ))}
              <button type="button" className="btn ghost sm" onClick={() => set("additions", [...d.additions, { description: "", kind: "plantNew", cost: 0, date: props.periodStart }])}>+ Add an item bought</button>

              <h4 style={{ margin: "18px 0 6px" }}>Sold or scrapped this year</h4>
              {d.disposals.map((x, n) => (
                <div key={n} className="card" style={{ padding: 12, marginBottom: 8 }}>
                  <div className="row2">
                    <Text label="What" value={x.description} onChange={(v) => set("disposals", d.disposals.map((y, i) => i === n ? { ...y, description: v } : y))} />
                    <div className="field"><label>It was</label>
                      <select value={x.pool} onChange={(e) => set("disposals", d.disposals.map((y, i) => i === n ? { ...y, pool: e.target.value as DisposalPool } : y))}>
                        {DISPOSAL_POOLS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="row3">
                    <Money label="Sold for" hint="no more than it cost" value={x.proceeds} onChange={(v) => set("disposals", d.disposals.map((y, i) => i === n ? { ...y, proceeds: v } : y))} />
                    <DateField label="Date sold" hint={long ? "needed: it decides which return" : "optional"} value={x.date ?? ""} onChange={(v) => set("disposals", d.disposals.map((y, i) => i === n ? { ...y, date: v || undefined } : y))} />
                    <div className="field" style={{ display: "flex", alignItems: "flex-end" }}>
                      <button type="button" className="btn ghost sm" onClick={() => set("disposals", d.disposals.filter((_, i) => i !== n))}>Remove</button>
                    </div>
                  </div>
                </div>
              ))}
              <button type="button" className="btn ghost sm" onClick={() => set("disposals", [...d.disposals, { description: "", pool: "main", proceeds: 0 }])}>+ Add an item sold</button>

              <div style={{ marginTop: 18 }}>
                <YesNo question="Does the company share the £1 million Annual Investment Allowance with related companies?" value={d.aiaAvailable !== null}
                  onChange={(v) => set("aiaAvailable", v ? (d.aiaAvailable ?? 0) : null)} why="Companies in a group, or under common control in similar businesses, share one allowance." />
                {d.aiaAvailable !== null && <Money label="Allowance this company is using" hint={long ? "for the first 12 months; the short period gets its share by days" : undefined} value={d.aiaAvailable} onChange={(v) => set("aiaAvailable", v)} />}
              </div>
              {live.computed && live.poa.parts.map((part, k) => {
                const ca = part.result.capitalAllowances;
                return (
                  <div key={k} className="banner info" style={{ marginTop: 14 }}>
                    <span>ℹ</span>
                    <span>{long && <>{k === 0 ? "First" : "Second"} return, {longDate(part.from)} to {longDate(part.to)}: </>}<b>Capital allowances: {gbp(ca.totalAllowances)}</b>{ca.totalCharges ? ` · balancing charges ${gbp(ca.totalCharges)}` : ""}
                      {ca.notes.length > 0 && <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>{ca.notes.map((t, i) => <li key={i}>{t}</li>)}</ul>}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {step === 4 && !d.dormant && (() => {
          const setP = (n: number, patch: Partial<ParticipatorAccount>) =>
            set("participators", d.participators.map((x, i) => (i === n ? { ...x, ...patch } : x)));
          const blankPerson = (): ParticipatorAccount => ({ name: "", isDirector: true, openingOwed: 0, openingCredit: 0, advances: 0,
            advancesFrom6April2026: 0, repaid: 0, later: [], interestCharged: false, terms: "" });
          // Only a period that straddles 6 April 2026 needs the split; after it, every loan is at 35.75%.
          const straddles = (a: string, b: string) => a < "2026-04-06" && b >= "2026-04-06";
          const spansHigher = long ? straddles(ap2.from, ap2.to) : straddles(props.periodStart, props.periodEnd);
          const firstSpansHigher = long && straddles(ap1.from, ap1.to);
          const fpOf = (x: ParticipatorAccount): FirstPartLoans => x.firstPart ?? { advances: 0, repaid: 0, advancesFrom6April2026: 0, lastRepaidDate: "" };
          const setFp = (n: number, x: ParticipatorAccount, patch: Partial<FirstPartLoans>) => setP(n, { firstPart: { ...fpOf(x), ...patch } });
          return (
            <div className="card">
              <div className="hd"><h3>Director&apos;s loans</h3><span className="note">Money directors or shareholders borrowed from the company</span></div>
              <div className="bd">
                <p className="note" style={{ marginTop: 0 }}>
                  Add each director or shareholder whose loan account owed the company money at any time this year — money taken out that
                  wasn&apos;t salary, dividends or expenses. Leave this empty if there were none. Money the <i>company</i>{" "}owes them goes on the
                  balance sheet as &ldquo;owed to directors&rdquo; instead.
                </p>
                {d.participators.map((x, n) => (
                  <div key={n} className="card" style={{ padding: 12, marginBottom: 10 }}>
                    <div className="row2">
                      <Text label="Name" value={x.name} onChange={(v) => setP(n, { name: v })} />
                      <div className="field"><label>They are</label>
                        <select value={x.isDirector ? "d" : "s"} onChange={(e) => setP(n, { isDirector: e.target.value === "d" })}>
                          <option value="d">A director (or director and shareholder)</option>
                          <option value="s">A shareholder, or a director&apos;s or shareholder&apos;s relative</option>
                        </select>
                      </div>
                    </div>
                    <div className="row3">
                      <Money label={long ? "Owed at the start of the period" : "Owed at the start of the year"} hint="from earlier years" value={x.openingOwed} onChange={(v) => setP(n, { openingOwed: v })} />
                      <Money label={long ? "Lent to them in the whole period" : "Lent to them this year"} hint="incl. personal costs the company paid" value={x.advances} onChange={(v) => setP(n, { advances: v })} />
                      <Money label={long ? "Repaid during the whole period" : "Repaid during the year"} hint="incl. salary or dividends credited" value={x.repaid} onChange={(v) => setP(n, { repaid: v })} />
                    </div>
                    {long && (() => {
                      const fp = fpOf(x);
                      const repaidAfter = Math.max(0, Math.round(x.repaid) - Math.round(fp.repaid));
                      return (
                        <div style={{ borderLeft: "3px solid var(--border)", paddingLeft: 12, margin: "4px 0 8px" }}>
                          <div className="note" style={{ marginBottom: 4 }}>Of those, in the first 12 months — {longDate(ap1.from)} to {longDate(ap1.to)}:</div>
                          <div className="row3">
                            <Money label="Lent in the first 12 months" value={fp.advances} onChange={(v) => setFp(n, x, { advances: v })} />
                            <Money label="Repaid in the first 12 months" value={fp.repaid} onChange={(v) => setFp(n, x, { repaid: v })} />
                            {repaidAfter > 0 && (
                              <DateField label={`Date of the last repayment after ${shortDate(ap1.to)}`} hint={`the other ${gbp(repaidAfter)}`} value={fp.lastRepaidDate} onChange={(v) => setFp(n, x, { lastRepaidDate: v })} />
                            )}
                          </div>
                          {firstSpansHigher && (
                            <Money label="Of the amount lent in the first 12 months, how much was on or after 6 April 2026?" hint="taxed at 35.75%" value={fp.advancesFrom6April2026} onChange={(v) => setFp(n, x, { advancesFrom6April2026: v })} />
                          )}
                        </div>
                      );
                    })()}
                    {spansHigher && (
                      <Money label={long ? `Of the amount lent after ${shortDate(ap1.to)}, how much was on or after 6 April 2026?` : "Of the amount lent, how much was on or after 6 April 2026?"} hint="taxed at 35.75%" value={x.advancesFrom6April2026} onChange={(v) => setP(n, { advancesFrom6April2026: v })} />
                    )}
                    <Money label="If their account was in credit at the start instead" hint="the company owed them" value={x.openingCredit} onChange={(v) => setP(n, { openingCredit: v })} />
                    <h4 style={{ margin: "10px 0 6px", fontSize: 13 }}>Repaid after {long ? "the period" : "the year"} end (already happened)</h4>
                    {x.later.map((r, k) => (
                      <div className="row3" key={k}>
                        <Money label="Amount" value={r.amount} onChange={(v) => setP(n, { later: x.later.map((y, j) => (j === k ? { ...y, amount: v } : y)) })} />
                        <DateField label="Date" value={r.date} onChange={(v) => setP(n, { later: x.later.map((y, j) => (j === k ? { ...y, date: v } : y)) })} />
                        <div className="field"><label>How</label>
                          <select value={r.how} onChange={(e) => setP(n, { later: x.later.map((y, j) => (j === k ? { ...y, how: e.target.value as "repaid" | "released" } : y)) })}>
                            <option value="repaid">Repaid</option>
                            <option value="released">Written off by the company</option>
                          </select>
                        </div>
                      </div>
                    ))}
                    <button type="button" className="btn ghost sm" onClick={() => setP(n, { later: [...x.later, { amount: 0, date: "", how: "repaid" }] })}>+ Add a repayment after the year end</button>
                    <div style={{ marginTop: 10 }}>
                      <YesNo question="Is interest charged on the loan?" value={x.interestCharged} onChange={(v) => setP(n, { interestCharged: v })} />
                    </div>
                    {x.isDirector && <Text label="Terms, for the accounts" hint="optional" value={x.terms} onChange={(v) => setP(n, { terms: v })} placeholder="The loan is unsecured, interest free and repayable on demand." />}
                    <button type="button" className="btn ghost sm" onClick={() => set("participators", d.participators.filter((_, i) => i !== n))}>Remove this person</button>
                  </div>
                ))}
                <button type="button" className="btn ghost sm" onClick={() => set("participators", [...d.participators, blankPerson()])}>+ Add a director or shareholder</button>
                {(live.hasLoans || live.loanProblems.length > 0) && (
                  <div className={`banner ${live.loanProblems.length ? "bad" : "info"}`} style={{ marginTop: 14 }}>
                    <span>{live.loanProblems.length ? "✕" : "ℹ"}</span>
                    <span>
                      {live.loanProblems.length
                        ? <ul style={{ margin: 0, paddingLeft: 18 }}>{live.loanProblems.map((p, i) => <li key={i}>{p}</li>)}</ul>
                        : <><b>Tax on director&apos;s loans: {gbp(live.poa.loansTax, true)}</b>
                          {long && <> ({live.poa.parts.map((x, k) => `${k === 0 ? "first" : "second"} return ${gbp(x.loans?.a80 ?? 0, true)}`).join(", ")})</>}
                          {" "}· owed to the company at the {long ? "period" : "year"} end {gbp(live.poa.closingLoans?.a75 ?? 0)}
                          {live.poa.warnings.length > 0 && <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>{live.poa.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>}</>}
                    </span>
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {step === 5 && (
          <div className="card">
            <div className="hd"><h3>Last year</h3><span className="note">For the comparative column in the accounts</span></div>
            <div className="bd">
              <YesNo question="Are these the company's first accounts?" value={d.prior === null}
                onChange={(first) => set("prior", first ? null : (d.prior ?? { from: "", to: "", figures: { turnover: 0, otherIncome: 0, rawMaterials: 0, staffCosts: 0, depreciation: 0, otherCharges: 0, profitBeforeTax: 0, tax: 0, shareCapitalNotPaid: 0, fixedAssets: 0, currentAssets: 0, prepayments: 0, creditorsWithin: 0, creditorsAfter: 0, provisions: 0, accruals: 0, employees: 0 } }))}
                why="Accounts show last year's figures beside this year's, except a company's very first accounts." />
              {d.prior && (() => {
                const p = d.prior!, f = p.figures;
                const setP = (k: keyof typeof f, v: number) => set("prior", { ...p, figures: { ...f, [k]: v } });
                return (
                  <>
                    <p className="note">Copy these from last year&apos;s filed accounts.</p>
                    <div className="row2">
                      <DateField label="Last year started" value={p.from} onChange={(v) => set("prior", { ...p, from: v })} />
                      <DateField label="Last year ended" value={p.to} onChange={(v) => set("prior", { ...p, to: v })} />
                    </div>
                    <div className="row3">
                      <Money label="Turnover" value={f.turnover} onChange={(v) => setP("turnover", v)} />
                      <Money label="Other income" value={f.otherIncome} onChange={(v) => setP("otherIncome", v)} />
                      <Money label="Raw materials / cost of goods" value={f.rawMaterials} onChange={(v) => setP("rawMaterials", v)} />
                    </div>
                    <div className="row3">
                      <Money label="Staff costs" value={f.staffCosts} onChange={(v) => setP("staffCosts", v)} />
                      <Money label="Depreciation" value={f.depreciation} onChange={(v) => setP("depreciation", v)} />
                      <Money label="Other charges" value={f.otherCharges} onChange={(v) => setP("otherCharges", v)} />
                    </div>
                    <div className="row3">
                      <Money label="Profit before tax" value={f.profitBeforeTax} onChange={(v) => setP("profitBeforeTax", v)} />
                      <Money label="Tax" value={f.tax} onChange={(v) => setP("tax", v)} />
                      <Whole label="Employees" value={f.employees} onChange={(v) => setP("employees", v)} />
                    </div>
                    <div className="row3">
                      <Money label="Fixed assets" value={f.fixedAssets} onChange={(v) => setP("fixedAssets", v)} />
                      <Money label="Current assets" value={f.currentAssets} onChange={(v) => setP("currentAssets", v)} />
                      <Money label="Creditors within one year" value={f.creditorsWithin} onChange={(v) => setP("creditorsWithin", v)} />
                    </div>
                    <div className="row3">
                      <Money label="Creditors after one year" value={f.creditorsAfter} onChange={(v) => setP("creditorsAfter", v)} />
                      <Money label="Provisions" value={f.provisions} onChange={(v) => setP("provisions", v)} />
                      <Money label="Prepayments" value={f.prepayments} onChange={(v) => setP("prepayments", v)} />
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        )}

        {step === 6 && (
          <div className="card">
            <div className="hd"><h3>Balance sheet</h3><span className="note">At {longDate(props.periodEnd)}{long ? ", the end of the accounts" : ""}</span></div>
            <div className="bd">
              {d.dormant && (
                <p className="note" style={{ marginTop: 0 }}>
                  A dormant company&apos;s balance sheet is usually just its shares: for 100 shares of £1 not yet paid for, enter 100 as share capital and 100 as share capital not paid;
                  if they were paid into the bank, enter the 100 as cash instead.
                </p>
              )}
              {d.dormant ? (
                <>
                  <div className="row3">
                    <Money label="Share capital" hint="e.g. 100 shares of £1 = 100" value={d.balanceSheet.shareCapital} onChange={(v) => setIn("balanceSheet", "shareCapital", v)} />
                    <Money label="Share capital not paid" hint="shares issued but not yet paid for" value={d.balanceSheet.shareCapitalNotPaid} onChange={(v) => setIn("balanceSheet", "shareCapitalNotPaid", v)} />
                    <Money label="Cash at bank" value={d.balanceSheet.cash} onChange={(v) => setIn("balanceSheet", "cash", v)} />
                  </div>
                  <div className="row3">
                    <Money label="Owed to the company" hint="e.g. by a shareholder" value={d.balanceSheet.debtors} onChange={(v) => setIn("balanceSheet", "debtors", v)} />
                    <Money label="Owed by the company" value={d.balanceSheet.creditorsWithin} onChange={(v) => setIn("balanceSheet", "creditorsWithin", v)} />
                    <Money label="Owed to directors" hint="e.g. Companies House fees they paid" value={d.balanceSheet.owedToDirectors} onChange={(v) => setIn("balanceSheet", "owedToDirectors", v)} />
                  </div>
                  <Money label="Reserves at the start of the year" hint="only if it traded before; a minus number for losses" value={d.balanceSheet.reservesBroughtForward} onChange={(v) => setIn("balanceSheet", "reservesBroughtForward", v)} />
                </>
              ) : (() => {
                const b = d.balanceSheet, a75 = live.poa.closingLoans?.a75 ?? 0, ct = Math.round(live.poa.corporationTax);
                const has = b.fixedAssets + b.stock + b.debtors + b.cash + b.prepayments + b.shareCapitalNotPaid + a75;
                const owes = b.creditorsWithin + b.owedToDirectors + b.creditorsAfter + b.provisions + (live.computed ? ct : 0);
                return (
                  <>
                    <div className="bsgroup">
                      <h5><span>What the company has</span><b>{gbp(has)}</b></h5>
                      <div className="row3">
                        <Money label="Cash at bank" hint="every account, at the year end" value={b.cash} onChange={(v) => setIn("balanceSheet", "cash", v)} />
                        <Money label="Owed to the company" hint="customers, payouts due, VAT refund" value={b.debtors} onChange={(v) => setIn("balanceSheet", "debtors", v)} />
                        <Money label="Stock" hint="unsold goods, at cost" value={b.stock} onChange={(v) => setIn("balanceSheet", "stock", v)} />
                      </div>
                      <div className="row2">
                        <Money label="Equipment and vehicles" hint="value in the books" value={b.fixedAssets} onChange={(v) => setIn("balanceSheet", "fixedAssets", v)} />
                        <Money label="Prepayments" hint="paid in advance, if not above" value={b.prepayments} onChange={(v) => setIn("balanceSheet", "prepayments", v)} />
                      </div>
                      {a75 > 0 && <p className="note" style={{ margin: 0 }}>Includes {gbp(a75)} the directors owe the company, from the director&apos;s loans step.</p>}
                    </div>
                    <div className="bsgroup">
                      <h5><span>What the company owes</span><b>{gbp(owes)}</b></h5>
                      <div className="row2">
                        <Money label="Owed by the company" hint="suppliers, loans, VAT — not tax or directors" value={b.creditorsWithin} onChange={(v) => setIn("balanceSheet", "creditorsWithin", v)} />
                        <Money label="Owed to directors" hint="director's loan account in credit" value={b.owedToDirectors} onChange={(v) => setIn("balanceSheet", "owedToDirectors", v)} />
                      </div>
                      <div className="row2">
                        <Money label="Loans due after a year" value={b.creditorsAfter} onChange={(v) => setIn("balanceSheet", "creditorsAfter", v)} />
                        <Money label="Provisions" value={b.provisions} onChange={(v) => setIn("balanceSheet", "provisions", v)} />
                      </div>
                      {live.computed && ct > 0 && <p className="note" style={{ margin: 0 }}>Includes this year&apos;s Corporation Tax of {gbp(ct)}, which Nucta File adds for you.</p>}
                    </div>
                    <div className="bsgroup">
                      <h5><span>Shares and reserves</span>{live.acc && <b>{gbp(live.acc.capitalAndReserves)}</b>}</h5>
                      <div className="row3">
                        <Money label="Share capital" hint="e.g. 100 shares of £1 = 100" value={b.shareCapital} onChange={(v) => setIn("balanceSheet", "shareCapital", v)} />
                        <Money label="Reserves at the start of the year" hint="minus for losses" value={b.reservesBroughtForward} onChange={(v) => setIn("balanceSheet", "reservesBroughtForward", v)} />
                        <Money label="Dividends paid this year" value={b.dividendsPaid} onChange={(v) => setIn("balanceSheet", "dividendsPaid", v)} />
                      </div>
                      <div className="row3">
                        <Money label="Share capital not paid" hint="usually nothing" value={b.shareCapitalNotPaid} onChange={(v) => setIn("balanceSheet", "shareCapitalNotPaid", v)} />
                      </div>
                      {live.acc && <p className="note" style={{ margin: 0 }}>Includes this year&apos;s {live.acc.profitAfterTax < 0 ? "loss" : "profit"} after tax of {gbp(Math.abs(live.acc.profitAfterTax))}, from the profit and loss step.</p>}
                    </div>
                  </>
                );
              })()}
              <Whole label="Average number of employees" hint="including paid directors" value={d.balanceSheet.employees} onChange={(v) => setIn("balanceSheet", "employees", v)} />
              {d.dormant && (live.poa.closingLoans?.a75 ?? 0) > 0 && <p className="note">Also counted as owed to the company: {gbp(live.poa.closingLoans!.a75)} from director&apos;s loans (the director&apos;s loans step).</p>}
              {live.computed && live.acc && (() => {
                const diff = live.acc.netAssets - live.acc.capitalAndReserves;
                return (
                  <div className={`banner ${Math.abs(diff) < 1 ? "good" : "warn"}`} style={{ marginTop: 12 }}>
                    <span>{Math.abs(diff) < 1 ? "✓" : "⚠"}</span>
                    <span>
                      {Math.abs(diff) < 1
                        ? <b>The balance sheet balances: net assets {gbp(live.acc.netAssets)}.</b>
                        : <><b>Out by {gbp(Math.abs(diff))}.</b> What the company has, less what it owes, comes to {gbp(live.acc.netAssets)}; shares and reserves come to {gbp(live.acc.capitalAndReserves)}.
                          <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>{balanceHints(diff, d.balanceSheet, live.acc.profitBeforeTax).map((h, i) => <li key={i}>{h}</li>)}</ul></>}
                    </span>
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {step === 7 && (
          <div className="card">
            <div className="hd"><h3>Approval</h3></div>
            <div className="bd">
              <div className="row2">
                <Text label="Director approving the accounts" value={d.director} onChange={(v) => set("director", v)} />
                <DateField label="Date the board approved them" hint="after the year end" value={d.approvedOn} onChange={(v) => set("approvedOn", v)} />
              </div>
              <div className="row2">
                <Text label="Person making the declaration" hint="the name on the return" value={d.declarantName} onChange={(v) => set("declarantName", v)} />
                <div className="field"><label>Their role</label>
                  <select value={d.declarantStatus} onChange={(e) => set("declarantStatus", e.target.value)}>
                    {["Director", "Company secretary", "Agent", "Proper officer"].map((s) => <option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>
            </div>
          </div>
        )}
        {step === 7 && (
          <OnlineApproval returnId={props.id} director={d.director} saveFirst={async () => { const r = await saveReturn(props.id, d); if (!r.ok) setSaved(r.error ?? "Couldn't save."); return r.ok; }} />
        )}

        {step === 8 && (
          <div className="card">
            <div className="hd"><h3>Review and file</h3>{long && <span className="note">Two returns, one after the other</span>}</div>
            <div className="bd">
              {!preview && <p className="note">{pending ? "Checking…" : "Press Check to build the return."}</p>}
              {preview && preview.problems.length > 0 && (
                <div className="banner bad"><span>✕</span><span><b>Not ready yet.</b>
                  <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>{preview.problems.map((p, i) => <li key={i}>{p}</li>)}</ul></span></div>
              )}
              {preview && preview.warnings.length > 0 && (
                <div className="banner warn"><span>⚠</span><span><ul style={{ margin: 0, paddingLeft: 18 }}>{preview.warnings.map((p, i) => <li key={i}>{p}</li>)}</ul></span></div>
              )}
              {preview && d.dormant && d.ctNoticeReceived === false && (
                <div className="banner info"><span>ℹ</span><span>
                  <b>HMRC don&apos;t need a return for this dormant company</b>, as they haven&apos;t sent a notice to file one. The dormant accounts below
                  go to Companies House. The nil return is ready if HMRC ask for it later — it can be tested now, and filed then.
                </span></div>
              )}
              {preview && preview.parts.length > 0 && preview.filingDue && (
                <p className="note" style={{ marginTop: 0 }}>
                  {preview.long ? "Both returns are" : "The return is"} due at HMRC by <b>{longDate(preview.filingDue)}</b>
                  {preview.amended ? <>; amendments can be made until <b>{longDate(preview.amendBy)}</b></> : null}.
                  {preview.ok && <> Check the figures and the documents, then file {preview.long ? "them" : "it"} below with the company&apos;s or agent&apos;s HMRC sign-in.</>}
                </p>
              )}
              {preview?.parts.map((pt, n) => {
                return (
                  <div key={n} className="card" style={{ padding: 12, marginBottom: 12 }}>
                    {preview.long && (
                      <h4 style={{ margin: "0 0 8px" }}>
                        {n === 0 ? "First" : "Second"} return: {longDate(pt.periodFrom)} to {longDate(pt.periodTo)} <span className="note">({pt.days} days)</span>
                      </h4>
                    )}
                    <div className="grid2" style={{ marginBottom: 8 }}>
                      <div>
                        <div className="kv"><span className="k">Profit before tax{preview.long ? ", this period's share" : " (accounts)"}</span><span className="v">{gbp(pt.summary.accountingProfit)}</span></div>
                        <div className="kv"><span className="k">{pt.summary.tradingLoss ? "Trading loss" : "Trading profit"}</span><span className="v">{gbp(pt.summary.tradingLoss || pt.summary.tradingProfit)}</span></div>
                        <div className="kv"><span className="k">Profits chargeable</span><span className="v">{gbp(pt.summary.chargeableProfits)}</span></div>
                      </div>
                      <div>
                        <div className="kv"><span className="k">Corporation Tax</span><span className="v">{gbp(pt.summary.corporationTax, true)}</span></div>
                        {pt.summary.marginalRelief > 0 && <div className="kv"><span className="k">Marginal relief</span><span className="v">−{gbp(pt.summary.marginalRelief, true)}</span></div>}
                        <div className="kv"><span className="k"><b>{pt.loans ? "Corporation Tax payable" : "Tax payable"}</b></span><span className="v"><b>{gbp(pt.summary.taxChargeable, true)}</b></span></div>
                        {pt.loans && <>
                          <div className="kv"><span className="k">Tax on director&apos;s loans</span><span className="v">{gbp(pt.loans.a80, true)}</span></div>
                          <div className="kv"><span className="k"><b>Total payable</b></span><span className="v"><b>{gbp(pt.summary.taxChargeable + pt.loans.a80, true)}</b></span></div>
                        </>}
                        <div className="kv"><span className="k">Due by</span><span className="v">{longDate(pt.taxDue)}</span></div>
                      </div>
                    </div>
                    {preview.amended && pt.changed === false && (
                      <p className="note">This return is the same as the one HMRC already have, so it doesn&apos;t need sending again.</p>
                    )}
                    {preview.ok && pt.sent && (pt.sent.status === "accepted" || pt.sent.status === "submitted-live") && (
                      <p className="note"><b>{pt.sent.status === "accepted" ? "Filed with HMRC" : "Sent to HMRC, waiting for their answer"}</b> on {new Date(pt.sent.at).toLocaleString("en-GB")}{pt.sent.correlationId ? ` · correlation ID ${pt.sent.correlationId}` : ""}.</p>
                    )}
                  </div>
                );
              })}
              {preview?.ok && (
                <LiveFiling returnId={props.id} preview={preview} onFiled={() => start(async () => setPreview(await previewReturn(props.id)))}
                  onTest={send} testResults={sent} testing={sending}
                  refreshKey={`${props.status}|${preview.parts.map((x) => x.sent?.status ?? "").join(",")}|${Object.entries(sent).map(([k, v]) => `${k}:${v.outcome}`).join(",")}`} />
              )}
              {preview?.ok && preview.companiesHouse && <CompaniesHouseAccounts returnId={props.id} form={preview.companiesHouse} />}
              {preview?.ok && (() => {
                const base = `/returns/${props.id}/documents`;
                const many = preview.parts.length > 1;
                const link = (href: string, text: string) => <a className="btn ghost sm" href={`${base}/${href}`} target="_blank" rel="noreferrer">{text}</a>;
                return (
                  <div className="card doclist" style={{ padding: "4px 12px", marginBottom: 12 }}>
                    <div className="row">
                      <div className="what"><div className="t">Approval pack for {preview.director || "the director"}</div><div className="d">One PDF: a page to sign, the accounts, the computation{many ? "s" : ""} and the CT600{many ? "s" : ""}</div></div>
                      <a className="btn sm" href={`${base}/approval-pack.pdf`} target="_blank" rel="noreferrer">Download PDF</a>
                    </div>
                    <div className="row">
                      <div className="what"><div className="t">Accounts</div><div className="d">Micro-entity accounts, {longDate(props.periodStart)} to {longDate(props.periodEnd)}</div></div>
                      {link("accounts.html", "View")}{link("accounts.pdf", "PDF")}{link("accounts.xhtml", "iXBRL")}
                    </div>
                    <div className="row">
                      <div className="what"><div className="t">Accounts for Companies House</div><div className="d">Balance sheet and notes, without the profit and loss account</div></div>
                      {link("accounts-ch.html", "View")}{link("accounts-ch.pdf", "PDF")}
                    </div>
                    {preview.parts.map((pt, n) => (
                      <div key={n}>
                        {pt.computationHtml && (
                          <div className="row">
                            <div className="what"><div className="t">Computation{many ? ` ${n + 1}` : ""}</div><div className="d">{longDate(pt.periodFrom)} to {longDate(pt.periodTo)}</div></div>
                            {link(`computation-${n + 1}.html`, "View")}{link(`computation-${n + 1}.pdf`, "PDF")}{link(`computation-${n + 1}.xhtml`, "iXBRL")}
                          </div>
                        )}
                        <div className="row">
                          <div className="what"><div className="t">CT600{many ? ` ${n + 1}` : ""}</div><div className="d">Every box, as {pt.sent?.status === "accepted" ? "filed" : pt.sent?.status === "accepted-test" ? "accepted by the test service" : "it would be sent"}</div></div>
                          {link(`ct600-${n + 1}.html`, "View")}{link(`ct600-${n + 1}.pdf`, "PDF")}{link(`ct600-${n + 1}.xml`, "XML")}
                          {pt.sent && link(`submission-${n + 1}.xml`, "Submission sent")}
                          {pt.sent?.status === "accepted" && link(`receipt-${n + 1}.pdf`, "HMRC receipt")}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
              {preview?.ok && (
                <>
                  <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                    {preview.parts.map((pt, n) => pt.computationHtml && (
                      <button key={n} type="button" className={`btn sm ${doc === n ? "" : "ghost"}`} onClick={() => setDoc(n)}>
                        {preview.long ? `Computation ${n + 1} (to ${shortDate(pt.periodTo)})` : "The computation"}
                      </button>
                    ))}
                    <button type="button" className={`btn sm ${doc === "accounts" ? "" : "ghost"}`} onClick={() => setDoc("accounts")}>The accounts</button>
                  </div>
                  <iframe title={String(doc)} srcDoc={(doc === "accounts" ? preview.accountsHtml : preview.parts[doc]?.computationHtml ?? preview.accountsHtml) ?? ""} className="doc" />
                </>
              )}
              {props.submissions.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div className="note">Earlier sends of this return</div>
                  {props.submissions.map((s, i) => (
                    <div className="kv" key={i}><span className="k mono">{new Date(s.at).toLocaleString("en-GB")}{s.test ? " · test" : " · LIVE"}{s.period ? ` · ${s.period}` : ""}</span><span className="v">{s.outcome}</span></div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {live.problems.length > 0 && step < 8 && (
          <div className="banner warn"><span>⚠</span><span><ul style={{ margin: 0, paddingLeft: 18 }}>{live.problems.map((p, i) => <li key={i}>{p}</li>)}</ul></span></div>
        )}

        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6 }}>
          {step > 0 && <button type="button" className="btn ghost" disabled={pending} onClick={() => save(step - 1)}>Back</button>}
          {step < 7 && <button type="button" className="btn" disabled={pending} onClick={() => save(step + 1)}>Save and continue</button>}
          {step === 7 && <button type="button" className="btn" disabled={pending} onClick={() => { setStep(8); check(); }}>Save and review</button>}
          {step === 8 && <button type="button" className="btn ghost" disabled={pending} onClick={check}>Check again</button>}
          {saved && <span className="note">{saved}</span>}
        </div>
      </div>
    </>
  );
}



function shortDate(iso: string): string {
  const d = new Date(iso + "T12:00:00Z");
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * Likely reasons the balance sheet is out, from the size of the difference:
 * a figure on the wrong side shows up as exactly twice that figure.
 */
function balanceHints(diff: number, b: ReturnData["balanceSheet"], profit: number): string[] {
  const near = (x: number) => Math.abs(diff - x) < 1.5;
  const money = (n: number) => `£${Math.abs(n).toLocaleString("en-GB")}`;
  const hints: string[] = [];
  if (b.debtors > 0 && near(2 * b.debtors)) hints.push(`Is the ${money(b.debtors)} in “Owed to the company” really money the company owes? If so, move it to “Owed by the company”.`);
  if (b.creditorsWithin > 0 && near(-2 * b.creditorsWithin)) hints.push(`Is the ${money(b.creditorsWithin)} in “Owed by the company” really money owed to the company? If so, move it to “Owed to the company”.`);
  if (b.reservesBroughtForward && near(-2 * b.reservesBroughtForward)) hints.push(`Check the sign of “Reserves at the start of the year”: a loss from earlier years is a minus number, like -${money(b.reservesBroughtForward).slice(1)}.`);
  if (b.dividendsPaid > 0 && near(2 * b.dividendsPaid)) hints.push("Check the dividends: enter them once, as dividends paid, not also as money owed to the company.");
  if (Math.abs(diff) <= 2) hints.push("A difference this small is usually rounding: make sure every figure is in whole pounds.");
  else if (hints.length === 0) hints.push(`A figure on the wrong side — something the company owes entered as something it has, or the other way round — puts it out by twice that figure. Look for £${Math.abs(diff / 2).toLocaleString("en-GB", { maximumFractionDigits: 0 })} in the wrong box.`);
  hints.push(`The reserves include the ${profit < 0 ? "loss" : "profit"} from the profit and loss step (${money(profit)} before tax). If that step isn't finished, this side will change.`);
  hints.push("Otherwise, check the cash at the year end (every bank account), what's owed each way, and last year's reserves.");
  return hints;
}

function longDate(iso: string): string {
  const d = new Date(iso + "T12:00:00Z");
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}
