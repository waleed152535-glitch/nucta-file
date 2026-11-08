/**
 * Small-company accounts under FRS 102 Section 1A: the size test, the totals
 * worked out from the detail, the checks, the accounts built through the
 * whole return, last year's lines, and carrying a year forward. Writes the
 * iXBRL to the folder given as the first argument so it can be validated
 * with Arelle.
 *
 * Run: npx tsx tests/small-accounts.test.ts <out-dir>
 */
import { writeFileSync, mkdirSync } from "fs";
import { prepareReturn } from "../lib/filing";
import { SCOPE_QUESTIONS, type ScopeAnswers } from "../lib/tax/scope";
import { blankReturnData, effectiveBalanceSheet, normaliseReturnData, toCompanyReturnInput, type ReturnData } from "../lib/return-model";
import {
  applySmall, blankSmallDetail, checkSmallDetail, deferredTaxCharge, priorSmallFromTotals, priorSmallProfit, shareCapitalOf, sizeAdvice,
  sizeTest, suggestDeferredTax, syncPriorFromSmall, tangibleNote,
} from "../lib/accounts/small";
import { companiesHouseCopy } from "../lib/accounts/ch-form";
import { carryForward } from "../lib/carry-forward";
import { priorFromAccounts } from "../lib/ch-accounts-read";
import type { PriorSmall, PriorYear } from "../lib/ixbrl";

const out = process.argv[2]; if (out) mkdirSync(out, { recursive: true });
let pass = 0, fail = 0;
const t = (name: string, ok: boolean, got?: unknown) => { ok ? pass++ : fail++; console.log(ok ? "PASS" : "FAIL", name, ok ? "" : `→ ${JSON.stringify(got)}`); };
const inScope = Object.fromEntries(SCOPE_QUESTIONS.map((q) => [q.key, q.expect])) as unknown as ScopeAnswers;
const company = { name: "Harbour Lane Trading Ltd", companyNo: "12873465", utr: "8596148860" };
const has = (html: string, name: string, ctx?: string) => new RegExp(`name="${name}" contextRef="${ctx ?? "[^\"]+"}"`).test(html);
const tagged = (html: string, name: string, ctx: string): string | null => {
  const m = html.match(new RegExp(`<ix:nonFraction name="${name}" contextRef="${ctx}"[^>]*>([^<]*)</ix:nonFraction>`));
  return m ? m[1] : null;
};

console.log("— size");
{
  const big = sizeTest("2025-07-01", "2026-06-30", 1_840_000, 481_100, 12);
  t("new limits from 6 April 2025", big.limits.micro.turnover === 1_000_000 && big.limits.small.turnover === 15_000_000);
  t("over two micro limits: not micro", !big.micro && big.small);
  t("old limits before 6 April 2025", sizeTest("2025-04-01", "2026-03-31", 0, 0, 0).limits.micro.turnover === 632_000);
  t("one test over is still micro", sizeTest("2025-07-01", "2026-06-30", 1_840_000, 300_000, 4).micro);
  const short = sizeTest("2025-07-01", "2025-12-31", 600_000, 100_000, 12);
  t("turnover scaled up for a six-month period", short.turnoverForYear > 1_180_000 && !short.micro, short.turnoverForYear);
  t("advice when micro chosen over the limits", (sizeAdvice("micro", big) ?? "").includes("two years in a row"));
  t("no advice for small accounts within the limits", sizeAdvice("small", big) === null);
  t("advice when above the small limits", (sizeAdvice("small", sizeTest("2025-07-01", "2026-06-30", 16_000_000, 8_000_000, 20)) ?? "").includes("medium-sized"));
}

