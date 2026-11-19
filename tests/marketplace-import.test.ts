/**
 * Amazon and eBay sellers' reports read into the profit and loss.
 * Run: npx tsx tests/marketplace-import.test.ts
 */
import { readFileSync } from "fs";
import { addTotals, forProfitAndLoss, readMarketplaceReport, reportDate, totalFees } from "../lib/marketplace-import";

let passed = 0, failed = 0;
const eq = (name: string, got: unknown, want: unknown) => { if (JSON.stringify(got) === JSON.stringify(want)) passed++; else { failed++; console.log("FAIL", name, JSON.stringify({ got, want })); } };

console.log("— dates as the reports write them");
eq("Amazon UK", reportDate("1 Aug 2025 00:15:23 GMT+1"), "2025-08-01");
eq("Amazon US style", reportDate("Aug 1, 2025 12:15:23 AM PDT"), "2025-08-01");
eq("day first with slashes", reportDate("01/08/2025 00:15:23 UTC"), "2025-08-01");
eq("ISO", reportDate("2025-08-01T00:15:23Z"), "2025-08-01");
eq("eBay", reportDate("Aug 03, 2025"), "2025-08-03");
eq("short year", reportDate("03-Aug-25"), "2025-08-03");
eq("nonsense", reportDate("Mystery row"), null);

console.log("— an Amazon transaction report");
const a = readMarketplaceReport(readFileSync("tests/fixtures/amazon-uk-transactions.csv", "utf8"), "2025-08-01", "2026-07-31");
eq("read", [a.ok, a.source], [true, "amazon"]);
eq("rows counted", [a.rows, a.inPeriod, a.outside, a.undated], [11, 8, 2, 1]);
// 40 + 3.99 − 2 promotion; 25; −25 refund
eq("sales, less refunds and promotions", a.totals.sales, 41.99);
eq("refunds", a.totals.refunds, -25);
eq("selling fees net of the refunded fee", a.totals.fees.selling, 6.75);
eq("FBA fees", a.totals.fees.fulfilment, 5.4);
eq("subscription", a.totals.fees.subscription, 30);
eq("advertising", a.totals.fees.advertising, 12.34);
eq("storage", a.totals.fees.storage, 4.1);
eq("reimbursement is other income", a.totals.reimbursements, 8.2);
eq("payout to the bank is neither", a.totals.payouts, 25);
eq("nothing unrecognised", a.unrecognised, []);
eq("a warning for the undated row", a.warnings.some((w) => w.includes("no date")), true);

console.log("— an eBay transaction report");
const e = readMarketplaceReport(readFileSync("tests/fixtures/ebay-uk-transactions.csv", "utf8"), "2025-08-01", "2026-07-31");
eq("read", [e.ok, e.source], [true, "ebay"]);
eq("sales less the refund", e.totals.sales, 2.5);
eq("refunds", e.totals.refunds, -18);
eq("final value fees", e.totals.fees.selling, 2.85);
eq("postage labels", e.totals.fees.postage, 3.2);
eq("promoted listings", e.totals.fees.advertising, 5);
eq("shop subscription", e.totals.fees.subscription, 25);
eq("payouts", e.totals.payouts, 10);
eq("pounds only: no currency warning", e.warnings.some((w) => w.includes("convert")), false);

console.log("— together, into the profit and loss");
const t = addTotals([a.totals, e.totals]);
eq("fees together", Math.round(totalFees(t) * 100) / 100, Math.round((totalFees(a.totals) + totalFees(e.totals)) * 100) / 100);
const pl = forProfitAndLoss(t, null);
eq("turnover in whole pounds", pl.turnover, 44);
eq("other income", pl.otherIncome, 8);
eq("expenses", pl.otherCharges, Math.round(totalFees(t)));
const vat = forProfitAndLoss({ ...t, sales: 1200 }, 20);
eq("VAT taken out at 20%", [vat.turnover, vat.vatRemoved], [1000, 200]);

console.log("— not a marketplace report");
const x = readMarketplaceReport("Account,Debit,Credit\nSales,,100\n", "2025-08-01", "2026-07-31");
eq("refused with a reason", [x.ok, Boolean(x.problem)], [false, true]);

console.log(`${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
