/**
 * The CT600 built from the tax engine's computation.
 *
 * The test console's builder (buildCt600) takes figures typed in by hand and
 * is kept unchanged, because five returns built by it have been accepted by
 * HMRC. This builder takes the engine's result instead, so every box comes
 * from the same calculation as the computation document attached to it.
 *
 * Element names and order follow HMRC's schema CT-2014-v1-994. The business
 * rules each box has to satisfy are cited beside it.
 */

import { esc, money, nestable, rate, ymd } from "./ct600-xml";
import type { ComputationResult } from "./tax/computation";
import type { LoansResult } from "./tax/directors-loans";

export interface ReturnParty {
  companyName: string;
  companyNo: string;
  utr: string;
  periodFrom: string;
  periodTo: string;
  associatedCompanies: number;
  turnover: number;
  declarantName: string;
  declarantStatus: string;
}

export interface ReturnDocuments {
  accountsIxbrl: string;
  computationIxbrl: string;
}

/**
 * From 1 April 2026 the return's zero-emission car box (726) is closed to new
 * claims — HMRC's rule F252.0 was written before the allowance was extended
 * to 31 March 2027 — and HMRC suggest reporting such claims under other
 * allowances (box 725) until the form is updated (ATT, 2026).
 */
const ZERO_EMISSION_BOX_CLOSED_FROM = "2026-04-01";