console.log("— the detail");
const small = {
  ...blankSmallDetail(),
  tangibleCostBroughtForward: 96_000, tangibleAdditions: 30_400, tangibleDisposalsCost: 6_000,
  depreciationBroughtForward: 41_500, depreciationOnDisposals: 6_000,
  tradeDebtors: 64_000, otherDebtors: 9_500,
  bankWithin: 12_000, tradeCreditors: 96_500, taxationSocialSecurity: 38_700, otherCreditorsWithin: 4_100, accrualsWithin: 11_800,
  bankAfter: 36_000, deferredTaxBroughtForward: 3_400, deferredTaxCarriedForward: 13_835, interestPayable: 5_600,
  sharesNumber: 1_000, shareNominal: 1, otherDirectors: "Priya Shah\nTom Reilly",
  commitments: "The company has a lease on its warehouse with £18,000 a year payable until March 2028.",
};
{
  const tn = tangibleNote(small, 14_800);
  t("cost carried forward 120,400", tn.costCf === 120_400, tn);
  t("depreciation carried forward 50,300", tn.depCf === 50_300, tn);
  t("net book value 70,100, and 54,500 at the start", tn.nbvCf === 70_100 && tn.nbvBf === 54_500, tn);
  t("share capital 1,000 × £1", shareCapitalOf(small) === 1_000);
  t("share capital to the penny: 100 × 1p", shareCapitalOf({ ...small, sharesNumber: 100, shareNominal: 0.01 }) === 1);
  t("deferred tax charge is the movement", deferredTaxCharge(small) === 10_435);
  const b = applySmall({ ...blankReturnData().balanceSheet, provisions: 0 }, small, 14_800);
  t("fixed assets from equipment and investments", b.fixedAssets === 70_100);
  t("debtors from their parts", b.debtors === 73_500);
  t("creditors within a year from their parts", b.creditorsWithin === 163_100, b.creditorsWithin);
  t("creditors after a year", b.creditorsAfter === 36_000);
  t("provisions include deferred tax", b.provisions === 13_835);
  t("share capital from the shares", b.shareCapital === 1_000);
  const c = checkSmallDetail(small, 14_800, 198_400);
  t("detail passes its checks", c.problems.length === 0, c.problems);
  t("interest can't exceed other expenses", checkSmallDetail({ ...small, interestPayable: 999_999 }, 14_800, 198_400).problems.some((p) => p.includes("Interest paid")));
  t("depreciation can't exceed cost", checkSmallDetail({ ...small, depreciationBroughtForward: 200_000 }, 14_800, 198_400).problems.some((p) => p.includes("more than its cost")));
  t("negative amounts refused, in words", checkSmallDetail({ ...small, tradeDebtors: -5 }, 14_800, 198_400).problems.some((p) => p.includes("owed by customers")));
  t("shares must be entered", checkSmallDetail({ ...small, sharesNumber: 0 }, 14_800, 198_400).problems.some((p) => p.includes("shares")));
  const sug = suggestDeferredTax(70_100, 14_760, 118_810);
  t("deferred tax suggestion: gap at 25%", sug.amount === 13_835 && sug.gap === 55_340 && sug.rate === 0.25, sug);
  t("small profits rate below £50,000", suggestDeferredTax(10_000, 0, 30_000).rate === 0.19);
}

console.log("— last year");
const priorSmall: PriorSmall = {
  costOfSales: 1_004_000, administrativeExpenses: 398_000, otherOperatingIncome: 4_800, interestReceivable: 600, interestPayable: 6_100,
  currentTax: 24_000, deferredTax: 900,
  tangibleAssets: 54_500, investments: 0, stocks: 160_000, tradeDebtors: 51_000, owedByDirectors: 0, otherDebtors: 6_000, prepayments: 6_500, cash: 142_050,
  bankWithin: 12_000, tradeCreditors: 88_000, corporationTax: 24_000, otherTaxation: 31_000, owedToDirectors: 2_000, otherCreditorsWithin: 3_500, accrualsWithin: 9_000,
  bankAfter: 48_000, otherAfter: 0, deferredTaxProvision: 3_400, otherProvisions: 0, shareCapital: 1_000, dividendsPaid: 50_000,
};
const blankPrior: PriorYear = { turnover: 1_520_000, otherIncome: 0, rawMaterials: 0, staffCosts: 0, depreciation: 0, otherCharges: 0, profitBeforeTax: 0, tax: 0,
  shareCapitalNotPaid: 0, fixedAssets: 0, currentAssets: 0, prepayments: 0, creditorsWithin: 0, creditorsAfter: 0, provisions: 0, accruals: 0, employees: 10 };
