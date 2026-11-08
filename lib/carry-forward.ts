/**
 * What a new return takes from the return for the period just before it:
 * pool values and losses carried forward, loan accounts opening where they
 * closed, the trade, the people, reserves and share capital, and last year's
 * accounts as the comparative column.
 *
 * Plain logic, no database: return-actions.ts finds the return before and
 * saves what this gives back.
 */
import { checkMicroAccounts } from "./accounts/micro";
import { deferredTaxCharge, syncPriorFromSmall, tangibleNote } from "./accounts/small";
import type { PriorSmall, PriorYear } from "./ixbrl";
import { blankBalanceSheet, effectiveBalanceSheet, isSmall, toFigures, toPeriodOfAccountInput, type ReturnData } from "./return-model";
import { computePeriodOfAccount } from "./tax/long-period";

const r = (v: number) => Math.round(v);

export function carryForward(prev: ReturnData, prevFrom: string, prevTo: string): Partial<ReturnData> {
  // For accounts longer than 12 months, what carries forward is what the second period ends with.
  const poa = computePeriodOfAccount(toPeriodOfAccountInput(prevFrom, prevTo, prev));
  const last = poa.parts[poa.parts.length - 1];
  // A dormant year has no trade, so pools and losses pass through it unchanged.
  const unchanged = { mainPool: prev.mainPoolBroughtForward, specialPool: prev.specialPoolBroughtForward, tradingLosses: prev.tradingLossesBroughtForward };
  const carry = prev.dormant ? unchanged : last?.result.carryForward ?? unchanged;
  // What last year's accounts actually showed: a dormant year's profit and loss is nothing.
  const prevPl = toFigures(prevFrom, prevTo, prev).pl;
  const small = isSmall(prev);
  const deferred = small ? deferredTaxCharge(prev.small) : 0;
  const ct = r(poa.corporationTax);
  const b0 = effectiveBalanceSheet(prev);
  const b = small ? { ...b0, corporationTaxOwed: b0.corporationTaxOwed ?? ct } : b0;
  const prevLoans = poa.closingLoans;
  const owedByParticipators = prev.dormant ? 0 : r(prevLoans?.a75 ?? 0);
  const acc = checkMicroAccounts({
    companyName: "", companyNo: "", periodFrom: prevFrom, periodTo: prevTo, principalActivities: prev.activity,
    pl: prevPl, taxCharge: poa.corporationTax + deferred, balanceSheet: { ...b, owedByParticipators }, director: prev.director, approvedOn: prev.approvedOn,
  });

  const figures: PriorYear = {
    turnover: prevPl.turnover, otherIncome: prevPl.otherIncome + prevPl.interestReceived, rawMaterials: prevPl.costOfSales,
    staffCosts: prevPl.staffCosts, depreciation: prevPl.depreciation, otherCharges: prevPl.otherCharges,
    profitBeforeTax: acc.profitBeforeTax, tax: ct + deferred,
    shareCapitalNotPaid: b.shareCapitalNotPaid, fixedAssets: b.fixedAssets,
    // Overdrawn loan accounts were current assets in last year's accounts.
    currentAssets: b.stock + b.debtors + b.cash + owedByParticipators,
    prepayments: b.prepayments, creditorsWithin: b.creditorsWithin + b.owedToDirectors + r(b.corporationTaxOwed ?? ct),
    creditorsAfter: b.creditorsAfter, provisions: b.provisions, accruals: 0, employees: b.employees,
  };
  let priorFigures = figures;
  let smallNext: Partial<ReturnData> = {};
  if (small) {
    const s = prev.small, t = tangibleNote(s, prevPl.depreciation);
    const directorsOwe = Math.min(owedByParticipators, (prevLoans?.people ?? []).filter((p) => p.isDirector).reduce((x, p) => x + r(p.closingOwed), 0));
    const lines: PriorSmall = {
      costOfSales: r(prevPl.costOfSales),
      administrativeExpenses: r(prevPl.staffCosts + prevPl.depreciation + prevPl.otherCharges) - r(s.interestPayable),
      otherOperatingIncome: r(prevPl.otherIncome), interestReceivable: r(prevPl.interestReceived), interestPayable: r(s.interestPayable),
      currentTax: ct, deferredTax: deferred,
      tangibleAssets: t.nbvCf, investments: r(s.investments), stocks: r(b.stock),
      tradeDebtors: r(s.tradeDebtors), owedByDirectors: directorsOwe, otherDebtors: r(s.otherDebtors) + owedByParticipators - directorsOwe,
      prepayments: r(b.prepayments), cash: r(b.cash),
      bankWithin: r(s.bankWithin), tradeCreditors: r(s.tradeCreditors), corporationTax: r(b.corporationTaxOwed ?? ct), otherTaxation: r(s.taxationSocialSecurity),
      owedToDirectors: r(b.owedToDirectors), otherCreditorsWithin: r(s.otherCreditorsWithin), accrualsWithin: r(s.accrualsWithin),
      bankAfter: r(s.bankAfter), otherAfter: r(s.otherAfter),
      deferredTaxProvision: r(s.deferredTaxCarriedForward), otherProvisions: r(prev.balanceSheet.provisions),
      shareCapital: r(b.shareCapital), dividendsPaid: r(b.dividendsPaid),
    };
    priorFigures = syncPriorFromSmall({ ...figures, small: lines });
    smallNext = {
      accountsFormat: "small",
      small: {
        ...s,
        // Equipment's cost and depreciation open where they closed; the year's movements start at nothing.
        tangibleCostBroughtForward: t.costCf, tangibleAdditions: 0, tangibleDisposalsCost: 0,
        depreciationBroughtForward: t.depCf, depreciationOnDisposals: 0,
        deferredTaxBroughtForward: r(s.deferredTaxCarriedForward), deferredTaxCarriedForward: r(s.deferredTaxCarriedForward),
        tradeDebtors: 0, otherDebtors: 0, bankWithin: 0, tradeCreditors: 0, taxationSocialSecurity: 0, otherCreditorsWithin: 0, accrualsWithin: 0,
        bankAfter: 0, otherAfter: 0, interestPayable: 0,
      },
    };
  }

  return {
    // Each loan account opens where it closed; repayments made after last
    // year end happened in this year, so they start as this year's repayments.
    participators: prev.participators.map((x, n) => {
      const res = prevLoans?.people[n];
      return {
        ...x, openingOwed: res?.closingOwed ?? 0, openingCredit: res?.closingCredit ?? 0,
        advances: 0, advancesFrom6April2026: 0, repaid: x.later.reduce((t, l) => t + (l.amount || 0), 0), later: [],
        firstPart: undefined,
      };
    }),
    activity: prev.activity,
    dormant: prev.dormant, everTraded: prev.everTraded || !prev.dormant,
    scope: prev.scope,
    associatedCompanies: prev.associatedCompanies,
    mainPoolBroughtForward: carry.mainPool,
    specialPoolBroughtForward: carry.specialPool,
    tradingLossesBroughtForward: carry.tradingLosses,
    director: prev.director,
    declarantName: prev.declarantName,
    declarantStatus: prev.declarantStatus,
    balanceSheet: {
      ...blankBalanceSheet(),
      shareCapital: b.shareCapital, shareCapitalNotPaid: b.shareCapitalNotPaid, reservesBroughtForward: acc.reservesCarriedForward, employees: b.employees,
      // A dormant company's balance sheet doesn't move from one year to the next.
      ...(prev.dormant ? { cash: b.cash, debtors: b.debtors, creditorsWithin: b.creditorsWithin, owedToDirectors: b.owedToDirectors } : {}),
    },
    ...smallNext,
    prior: { from: prevFrom, to: prevTo, figures: priorFigures },
    carriedFrom: `${prevFrom} to ${prevTo}`,
  };
}
