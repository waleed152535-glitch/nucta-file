/**
 * Capital allowances on plant and machinery, for one company accounting
 * period, claiming the most relief the rules allow.
 *
 * Order of relief, best first:
 *   1. 100% first-year allowances that use up nothing else: full expensing
 *      on new main-rate plant, and new zero-emission cars.
 *   2. The Annual Investment Allowance (100%), spent first on special-rate
 *      expenditure (otherwise relieved at only 6% a year), then on
 *      second-hand main-rate plant.
 *   3. Writing down allowances on what's left in each pool, or the whole
 *      pool when it is £1,000 or less.
 *
 * The 50% first-year allowance on new special-rate assets is not claimed:
 * the AIA gives 100% on the same spending, and a company with more than
 * £1m of it is outside what this engine handles. Not claiming a first-year
 * allowance is always permitted; the expenditure simply goes into the pool.
 *
 * Allowances are rounded down to the pound and charges up, so rounding can
 * never claim more than the law gives.
 */

import { daysInclusive, toDay, yearFraction } from "./dates";
import {
  AIA_ANNUAL, FULL_EXPENSING_FROM, MAIN_WDA_AFTER, MAIN_WDA_BEFORE, MAIN_WDA_CHANGE,
  SMALL_POOL_LIMIT, SPECIAL_WDA, ZERO_EMISSION_CAR_FYA_UNTIL,
} from "./rules";

export type AssetKind =
  /** New and unused plant and machinery, not a car: full expensing. */
  | "plantNew"
  /** Second-hand plant and machinery, not a car: AIA, then the main pool. */
  | "plantUsed"
  /** Integral features (lifts, heating, electrical and lighting systems), long-life assets, solar panels: AIA, then the special rate pool. */
  | "specialRate"
  /** A new, unused car with zero CO2 emissions: 100% first-year allowance until 31 March 2027. */
  | "carZeroEmissionNew"
  /** Any other car with CO2 of 50 g/km or less: main pool. */
  | "carLowEmission"
  /** A car with CO2 above 50 g/km: special rate pool. */
  | "carHighEmission";

export interface Addition {
  description: string;
  kind: AssetKind;
  /** What it cost, in pounds. */
  cost: number;
  /** When the expenditure was incurred. */
  date: string;
}

export type DisposalPool =
  /**
   * An asset in the main pool — including cars of 50 g/km or less and new
   * zero-emission cars that had the 100% allowance, whose proceeds go back
   * into the main pool like any other main-rate asset.
   */
  | "main"
  /** An asset in the special rate pool. */
  | "special"
  /**
   * An asset on which full expensing was claimed. Its disposal value is a
   * balancing charge in full rather than going into a pool.
   */
  | "fullExpensing";

export interface Disposal {
  description: string;
  pool: DisposalPool;
  /** What it was sold for — or its market value if given away — capped at what it cost. */
  proceeds: number;
}

export interface CapitalAllowanceInput {
  periodFrom: string;
  periodTo: string;
  additions: Addition[];
  disposals: Disposal[];
  /** Written-down value brought forward from last period's computation. */
  mainPoolBroughtForward: number;
  specialPoolBroughtForward: number;
  /**
   * The AIA this company may use, when it shares one with related companies
   * (a group shares a single £1m). Leave out to use the company's own full
   * allowance for the period.
   */
  aiaAvailable?: number;
}

export interface PoolResult {
  broughtForward: number;
  additions: number;
  disposals: number;
  /** Writing down allowance, or the small pools write-off. */
  allowance: number;
  smallPoolWriteOff: boolean;
  balancingCharge: number;
  carriedForward: number;
}

export interface CapitalAllowanceResult {
  /** The writing down allowance rate applied to the main pool, as a percentage (e.g. 14.99). */
  mainRate: number;
  /** The fraction of a year this period is, applied to the AIA and writing down allowances. */
  yearFraction: number;
  aiaLimit: number;
  aia: number;
  /** AIA given on special-rate expenditure and on main-rate plant. */
  aiaOnSpecial: number;
  aiaOnMain: number;
  fullExpensing: number;
  zeroEmissionCars: number;
  main: PoolResult;
  special: PoolResult;
  /** The charge on selling an asset that had full expensing: the whole disposal value. */
  fullExpensingCharge: number;
  totalAllowances: number;
  totalCharges: number;
  /** Plant and machinery expenditure in the period, for the return (box 760 group). */
  expenditure: { plant: number; specialRate: number; cars: number; total: number };
  /** What happened to each addition, in words, for the computation. */
  notes: string[];
}

const down = (v: number): number => Math.floor(v + 1e-9);
const up = (v: number): number => Math.ceil(v - 1e-9);

/**
 * The main pool rate for a period. A period straddling 1 April 2026 gets the
 * hybrid rate: "(days before ÷ total days × 18) + (days from change ÷ total
 * days × 14), rounded up to 2 decimal places" (GOV.UK, Calculate your hybrid
 * rate of writing down allowance).
 */
export function mainPoolRate(from: string, to: string): number {
  const change = toDay(MAIN_WDA_CHANGE);
  if (toDay(to) < change) return MAIN_WDA_BEFORE;
  if (toDay(from) >= change) return MAIN_WDA_AFTER;
  const total = daysInclusive(from, to);
  const before = change - toDay(from);
  const hybrid = (before / total) * MAIN_WDA_BEFORE + ((total - before) / total) * MAIN_WDA_AFTER;
  return Math.ceil(hybrid * 100 - 1e-9) / 100;
}