const prior = syncPriorFromSmall({ ...blankPrior, small: priorSmall });
{
  t("last year's profit from its lines", prior.profitBeforeTax === 117_300 && priorSmallProfit(1_520_000, priorSmall) === 117_300, prior.profitBeforeTax);
  t("last year's tax is current plus deferred", prior.tax === 24_900);
  t("last year's totals from its lines", prior.fixedAssets === 54_500 && prior.currentAssets === 359_050 && prior.prepayments === 6_500 && prior.creditorsWithin === 169_500 && prior.creditorsAfter === 48_000 && prior.provisions === 3_400, prior);
  const fromMicro = priorSmallFromTotals({ ...blankPrior, rawMaterials: 900, staffCosts: 100, depreciation: 50, otherCharges: 250, fixedAssets: 4_000, currentAssets: 9_000, creditorsWithin: 3_000, tax: 400 });
  t("micro totals start as one line each", fromMicro.costOfSales === 900 && fromMicro.administrativeExpenses === 400 && fromMicro.tangibleAssets === 4_000 && fromMicro.cash === 9_000 && fromMicro.otherCreditorsWithin === 3_000 && fromMicro.currentTax === 400, fromMicro);
}

console.log("— the whole return");
const d: ReturnData = {
  ...blankReturnData(),
  activity: "Online retail of homeware", scope: inScope, accountsFormat: "small", small,
  pl: { turnover: 1_840_000, otherIncome: 6_200, interestReceived: 1_450, costOfSales: 1_212_000, staffCosts: 286_000, depreciation: 14_800, otherCharges: 198_400 },
  disallowable: { ...blankReturnData().disallowable, entertainment: 1_200 },
  additions: [
    { description: "Used delivery van", kind: "plantUsed", cost: 22_000, date: "2025-09-12" },
    { description: "Laptops and scanners", kind: "plantNew", cost: 8_400, date: "2026-02-03" },
  ],
  mainPoolBroughtForward: 18_000,
  balanceSheet: { ...blankReturnData().balanceSheet, stock: 188_000, cash: 142_300, prepayments: 7_200, owedToDirectors: 3_000,
    reservesBroughtForward: 198_150, dividendsPaid: 60_000, employees: 12 },
  prior: { from: "2024-07-01", to: "2025-06-30", figures: prior },
  director: "Amira Khan", approvedOn: "2026-09-18", declarantName: "Amira Khan", declarantStatus: "Director",
};
const r = prepareReturn(toCompanyReturnInput(company, "2025-07-01", "2026-06-30", d));
// The same company as micro-entity accounts: no deferred tax movement, so the provision stays at last year's.
const asMicro: ReturnData = { ...d, accountsFormat: "micro", balanceSheet: { ...effectiveBalanceSheet(d), provisions: 3_400 } };
const a = r.accountsHtml ?? "";
if (out) {
  writeFileSync(`${out}/small_full.xhtml`, a);
  writeFileSync(`${out}/small_full_ch.html`, companiesHouseCopy(a));
}
{
  t("small-company return builds", r.ok, r.problems);
  t("reported as small-company accounts", r.accountsFormat === "small");
  t("no size warning for small accounts here", !r.warnings.some((w) => w.includes("limits")), r.warnings);
  const ct = Math.round(r.corporationTax);
  t("Corporation Tax as for micro accounts", ct > 27_000 && ct < 28_500, ct);
  const micro = prepareReturn(toCompanyReturnInput(company, "2025-07-01", "2026-06-30", asMicro));
  t("the same figures as micro-entity accounts build", micro.ok, micro.problems);
  t("the CT600 is the same whichever accounts", micro.ct600 !== null && r.ct600 !== null &&
    r.ct600.replace(/<Accounts>[\s\S]*<\/Accounts>/, "") === micro.ct600.replace(/<Accounts>[\s\S]*<\/Accounts>/, ""));
  t("micro accounts warn they're over the limits", micro.warnings.some((w) => w.includes("micro-entity limits")), micro.warnings);
  t("accounting standard is small entities", a.includes("bus:SmallEntities") && !a.includes("bus:Micro-entities"));
  t("Format 1 profit and loss", has(a, "core:GrossProfitLoss", "D") && has(a, "core:AdministrativeExpenses", "D") && has(a, "core:OperatingProfitLoss", "D") && !a.includes("core:RawMaterialsConsumablesUsed"));
  t("gross profit 628,000", tagged(a, "core:GrossProfitLoss", "D") === "628,000", tagged(a, "core:GrossProfitLoss", "D"));
  t("administrative expenses exclude interest: 493,600", tagged(a, "core:AdministrativeExpenses", "D") === "493,600", tagged(a, "core:AdministrativeExpenses", "D"));
  t("operating profit 140,600", tagged(a, "core:OperatingProfitLoss", "D") === "140,600", tagged(a, "core:OperatingProfitLoss", "D"));
  t("interest payable on its own line", tagged(a, "core:InterestPayableSimilarChargesFinanceCosts", "D") === "5,600");
  t("profit before tax 136,450", tagged(a, "core:ProfitLossOnOrdinaryActivitiesBeforeTax", "D") === "136,450");
  const taxLine = tagged(a, "core:TaxTaxCreditOnProfitOrLossOnOrdinaryActivities", "D");
  t("tax line is current plus deferred", Number((taxLine ?? "").replace(/,/g, "")) === ct + 10_435, taxLine);
  t("tax note: current and deferred", tagged(a, "core:CurrentTaxForPeriod", "D") === ct.toLocaleString("en-GB") && tagged(a, "core:DeferredTaxExpenseCreditRelatingToOriginationReversalTimingDifferences", "D") === "10,435");
  t("last year's profit and loss alongside", tagged(a, "core:GrossProfitLoss", "PD") === "516,000" && tagged(a, "core:ProfitLossOnOrdinaryActivitiesBeforeTax", "PD") === "117,300");
  t("tangible assets 70,100 and last year 54,500", tagged(a, "core:PropertyPlantEquipment", "E") === "70,100" && tagged(a, "core:PropertyPlantEquipment", "PE") === "54,500");
  t("stocks, debtors and cash split", tagged(a, "core:TotalInventories", "E") === "188,000" && tagged(a, "core:Debtors", "E") === "80,700" && tagged(a, "core:CashBankOnHand", "E") === "142,300");
  t("current assets 411,000", tagged(a, "core:CurrentAssets", "E") === "411,000", tagged(a, "core:CurrentAssets", "E"));
  const within = 163_100 + 3_000 + ct;
  t("creditors within a year include CT and directors", tagged(a, "core:Creditors", "EW1") === within.toLocaleString("en-GB"), tagged(a, "core:Creditors", "EW1"));
  t("provisions 13,835", tagged(a, "core:ProvisionsForLiabilitiesBalanceSheetSubtotal", "E") === "13,835");
  const net = 481_100 - within - 36_000 - 13_835;
  t("net assets", tagged(a, "core:NetAssetsLiabilities", "E") === net.toLocaleString("en-GB"), tagged(a, "core:NetAssetsLiabilities", "E"));
  t("equity split into share capital and reserves", tagged(a, "core:Equity", "ESC") === "1,000" && tagged(a, "core:Equity", "ERE") === (net - 1_000).toLocaleString("en-GB"));
  t("shareholders' funds = net assets", tagged(a, "core:Equity", "E") === net.toLocaleString("en-GB"));
  t("last year's equity: 199,150", tagged(a, "core:Equity", "PE") === "199,150" && tagged(a, "core:Equity", "PERE") === "198,150");
  t("tangible fixed assets note", tagged(a, "core:PropertyPlantEquipmentGrossCost", "PE") === "96,000" && tagged(a, "core:PropertyPlantEquipmentGrossCost", "E") === "120,400"
    && tagged(a, "core:AdditionsOtherThanThroughBusinessCombinationsPropertyPlantEquipment", "D") === "30,400" && tagged(a, "core:IncreaseFromDepreciationChargeForYearPropertyPlantEquipment", "D") === "14,800"
    && tagged(a, "core:AccumulatedDepreciationImpairmentPropertyPlantEquipment", "E") === "50,300");
  t("opening balances at last year's end", !a.includes('id="SB"'));
  t("debtors note", tagged(a, "core:TradeDebtorsTradeReceivables", "E") === "64,000" && tagged(a, "core:PrepaymentsAccruedIncome", "E") === "7,200" && tagged(a, "core:OtherDebtors", "PE") === "6,000");
  t("creditors note with maturity", tagged(a, "core:TradeCreditorsTradePayables", "EW1") === "96,500" && tagged(a, "core:CorporationTaxPayable", "EW1") === ct.toLocaleString("en-GB")
    && tagged(a, "core:OtherTaxationSocialSecurityPayable", "EW1") === "38,700" && tagged(a, "core:AmountsOwedToDirectors", "EW1") === "3,000");
  t("bank loan due after a year", tagged(a, "core:BankBorrowingsOverdrafts", "EA1") === "36,000" && tagged(a, "core:BankBorrowingsOverdrafts", "PEA1") === "48,000");
  t("deferred tax note", tagged(a, "core:NetDeferredTaxLiabilityAsset", "PE") === "3,400" && tagged(a, "core:NetDeferredTaxLiabilityAsset", "E") === "13,835");
  t("share capital note: shares and nominal value", /name="core:NumberSharesIssuedFullyPaid" contextRef="EOrd1" unitRef="shares"[^>]*>1,000</.test(a) && /name="core:ParValueShare" contextRef="DOrd1" unitRef="GBPperShare" decimals="2"[^>]*>1.00</.test(a));
  t("dividends this year and last", tagged(a, "core:DividendsPaidOnShares", "D") === "60,000" && tagged(a, "core:DividendsPaidOnShares", "PD") === "50,000");
  t("commitments in words", a.includes("lease on its warehouse") && a.includes("core:DescriptionFinancialCommitmentsOtherThanCapitalCommitments"));
  t("policies tagged", ["StatementComplianceWithApplicableReportingFramework", "RevenueRecognitionPolicy", "PropertyPlantEquipmentPolicy", "InventoriesPolicy", "CurrentIncomeTaxPolicy", "DeferredTaxPolicy", "FinancialInstrumentsRecognitionMeasurementPolicy"].every((n) => a.includes(`core:${n}`)));
  t("Section 1A named", a.includes("Section 1A"));
  t("directors' report with every director", a.includes("<h2>Directors' report</h2>") && /contextRef="DDir">Amira Khan</.test(a) && /contextRef="DDir2">Priya Shah</.test(a) && /contextRef="DDir3">Tom Reilly</.test(a));
  t("directors' report statements and signature", a.includes("direp:StatementThatDirectorsReportHasBeenPreparedInAccordanceWithProvisionsSmallCompaniesRegime") && a.includes("direp:DirectorSigningDirectorsReport") && a.includes('name="direp:DateSigningDirectorsReport" contextRef="E">2026-09-18<'));
  t("principal activity tagged once, in the report", (a.match(/bus:DescriptionPrincipalActivities/g) ?? []).length === 1);
  t("the signing director's name tagged once", (a.match(/contextRef="DDir">Amira Khan</g) ?? []).length === 1);
  t("small companies regime statement", a.includes("subject to the small companies regime"));
  t("employees this year and last", /AverageNumberEmployeesDuringPeriod" contextRef="D"[^>]*>12</.test(a) && /AverageNumberEmployeesDuringPeriod" contextRef="PD"[^>]*>10</.test(a));
  t("no box-by-box Companies House form", r.companiesHouse === null);
  const ch = companiesHouseCopy(a);
  t("Companies House copy leaves out the report and the profit and loss", !ch.includes("<h2>Directors' report</h2>") && !ch.includes("<h2>Profit and loss account</h2>") && ch.includes("<h2>Balance sheet as at"));
  t("and says so under s444", ch.includes("the profit and loss account and the directors' report have not been delivered"));
  t("year, not period, for twelve months", a.includes("for the year ended 30 June 2026"));
}

