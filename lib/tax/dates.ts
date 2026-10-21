/**
 * Date arithmetic for tax periods. Dates are ISO strings (YYYY-MM-DD) and
 * every calculation is done in whole UTC days, so time zones and clock
 * changes can't move a boundary.
 */

const DAY = 86_400_000;

export const toDay = (iso: string): number => {
  const [y, m, d] = iso.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY);
};

export const fromDay = (n: number): string => new Date(n * DAY).toISOString().slice(0, 10);

/** Days from `from` to `to`, counting both. 1 Jan to 31 Dec is 365 (or 366). */
export const daysInclusive = (from: string, to: string): number => toDay(to) - toDay(from) + 1;

export const isIsoDate = (v: string): boolean =>
  /^\d{4}-\d{2}-\d{2}$/.test(v) && fromDay(toDay(v)) === v;

/**
 * The anniversary of a date. A period starting 29 February runs to
 * 28 February, so its anniversary is taken as 1 March (the day after).
 */
export function addYear(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y + 1, m - 1, d)).toISOString().slice(0, 10);
}

/**
 * Whether a period is exactly twelve months: it ends the day before the same
 * date a year after it starts. Such a period is "a year" for every limit and
 * allowance, even when it contains 29 February.
 */
export const isTwelveMonths = (from: string, to: string): boolean => toDay(addYear(from)) - 1 === toDay(to);

/** A Corporation Tax accounting period can never exceed twelve months. */
export const exceedsTwelveMonths = (from: string, to: string): boolean => toDay(to) > toDay(addYear(from)) - 1;

/** A date some months on, clamped to the end of the month (31 August + 6 months = 28 or 29 February). */
export function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const total = (m - 1) + months;
  const ny = y + Math.floor(total / 12), nm = ((total % 12) + 12) % 12;
  const last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  return `${ny}-${String(nm + 1).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

/**
 * Accounts can't be made up for more than 18 months (Companies Act 2006
 * s391 and s392), so a period of account longer than that is a mistake in
 * the dates.
 */
export const exceedsEighteenMonths = (from: string, to: string): boolean => toDay(to) > toDay(addMonths(from, 18)) - 1;

/** Months in a period, to the nearest whole month, for messages ("13 months"). */
export const monthsIn = (from: string, to: string): number => Math.round(daysInclusive(from, to) / 30.44);

/**
 * The fraction of a year a period represents, for limits and allowances that
 * are "proportionately reduced" in a period shorter than a year. A full
 * twelve-month period is exactly 1; anything shorter is days ÷ 365, the
 * approach in HMRC's and the ATT's worked examples (e.g. 275/365 × £50,000).
 */
export const yearFraction = (from: string, to: string): number =>
  isTwelveMonths(from, to) ? 1 : daysInclusive(from, to) / 365;

/** The financial year (April to March) a date falls in, named for the April. */
export const financialYearOf = (iso: string): number => {
  const [y, m] = iso.split("-").map(Number);
  return m >= 4 ? y : y - 1;
};

/** Splits a period at 1 April into the parts falling in each financial year. */
export function splitByFinancialYear(from: string, to: string): { fy: number; from: string; to: string; days: number }[] {
  const out: { fy: number; from: string; to: string; days: number }[] = [];
  let start = from;
  while (toDay(start) <= toDay(to)) {
    const fy = financialYearOf(start);
    const fyEnd = `${fy + 1}-03-31`;
    const end = toDay(fyEnd) < toDay(to) ? fyEnd : to;
    out.push({ fy, from: start, to: end, days: daysInclusive(start, end) });
    start = fromDay(toDay(end) + 1);
  }
  return out;
}
