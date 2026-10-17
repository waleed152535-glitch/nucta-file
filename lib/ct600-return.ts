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

export function buildCt600FromComputation(p: ReturnParty, r: ComputationResult, docs: ReturnDocuments): string {
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

  o(`  <CalculationOfTaxOutstandingOrOverpaid>`);
  o(`    <NetCorporationTaxLiability>${money(r.taxChargeable)}</NetCorporationTaxLiability>`);
  o(`    <TaxChargeable>${money(r.taxChargeable)}</TaxChargeable>`);
  o(`    <TaxPayable>${money(r.taxChargeable)}</TaxPayable>`);
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