export function capitalAllowances(input: CapitalAllowanceInput): CapitalAllowanceResult {
  const notes: string[] = [];
  const frac = yearFraction(input.periodFrom, input.periodTo);
  const mainRate = mainPoolRate(input.periodFrom, input.periodTo);
  const aiaLimit = down(Math.min(input.aiaAvailable ?? Infinity, AIA_ANNUAL * frac));

  let fullExpensing = 0, zeroEmissionCars = 0;
  let specialForAia = 0, mainForAia = 0;
  let mainPoolAdditions = 0, specialPoolAdditions = 0;
  const exp = { plant: 0, specialRate: 0, cars: 0, total: 0 };

  for (const a of input.additions) {
    const cost = Math.max(0, Math.round(a.cost));
    exp.total += cost;
    switch (a.kind) {
      case "plantNew":
        exp.plant += cost;
        if (toDay(a.date) >= toDay(FULL_EXPENSING_FROM)) {
          fullExpensing += cost;
          notes.push(`${a.description}: full expensing, 100% of £${cost.toLocaleString("en-GB")}.`);
        } else {
          mainForAia += cost;
        }
        break;
      case "plantUsed":
        exp.plant += cost;
        mainForAia += cost;
        break;
      case "specialRate":
        exp.specialRate += cost;
        specialForAia += cost;
        break;
      case "carZeroEmissionNew":
        exp.cars += cost;
        if (toDay(a.date) <= toDay(ZERO_EMISSION_CAR_FYA_UNTIL)) {
          zeroEmissionCars += cost;
          notes.push(`${a.description}: new zero-emission car, 100% first-year allowance.`);
        } else {
          mainPoolAdditions += cost;
          notes.push(`${a.description}: bought after 31 March 2027, when the 100% allowance for zero-emission cars ended, so it joins the main pool.`);
        }
        break;
      case "carLowEmission":
        exp.cars += cost;
        mainPoolAdditions += cost;
        notes.push(`${a.description}: car, 50 g/km or less, main pool. Cars can't have the AIA.`);
        break;
      case "carHighEmission":
        exp.cars += cost;
        specialPoolAdditions += cost;
        notes.push(`${a.description}: car over 50 g/km, special rate pool. Cars can't have the AIA.`);
        break;
    }
  }

  // AIA: special-rate spending first, as it otherwise gets only 6% a year.
  let aiaLeft = aiaLimit;
  const aiaOnSpecial = Math.min(aiaLeft, specialForAia); aiaLeft -= aiaOnSpecial;
  const aiaOnMain = Math.min(aiaLeft, mainForAia); aiaLeft -= aiaOnMain;
  specialPoolAdditions += specialForAia - aiaOnSpecial;
  mainPoolAdditions += mainForAia - aiaOnMain;
  if (aiaOnSpecial + aiaOnMain > 0) notes.push(`Annual Investment Allowance: £${(aiaOnSpecial + aiaOnMain).toLocaleString("en-GB")} of the £${aiaLimit.toLocaleString("en-GB")} available.`);
  if (specialForAia - aiaOnSpecial + mainForAia - aiaOnMain > 0) notes.push("Spending beyond the Annual Investment Allowance goes into the pools for writing down allowances.");

  const disposals = (pool: DisposalPool) =>
    input.disposals.filter((d) => d.pool === pool).reduce((s, d) => s + Math.max(0, Math.round(d.proceeds)), 0);

  const pool = (bf: number, additions: number, disposed: number, ratePct: number): PoolResult => {
    const before = Math.max(0, Math.round(bf)) + additions - disposed;
    if (before < 0) {
      return { broughtForward: Math.round(bf), additions, disposals: disposed, allowance: 0, smallPoolWriteOff: false, balancingCharge: up(-before), carriedForward: 0 };
    }
    if (before > 0 && before <= SMALL_POOL_LIMIT * frac) {
      return { broughtForward: Math.round(bf), additions, disposals: disposed, allowance: before, smallPoolWriteOff: true, balancingCharge: 0, carriedForward: 0 };
    }
    const allowance = down(before * (ratePct / 100) * frac);
    return { broughtForward: Math.round(bf), additions, disposals: disposed, allowance, smallPoolWriteOff: false, balancingCharge: 0, carriedForward: before - allowance };
  };

  const main = pool(input.mainPoolBroughtForward, mainPoolAdditions, disposals("main"), mainRate);
  const special = pool(input.specialPoolBroughtForward, specialPoolAdditions, disposals("special"), SPECIAL_WDA);
  // Selling an asset that had full expensing gives a balancing charge of the whole proceeds.
  const fullExpensingCharge = disposals("fullExpensing");

  if (main.smallPoolWriteOff) notes.push("Main pool is £1,000 or less, so it is written off in full.");
  if (special.smallPoolWriteOff) notes.push("Special rate pool is £1,000 or less, so it is written off in full.");
  if (mainRate !== MAIN_WDA_BEFORE && mainRate !== MAIN_WDA_AFTER) notes.push(`This period straddles 1 April 2026, so the main pool gets the hybrid rate of ${mainRate}%.`);
  if (frac !== 1) notes.push(`A short period of ${daysInclusive(input.periodFrom, input.periodTo)} days: the AIA and writing down allowances are reduced to ${(frac * 100).toFixed(1)}% of a year's.`);

  const aia = aiaOnSpecial + aiaOnMain;
  return {
    mainRate,
    yearFraction: frac,
    aiaLimit,
    aia,
    aiaOnSpecial,
    aiaOnMain,
    fullExpensing,
    zeroEmissionCars,
    main,
    special,
    fullExpensingCharge,
    totalAllowances: aia + fullExpensing + zeroEmissionCars + main.allowance + special.allowance,
    totalCharges: main.balancingCharge + special.balancingCharge + fullExpensingCharge,
    expenditure: exp,
    notes,
  };
}