export function buildCt600FromComputation(p: ReturnParty, r: ComputationResult, docs: ReturnDocuments, loans?: LoansResult | null): string {
  const ct600a = Boolean(loans?.needed);
  const L: string[] = [];
  const o = (s: string) => L.push(s);
  const ca = r.capitalAllowances;

  o(`<CompanyTaxReturn ReturnType="new">`);
  o(`  <CompanyInformation>`);
  o(`    <CompanyName>${esc(p.companyName)}</CompanyName>`);
  o(`    <RegistrationNumber>${esc(p.companyNo.trim().toUpperCase())}</RegistrationNumber>`);
  o(`    <Reference>${esc(p.utr.replace(/\s/g, ""))}</Reference>`);
  o(`    <CompanyType>0</CompanyType>`);
  o(`    <PeriodCovered>`);
  o(`      <From>${ymd(p.periodFrom)}</From>`);
  o(`      <To>${ymd(p.periodTo)}</To>`);
  o(`    </PeriodCovered>`);
  o(`  </CompanyInformation>`);
  o(`  <ReturnInfoSummary>`);
  o(`    <Accounts>`);
  o(`      <ThisPeriodAccounts>yes</ThisPeriodAccounts>`);
  o(`    </Accounts>`);
  o(`    <Computations>`);
  o(`      <ThisPeriodComputations>yes</ThisPeriodComputations>`);
  o(`    </Computations>`);
  // Box 95: the CT600A page is included (rules N030.0, N095.0).
  if (ct600a) {
    o(`    <SupplementaryPages>`);
    o(`      <CT600A>yes</CT600A>`);
    o(`    </SupplementaryPages>`);
  }
  o(`  </ReturnInfoSummary>`);
  o(`  <Turnover>`);
  o(`    <Total>${money(p.turnover)}</Total>`);
  o(`  </Turnover>`);

  o(`  <CompanyTaxCalculation>`);
  o(`    <Income>`);
  o(`      <Trading>`);
  o(`        <Profits>${money(r.tradingProfit)}</Profits>`);
  // Rule 9150: box 160 only when box 155 is above zero; 165 likewise.
  if (r.tradingProfit > 0) {
    o(`        <LossesBroughtForward>${money(r.lossesUsed)}</LossesBroughtForward>`);
    o(`        <NetProfits>${money(r.netTradingProfit)}</NetProfits>`);
  }
  o(`      </Trading>`);
  // Box 170: bank and other interest, profits from non-trading loan relationships.
  if (r.nonTradingInterest > 0) o(`      <NonTradingLoanProfitsAndGains>${money(r.nonTradingInterest)}</NonTradingLoanProfitsAndGains>`);
  o(`    </Income>`);
  if (r.profitsBeforeDeductions > 0) {
    // Box 235 = 165 + 170 (rule F014.1), required when 170 is above zero (F014.3).
    o(`    <ProfitsBeforeOtherDeductions>${money(r.profitsBeforeDeductions)}</ProfitsBeforeOtherDeductions>`);
    o(`    <ChargesAndReliefs>`);
    // Box 300; with it present, 315 = 300 − 305 (rule F022.3).
    o(`      <ProfitsBeforeDonationsAndGroupRelief>${money(r.profitsBeforeDeductions)}</ProfitsBeforeDonationsAndGroupRelief>`);
    if (r.qualifyingDonations > 0) o(`      <QualifyingDonations>${money(r.qualifyingDonations)}</QualifyingDonations>`);
    o(`    </ChargesAndReliefs>`);
  }
  o(`    <ChargeableProfits>${money(r.chargeableProfits)}</ChargeableProfits>`);

  if (r.chargeableProfits > 0) {
    o(`    <CorporationTaxChargeable>`);
    // Box 329: needed for the small profits rate or marginal relief.
    if (r.smallProfitsRateOrMarginalRelief) {
      o(`      <AssociatedCompanies>`);
      o(`        <ThisPeriod>${Math.max(0, Math.round(p.associatedCompanies))}</ThisPeriod>`);
      o(`        <StartingOrSmallCompaniesRate>yes</StartingOrSmallCompaniesRate>`);
      o(`      </AssociatedCompanies>`);
    }
    // One block per financial year. A period straddling 1 April needs the
    // second (rule F900.0), with profits split by days (F032.4) — which is
    // how the engine apportions them — and each year's tax equal to its
    // profit × rate (F035, F042).
    r.years.forEach((y, n) => {
      const tag = n === 0 ? "FinancialYearOne" : "FinancialYearTwo";
      o(`      <${tag}>`);
      o(`        <Year>${y.fy}</Year>`);
      o(`        <Details>`);
      o(`          <Profit>${money(y.profits)}</Profit>`);
      o(`          <TaxRate>${rate(y.band === "small" ? 19 : 25)}</TaxRate>`);
      o(`          <Tax>${money(y.grossTax)}</Tax>`);
      o(`        </Details>`);
      o(`      </${tag}>`);
    });
    o(`    </CorporationTaxChargeable>`);
  }
  // Box 430 = the years' tax added up (F046.0).
  o(`    <CorporationTax>${money(r.corporationTax)}</CorporationTax>`);
  // Box 435, non-zero type, so absent without relief.
  if (r.marginalRelief > 0) o(`    <MarginalReliefForRingFenceTrades>${money(r.marginalRelief)}</MarginalReliefForRingFenceTrades>`);
  // Box 440 = 430 − 435 (F220.3).
  o(`    <NetCorporationTaxChargeable>${money(r.taxChargeable)}</NetCorporationTaxChargeable>`);
  o(`    <TaxReliefsAndDeductions>`);
  o(`      <TotalReliefsAndDeductions>${money(0)}</TotalReliefsAndDeductions>`);
  o(`    </TaxReliefsAndDeductions>`);
  o(`  </CompanyTaxCalculation>`);

  // Box 480 = A80 (rule SA078.1), only with the CT600A (F097.0); 510 = 475 + 480 (F093.1).
  const s455 = ct600a ? loans!.a80 : 0;
  const total = Math.round((r.taxChargeable + s455) * 100) / 100;
  o(`  <CalculationOfTaxOutstandingOrOverpaid>`);
  o(`    <NetCorporationTaxLiability>${money(r.taxChargeable)}</NetCorporationTaxLiability>`);
  if (ct600a) o(`    <LoansToParticipators>${money(s455)}</LoansToParticipators>`);
  o(`    <TaxChargeable>${money(total)}</TaxChargeable>`);
  o(`    <TaxPayable>${money(total)}</TaxPayable>`);
  o(`  </CalculationOfTaxOutstandingOrOverpaid>`);

  // Capital allowances and charges included in the trading profit (boxes 688–730).
  const pair = (tag: string, charge: number, allowance: number) => {
    if (!charge && !allowance) return;
    o(`    <${tag}>`);
    if (charge) o(`      <BalancingCharges>${money(charge)}</BalancingCharges>`);
    if (allowance) o(`      <CapitalAllowances>${money(allowance)}</CapitalAllowances>`);
    o(`    </${tag}>`);
  };
  const zecInOthers = p.periodFrom >= ZERO_EMISSION_BOX_CLOSED_FROM;
  if (ca.totalAllowances || ca.totalCharges) {
    o(`  <AllowancesAndCharges>`);
    pair("FullExpensing", ca.fullExpensingCharge, ca.fullExpensing);                 // 688/689
    if (ca.aia) o(`    <AIACapitalAllowancesInc>${money(ca.aia)}</AIACapitalAllowancesInc>`); // 690
    pair("MachineryAndPlantSpecialRatePool", ca.special.balancingCharge, ca.special.allowance); // 695/700
    pair("MachineryAndPlantMainPool", ca.main.balancingCharge, ca.main.allowance);   // 705/710
    if (!zecInOthers) pair("ZeroEmissionsCars", 0, ca.zeroEmissionCars);              // 726/727
    if (zecInOthers) pair("Others", 0, ca.zeroEmissionCars);                         // 725/730
    o(`  </AllowancesAndCharges>`);
  }
  // Qualifying expenditure in the period (boxes 760, 770, 775).
  const fya = ca.fullExpensing + ca.zeroEmissionCars;
  const longLife = ca.expenditure.specialRate;
  const other = ca.expenditure.total - fya - longLife;
  if (ca.expenditure.total > 0) {
    o(`  <QualifyingExpenditure>`);
    if (fya) o(`    <MachineryAndPlantExpenditure>${money(fya)}</MachineryAndPlantExpenditure>`);
    if (longLife) o(`    <MachineryAndPlantLongLife>${money(longLife)}</MachineryAndPlantLongLife>`);
    if (other) o(`    <OtherMachineryAndPlant>${money(other)}</OtherMachineryAndPlant>`);
    o(`  </QualifyingExpenditure>`);
  }

  // Box 780: a trading loss arising in the period.
  if (r.tradingLoss > 0) {
    o(`  <LossesDeficitsAndExcess>`);
    o(`    <AmountArising>`);
    o(`      <LossesOfTradesUK>`);
    o(`        <Arising>${money(r.tradingLoss)}</Arising>`);
    o(`      </LossesOfTradesUK>`);
    o(`    </AmountArising>`);
    o(`  </LossesDeficitsAndExcess>`);
  }

  o(`  <Declaration>`);
  o(`    <AcceptDeclaration>yes</AcceptDeclaration>`);
  o(`    <Name>${esc(p.declarantName)}</Name>`);
  o(`    <Status>${esc(p.declarantStatus)}</Status>`);
  o(`  </Declaration>`);

  // The CT600A supplementary page (schema type CTA), after the declaration.
  if (ct600a) {
    const l = loans!;
    o(`  <LoansByCloseCompanies>`);
    // A5: loans were made in the period and all were repaid, released or written off before it ended.
    o(`    <BeforeEndPeriod>${l.allClearedBeforeEnd ? "yes" : "no"}</BeforeEndPeriod>`);
    if (l.a15 > 0) {
      o(`    <LoansInformation>`);
      for (const x of l.people.filter((x) => x.newOutstanding > 0)) {
        o(`      <Loan>`);
        o(`        <Name>${esc(x.name)}</Name>`);                                 // A10A
        o(`        <AmountOfLoan>${money(x.newOutstanding)}</AmountOfLoan>`);     // A10B
        o(`      </Loan>`);
      }
      o(`      <TotalLoans>${money(l.a15)}</TotalLoans>`);                          // A15 = Σ A10B (SA012)
      o(`      <TaxChargeable>${money(l.a20)}</TaxChargeable>`);                   // A20 = A15 × rate (SA014)
      o(`    </LoansInformation>`);
    }
    if (l.a40 > 0) {
      o(`    <ReliefEarlierThan>`);
      for (const x of l.people) for (const rr of x.relief) {
        o(`      <Loan>`);
        o(`        <Name>${esc(x.name)}</Name>`);                                 // A25A
        if (rr.how === "repaid") o(`        <AmountRepaid>${money(rr.amount)}</AmountRepaid>`); // A25B
        else o(`        <AmountReleasedOrWrittenOff>${money(rr.amount)}</AmountReleasedOrWrittenOff>`); // A25C
        o(`        <Date>${ymd(rr.date)}</Date>`);                                // A25D (SA018)
        o(`      </Loan>`);
      }
      if (l.a30 > 0) o(`      <TotalAmountRepaid>${money(l.a30)}</TotalAmountRepaid>`);              // A30
      if (l.a35 > 0) o(`      <TotalAmountReleasedOrWritten>${money(l.a35)}</TotalAmountReleasedOrWritten>`); // A35
      o(`      <TotalLoans>${money(l.a40)}</TotalLoans>`);                          // A40 = A30 + A35
      o(`      <ReliefDue>${money(l.a45)}</ReliefDue>`);                           // A45 = A40 × rate, ≤ A20
      o(`    </ReliefEarlierThan>`);
    }
    if (l.a75 > 0) o(`    <TotalLoansOutstanding>${money(l.a75)}</TotalLoansOutstanding>`); // A75
    o(`    <TaxPayable>${money(l.a80)}</TaxPayable>`);                             // A80 = A20 − A45
    o(`  </LoansByCloseCompanies>`);
  }

  // Computation first, then accounts, in one XBRLsubmission — the layout of
  // the returns HMRC accepted on build 30.
  o(`  <AttachedFiles>`);
  o(`    <XBRLsubmission>`);
  for (const [tag, doc] of [["Computation", docs.computationIxbrl], ["Accounts", docs.accountsIxbrl]] as const) {
    o(`      <${tag}>`);
    o(`        <Instance>`);
    o(`          <InlineXBRLDocument>`);
    o(nestable(doc));
    o(`          </InlineXBRLDocument>`);
    o(`        </Instance>`);
    o(`      </${tag}>`);
  }
  o(`    </XBRLsubmission>`);
  o(`  </AttachedFiles>`);
  o(`</CompanyTaxReturn>`);
  return L.join("\n");
}