console.log("— refusals and warnings");
{
  const off = prepareReturn(toCompanyReturnInput(company, "2025-07-01", "2026-06-30", { ...d, small: { ...small, tradeDebtors: 64_100 } }));
  t("out by £100 refused", !off.ok && off.problems.some((p) => p.includes("£100")), off.problems);
  const noShares = prepareReturn(toCompanyReturnInput(company, "2025-07-01", "2026-06-30", { ...d, small: { ...small, sharesNumber: 0 } }));
  t("missing shares refused", !noShares.ok && noShares.problems.some((p) => p.includes("shares")));
  const mismatch = prepareReturn(toCompanyReturnInput(company, "2025-07-01", "2026-06-30", { ...d, prior: { ...d.prior!, figures: syncPriorFromSmall({ ...prior, small: { ...priorSmall, tangibleAssets: 50_000, cash: 146_550 } }) } }));
  t("equipment not matching last year warned", mismatch.ok && mismatch.warnings.some((w) => w.includes("Last year's balance sheet shows equipment")), mismatch.warnings);
  const dormant = toCompanyReturnInput(company, "2025-07-01", "2026-06-30", { ...d, dormant: true });
  t("a dormant company never gets small accounts", dormant.small === undefined);
}

console.log("— first accounts, a loss, no equipment");
{
  const first: ReturnData = {
    ...d, prior: null, additions: [], mainPoolBroughtForward: 0,
    pl: { turnover: 1_250_000, otherIncome: 0, interestReceived: 0, costOfSales: 980_000, staffCosts: 210_000, depreciation: 0, otherCharges: 95_000 },
    // A loss of 35,000 on £100 of shares: net liabilities of 34,900.
    small: { ...blankSmallDetail(), tradeDebtors: 40_000, tradeCreditors: 104_900, otherCreditorsWithin: 35_000, sharesNumber: 100, shareNominal: 1, otherDirectors: "" },
    balanceSheet: { ...blankReturnData().balanceSheet, stock: 60_000, cash: 5_000, reservesBroughtForward: 0, dividendsPaid: 0, employees: 14 },
  };
  const f = prepareReturn(toCompanyReturnInput(company, "2025-07-01", "2026-06-30", first));
  t("first accounts with a loss build", f.ok, f.problems);
  const fa = f.accountsHtml ?? "";
  if (out) writeFileSync(`${out}/small_first.xhtml`, fa);
  t("no comparative column", !fa.includes('contextRef="PD"') && !fa.includes('contextRef="PE"'));
  t("loss shown as a loss", fa.includes("Loss before taxation") && fa.includes("Operating loss"));
  t("no equipment note or policy", !fa.includes("core:PropertyPlantEquipmentGrossCost") && !fa.includes("core:PropertyPlantEquipmentPolicy"));
  t("no deferred tax", !fa.includes("core:NetDeferredTaxLiabilityAsset") && !fa.includes("core:DeferredTaxPolicy"));
  t("no opening-date context nothing uses", !fa.includes('id="SB"'));
  const bought = prepareReturn(toCompanyReturnInput(company, "2025-07-01", "2026-06-30", { ...first, small: { ...first.small, tangibleAdditions: 2_000, otherCreditorsWithin: 37_000 } }));
  const ba = bought.accountsHtml ?? "";
  t("first year's equipment opens at nothing, on the day before", bought.ok && ba.includes('id="SB"') && ba.includes("<xbrli:instant>2025-06-30</xbrli:instant>") && tagged(ba, "core:PropertyPlantEquipmentGrossCost", "SB") === "0", bought.problems);
  if (out) writeFileSync(`${out}/small_first_bought.xhtml`, ba);
  t("one director, said so", fa.includes("The director who served during the year was"));
}

