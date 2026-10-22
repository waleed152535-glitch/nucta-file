import { lateFiling, paymentReferenceProblem, tidyReference, leftToPay, receiptEmailText, HMRC_BANK } from "../lib/filing-rules";
import { deadlinesFor } from "../lib/deadlines";

let passed = 0, failed = 0;
const t = (name: string, ok: boolean, got?: unknown) => { if (ok) passed++; else { failed++; console.log("FAIL", name, got === undefined ? "" : JSON.stringify(got)); } };
const eq = (name: string, got: unknown, want: unknown) => t(name, JSON.stringify(got) === JSON.stringify(want), { got, want });

console.log("— late filing penalties");
eq("on time", lateFiling("2026-12-31", "2026-12-31"), null);
eq("before the deadline", lateFiling("2026-12-31", "2026-06-01"), null);
const a = lateFiling("2026-06-30", "2026-07-01")!;
eq("one day late, deadline after 1 April 2026", [a.daysLate, a.first, a.fixed, a.repeat, a.taxGeared], [1, 200, 200, 1000, 0]);
const b = lateFiling("2026-03-31", "2026-04-15")!;
eq("deadline before 1 April 2026: old amounts", [b.first, b.fixed, b.repeat], [100, 100, 500]);
const c = lateFiling("2026-04-01", "2026-07-02")!;
eq("deadline on 1 April 2026: doubled; three months late", [c.first, c.fixed], [200, 400]);
eq("exactly three months late is not yet the second penalty", lateFiling("2026-04-30", "2026-07-30")!.fixed, 200);
eq("six months late", lateFiling("2026-04-30", "2026-11-01")!.taxGeared, 1);
eq("twelve months late", lateFiling("2025-04-30", "2026-05-01")!.taxGeared, 2);
t("words mention the amount", a.words[0].includes("£200"), a.words);

console.log("— payment references");
eq("blank is fine", paymentReferenceProblem("", "1234567890"), null);
eq("good", paymentReferenceProblem("1234567890A00125A", "1234567890"), null);
eq("spaces and lower case", paymentReferenceProblem("12345 67890 a001 25a", "1234567890"), null);
t("wrong shape", Boolean(paymentReferenceProblem("1234567890", "1234567890")));
t("another company's UTR", (paymentReferenceProblem("9999999999A00125A", "1234567890") ?? "").includes("1234567890"));
eq("tidied", tidyReference(" 1234567890 a001 25 a "), "1234567890A00125A");
eq("not a reference", tidyReference("hello"), "");

console.log("— what's left to pay");
eq("nothing paid", leftToPay(1000, []), 1000);
eq("part paid", leftToPay(1000, [{ amount: 400.5 }]), 599.5);
eq("over paid", leftToPay(1000, [{ amount: 1200 }]), 0);

console.log("— bank details");
eq("Cumbernauld first", [HMRC_BANK[0].name, HMRC_BANK[0].sortCode, HMRC_BANK[0].account], ["HMRC Cumbernauld", "08 32 10", "12001039"]);
eq("Shipley", [HMRC_BANK[1].sortCode, HMRC_BANK[1].account], ["08 32 10", "12001020"]);

console.log("— receipt email");
const m = receiptEmailText({ company: "Atnep Example Ltd", utr: "1234567890", periodFrom: "2024-04-01", periodTo: "2025-03-31", filedAt: "2026-10-22T10:00:00Z", correlationId: "ABC", irmark: "XYZ=", receiptText: "HMRC has received the return", payable: 1234.5, taxDue: "2026-01-01", sender: "Nucta Formations" });
t("subject names the company", m.subject.includes("Atnep Example Ltd"), m.subject);
t("has the amount and bank", m.text.includes("£1,234.50") && m.text.includes("12001039") && m.text.includes("1234567890"), m.text);
const z = receiptEmailText({ company: "X Ltd", utr: null, periodFrom: "2024-04-01", periodTo: "2025-03-31", filedAt: "2026-10-22T10:00:00Z", correlationId: null, irmark: null, receiptText: null, payable: 0, taxDue: "", sender: "Y" });
t("nothing to pay says so", z.text.includes("no Corporation Tax to pay") && !z.text.includes("12001039"), z.text);

console.log("— recorded payments clear the deadline");
const co = [{ id: "c1", name: "A Ltd", companyNo: "1", incorporatedOn: "2020-01-01", ch: null }];
const ret = (paid: number) => [{ id: "r1", companyId: "c1", periodStart: "2025-04-01", periodEnd: "2026-03-31", status: "accepted", amendment: false, taxByPart: [{ to: "2026-03-31", tax: 1000 }], paidByPart: paid ? [{ to: "2026-03-31", amount: paid }] : [] }];
const pay = (paid: number, today: string) => deadlinesFor(co, ret(paid), today).filter((d) => d.kind === "ct-payment");
eq("unpaid, before due", pay(0, "2026-10-01").map((d) => d.amount), [1000]);
eq("part paid shows what's left", pay(400, "2026-10-01").map((d) => [d.label, d.amount]), [["Corporation Tax left to pay", 600]]);
eq("fully paid disappears", pay(1000, "2026-10-01").length, 0);
eq("filed, unpaid, after due: hidden as before (may be paid elsewhere)", pay(0, "2027-02-01").length, 0);
eq("filed, part paid, after due: still shown", pay(400, "2027-02-01").map((d) => d.state), ["overdue"]);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
