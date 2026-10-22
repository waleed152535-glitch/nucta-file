/**
 * What HMRC say about filing late and paying, as plain rules the filing
 * screen can show. No database, no network: tested in tests/filing-rules.
 *
 * Sources, checked October 2026:
 *   - GOV.UK, "Company Tax Returns: penalties for late filing" — £200 one
 *     day late, another £200 at three months, 10% of unpaid tax at six and
 *     twelve months, £1,000 each when late three times in a row.
 *   - The doubled amounts apply to returns whose filing date (the deadline)
 *     is on or after 1 April 2026; before that they were £100, £100 and £500
 *     (ACCA, "Fixed late filing penalties for corporation tax increase").
 *   - GOV.UK, "Pay your Corporation Tax bill: bank details".
 */
import { addMonths, toDay } from "./tax/dates";

/** The day the doubled fixed penalties start, by filing deadline. */
export const DOUBLED_FROM = "2026-04-01";

export interface LateFiling {
  daysLate: number;
  /** The fixed penalties so far, for a return whose earlier two returns were on time. */
  fixed: number;
  /** What each step costs for this deadline. */
  first: number;
  /** Late three times in a row: each fixed penalty becomes this. */
  repeat: number;
  /** Past six months late: HMRC can estimate the tax and add 10% of the unpaid tax. */
  taxGeared: 0 | 1 | 2;
  /** In words, for the screen. */
  words: string[];
}

const pounds = (n: number) => `£${n.toLocaleString("en-GB")}`;

/** Whether a return filed on `on` (yyyy-mm-dd) is late for `deadline`, and what HMRC normally charge. */
export function lateFiling(deadline: string, on: string): LateFiling | null {
  const daysLate = toDay(on) - toDay(deadline);
  if (!(daysLate > 0)) return null;
  const doubled = deadline >= DOUBLED_FROM;
  const first = doubled ? 200 : 100;
  const repeat = doubled ? 1000 : 500;
  const threeMonths = on > addMonths(deadline, 3);
  const sixMonths = on > addMonths(deadline, 6);
  const twelveMonths = on > addMonths(deadline, 12);
  const fixed = threeMonths ? first * 2 : first;
  const taxGeared: 0 | 1 | 2 = twelveMonths ? 2 : sixMonths ? 1 : 0;
  const words = [
    `The return is ${daysLate} day${daysLate === 1 ? "" : "s"} late. HMRC normally charge ${pounds(first)} for a late return${threeMonths ? `, and another ${pounds(first)} once it is three months late — ${pounds(fixed)} so far` : `, and another ${pounds(first)} if it is still not filed three months after the deadline`}.`,
  ];
  if (taxGeared) words.push(`It is more than ${twelveMonths ? "twelve" : "six"} months late, so HMRC can also estimate the tax and add ${twelveMonths ? "10% of any unpaid tax twice (at six and twelve months)" : "10% of any unpaid tax"}.`);
  words.push(`If the company's last two returns were late too, each fixed penalty is ${pounds(repeat)} instead.`);
  words.push("Filing now stops the next penalty. A penalty can be appealed with a reasonable excuse, once the return is filed.");
  return { daysLate, fixed, first, repeat, taxGeared, words };
}

/** HMRC's accounts for Corporation Tax payments. The company's notice to file says which; Cumbernauld if unsure. */
export const HMRC_BANK = [
  { name: "HMRC Cumbernauld", sortCode: "08 32 10", account: "12001039", iban: "GB62 BARC 2011 4770 2976 90", bic: "BARCGB22", usual: true },
  { name: "HMRC Shipley", sortCode: "08 32 10", account: "12001020", iban: "GB03 BARC 2011 4783 9776 92", bic: "BARCGB22", usual: false },
] as const;

export const PAY_ONLINE = "https://www.gov.uk/pay-corporation-tax";

/**
 * The 17-character payment reference: the company's 10-digit UTR, "A001",
 * two digits that change with each accounting period, and "A". HMRC print
 * it on the notice to file and show it in the company's HMRC account; the
 * two period digits are HMRC's, so Nucta File checks the shape rather than
 * guessing them.
 */
export function paymentReferenceProblem(raw: string, utr: string | null): string | null {
  const ref = raw.replace(/\s+/g, "").toUpperCase();
  if (!ref) return null;
  if (!/^\d{10}A001\d{2}A$/.test(ref)) return "The payment reference is 17 characters: the UTR, then A001, two digits for the period, and A — like 1234567890A00125A.";
  if (utr && ref.slice(0, 10) !== utr) return `The payment reference should start with the company's UTR, ${utr}.`;
  return null;
}

/** The reference as HMRC print it, without spaces, or "" if it isn't one. */
export const tidyReference = (raw: string): string => {
  const ref = raw.replace(/\s+/g, "").toUpperCase();
  return /^\d{10}A001\d{2}A$/.test(ref) ? ref : "";
};

/** What's left to pay for one return, after payments recorded. */
export function leftToPay(due: number, paid: { amount: number }[]): number {
  const left = Math.round((due - paid.reduce((t, p) => t + (p.amount || 0), 0)) * 100) / 100;
  return left > 0 ? left : 0;
}

const longDate = (iso: string) => new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
const gbp = (n: number) => `£${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** HMRC's receipt and how to pay, as an email's words. Shared by the automatic email after filing. */
export function receiptEmailText(x: {
  company: string; utr: string | null; periodFrom: string; periodTo: string; filedAt: string; correlationId: string | null; irmark: string | null;
  receiptText: string | null; payable: number; taxDue: string; filedAs?: string; sender: string;
}): { subject: string; text: string } {
  const bank = HMRC_BANK[0];
  const lines = [
    `${x.company}'s Company Tax Return for ${longDate(x.periodFrom)} to ${longDate(x.periodTo)} has been filed with HMRC.`,
    "",
    `Filed: ${new Date(x.filedAt).toLocaleString("en-GB", { timeZone: "Europe/London" })}`,
    ...(x.correlationId ? [`HMRC correlation ID: ${x.correlationId}`] : []),
    ...(x.irmark ? [`IRmark: ${x.irmark}`] : []),
    ...(x.receiptText ? ["", `HMRC said: ${x.receiptText}`] : []),
    "",
    x.payable > 0 ? `Corporation Tax to pay: ${gbp(x.payable)}, by ${longDate(x.taxDue)}.` : "There is no Corporation Tax to pay for this period.",
    ...(x.payable > 0 ? [
      `Pay ${bank.name}, sort code ${bank.sortCode}, account ${bank.account} (your notice to file may name HMRC Shipley, 12001020, instead).`,
      `Use the company's 17-character Corporation Tax payment reference for this period: it starts with the UTR${x.utr ? ` ${x.utr}` : ""}, then A001. It's on the notice to file and in the company's HMRC account.`,
      `Or pay online: ${PAY_ONLINE}`,
    ] : []),
    "",
    "Keep this email with the company's records. The full receipt is kept with the return in Nucta File.",
    "",
    `Nucta File, for ${x.sender}`,
  ];
  return { subject: `Filed with HMRC: ${x.company}, year to ${longDate(x.periodTo)}`, text: lines.join("\n") };
}