console.log("— last year read back from Companies House");
{
  // Last year's small accounts as filed, read back the way Companies House would serve them.
  const read = priorFromAccounts(a, "2026-06-30");
  t("lines read back from our own accounts", read.smallFound.includes("tradeDebtors") && read.small.tradeDebtors === 64_000 && read.small.bankAfter === 36_000 && read.small.deferredTaxProvision === 13_835, read.small);
  t("nothing left over to put on other lines", read.smallNotes.length === 0, read.smallNotes);
  const next: ReturnData = {
    ...d,
    prior: { ...read.prior, figures: syncPriorFromSmall({ ...read.prior.figures, small: read.small }) },
    small: { ...small, tangibleCostBroughtForward: 120_400, depreciationBroughtForward: 50_300, tangibleAdditions: 0, tangibleDisposalsCost: 0, depreciationOnDisposals: 0, deferredTaxBroughtForward: 13_835, deferredTaxCarriedForward: 13_835 },
  };
  const ps = next.prior!.figures.small!;
  t("last year's profit read back", next.prior!.figures.profitBeforeTax === 136_450 && ps.interestPayable === 5_600, next.prior!.figures.profitBeforeTax);
  t("last year's equity read back as reserves check", read.equity !== null);
  // Micro accounts read as small: totals go on one line each.
  const microAccts = prepareReturn(toCompanyReturnInput(company, "2025-07-01", "2026-06-30", asMicro)).accountsHtml ?? "";
  const fromMicro = priorFromAccounts(microAccts, "2026-06-30");
  t("micro accounts read as small: notes say what to split", fromMicro.smallNotes.length > 0 && fromMicro.small.otherDebtors > 0, fromMicro.smallNotes);
  const sum = (s: PriorSmall) => s.stocks + s.tradeDebtors + s.owedByDirectors + s.otherDebtors + s.prepayments + s.cash;
  t("and still add up to the current assets filed", sum(fromMicro.small) === 411_000, sum(fromMicro.small));
  t("micro accruals and provisions kept", fromMicro.small.deferredTaxProvision === 0 && fromMicro.small.otherProvisions === 3_400, fromMicro.small);
}

