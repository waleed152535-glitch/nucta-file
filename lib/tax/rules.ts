/**
 * The tax rules the engine applies, with the source for each.
 *
 * These change with Budgets. Each rule is dated, so a return for an older
 * period is worked out on the rules that applied then. When the rules move,
 * this file is the one place to change, and the tests say what moved.
 *
 * Last checked: 17 October 2026.
 */

/**
 * Corporation Tax rates from FY2023 (1 April 2023): 19% small profits rate up
 * to the lower limit, 25% main rate from the upper limit, marginal relief in
 * between at a fraction of 3/200 (CTM03925). Unchanged for FY2024 to FY2026.
 */
export const CT_FROM_FY2023 = {
  firstYear: 2023,
  smallRate: 0.19,
  mainRate: 0.25,
  lowerLimit: 50_000,
  upperLimit: 250_000,
  marginalFraction: 3 / 200,
} as const;

/**
 * The latest financial year whose rates have been checked. A period running
 * past it is refused rather than guessed at.
 */
export const LAST_CHECKED_FY = 2026;

/** Annual Investment Allowance: £1,000,000 a year, proportionately reduced for a short period (CA23085). */
export const AIA_ANNUAL = 1_000_000;

/**
 * Full expensing: a 100% first-year allowance for companies on new and
 * unused main-rate plant and machinery, other than cars, from 1 April 2023.
 */
export const FULL_EXPENSING_FROM = "2023-04-01";

/**
 * 100% first-year allowance on new and unused zero-emission cars, which "will
 * now expire on 31 March 2027 for Corporation Tax purposes" (GOV.UK policy
 * paper, Budget 2025).
 */
export const ZERO_EMISSION_CAR_FYA_UNTIL = "2027-03-31";

/** Cars above this many grams of CO2 per km go in the special rate pool. */
export const CAR_CO2_MAIN_POOL_MAX = 50;

/**
 * Main pool writing down allowance: 18%, falling to 14% from 1 April 2026 for
 * companies (GOV.UK policy paper, Budget 2025).
 */
export const MAIN_WDA_BEFORE = 18;
export const MAIN_WDA_AFTER = 14;
export const MAIN_WDA_CHANGE = "2026-04-01";

/** Special rate pool writing down allowance: 6%. */
export const SPECIAL_WDA = 6;

/** A pool of £1,000 or less (before writing down) can be written off in full (CAA 2001 s56A). */
export const SMALL_POOL_LIMIT = 1_000;