console.log("— carrying forward");
{
  const saved = normaliseReturnData(JSON.parse(JSON.stringify(d)));
  const c = carryForward(saved, "2025-07-01", "2026-06-30");
  t("stays small-company accounts", c.accountsFormat === "small");
  t("equipment opens where it closed", c.small?.tangibleCostBroughtForward === 120_400 && c.small?.depreciationBroughtForward === 50_300 && c.small?.tangibleAdditions === 0);
  t("deferred tax opens where it closed", c.small?.deferredTaxBroughtForward === 13_835);
  t("shares, policy and directors carried", c.small?.sharesNumber === 1_000 && c.small?.otherDirectors.includes("Priya Shah") && c.small?.commitments.includes("warehouse"));
  t("this year's balances start at nothing", c.small?.tradeDebtors === 0 && c.small?.bankAfter === 0 && c.balanceSheet?.cash === 0);
  const pf = c.prior!.figures, pl = pf.small!;
  t("last year line by line", pl.tradeDebtors === 64_000 && pl.tangibleAssets === 70_100 && pl.bankAfter === 36_000 && pl.deferredTaxProvision === 13_835 && pl.dividendsPaid === 60_000, pl);
  t("last year's interest on its own line", pl.interestPayable === 5_600 && pl.administrativeExpenses === 493_600);
  t("last year's tax split", pl.deferredTax === 10_435 && pl.currentTax === Math.round(r.corporationTax));
  t("totals agree with the lines", pf.fixedAssets === 70_100 && pf.currentAssets === 403_800 && pf.provisions === 13_835, pf);
  const shares = c.balanceSheet!.shareCapital, res = c.balanceSheet!.reservesBroughtForward;
  const netLast = Number((tagged(a, "core:NetAssetsLiabilities", "E") ?? "0").replace(/,/g, ""));
  t("reserves carried forward balance with last year's net assets", shares + res === netLast, { shares, res, netLast });
}

console.log("— carrying forward micro-entity accounts");
{
  // A director's loan account overdrawn at the year end was a current asset in last year's accounts, so it's in the comparative too.
  const microYear: ReturnData = {
    ...blankReturnData(), activity: "Online retail", scope: inScope,
    pl: { turnover: 120_000, otherIncome: 0, interestReceived: 0, costOfSales: 70_000, staffCosts: 12_000, depreciation: 0, otherCharges: 18_000 },
    participators: [{ name: "Amira Khan", isDirector: true, openingOwed: 0, openingCredit: 0, advances: 6_000, advancesFrom6April2026: 0, repaid: 0, later: [], interestCharged: false, terms: "" }],
    balanceSheet: { ...blankReturnData().balanceSheet, cash: 20_000, creditorsWithin: 2_000, shareCapital: 100, employees: 1 },
    director: "Amira Khan", approvedOn: "2025-06-01",
  };
  const c = carryForward(normaliseReturnData(microYear), "2024-04-01", "2025-03-31");
  t("stays micro-entity accounts", c.accountsFormat === undefined && c.prior?.figures.small === undefined);
  t("last year's current assets include the overdrawn loan account", c.prior?.figures.currentAssets === 26_000, c.prior?.figures.currentAssets);
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
