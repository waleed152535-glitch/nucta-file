import { boxesFromRows, checkBoxes, checkClientInfo, cleanVrn, completeBoxes, fraudHeaders, hmrcVatError, periodKeyOk, returnBody, vatOutcome, vrnCheckDigitsOk } from "../lib/vat-rules";

let passed = 0, failed = 0;
const t = (name: string, ok: boolean, got?: unknown) => { if (ok) passed++; else { failed++; console.log("FAIL", name, got === undefined ? "" : JSON.stringify(got)); } };
const eq = (name: string, got: unknown, want: unknown) => t(name, JSON.stringify(got) === JSON.stringify(want), { got, want });

console.log("— the VAT number");
eq("GB and spaces dropped", cleanVrn("GB 999 9999 73"), "999999973");
eq("too short", cleanVrn("12345678"), null);
eq("letters", cleanVrn("GB12345678A"), null);
t("old-style check digits", vrnCheckDigitsOk("999999973") && vrnCheckDigitsOk("123456782"));
t("new-style check digits (plus 55)", vrnCheckDigitsOk("123456727"));
t("wrong check digits", !vrnCheckDigitsOk("123456789") && !vrnCheckDigitsOk("999999974"));

console.log("— the nine boxes");
const b = completeBoxes({ vatDueSales: 1250.5, vatDueAcquisitions: 0, vatReclaimedCurrPeriod: 340.25, totalValueSalesExVAT: 6252.9, totalValuePurchasesExVAT: 1701.2, totalValueGoodsSuppliedExVAT: 0, totalAcquisitionsExVAT: 0 });
eq("box 3 is boxes 1 and 2", b.totalVatDue, 1250.5);
eq("box 5 the difference", b.netVatDue, 910.25);
eq("boxes 6 to 9 to whole pounds, pence dropped", [b.totalValueSalesExVAT, b.totalValuePurchasesExVAT], [6252, 1701]);
eq("a good return has no problems", checkBoxes(b), []);
eq("to pay", vatOutcome(b), "pay");
const back = completeBoxes({ vatDueSales: 100, vatReclaimedCurrPeriod: 400 });
eq("a repayment: box 5 still positive", [back.netVatDue, vatOutcome(back)], [300, "reclaim"]);
eq("nil", vatOutcome(completeBoxes({})), "nil");
t("pence in box 6 refused", checkBoxes({ ...b, totalValueSalesExVAT: 10.5 }).some((p) => /Box 6 is in whole pounds/.test(p)));
t("three decimals refused", checkBoxes({ ...b, vatDueSales: 1.234, totalVatDue: 1.234, netVatDue: 339.016 }).some((p) => /Box 1 can have at most two/.test(p)));
t("box 3 that doesn't add up refused", checkBoxes({ ...b, totalVatDue: 1000 }).some((p) => /Box 3 should be/.test(p)));
t("negative box 5 refused", checkBoxes({ ...b, netVatDue: -910.25 }).some((p) => /never negative/.test(p)));
t("too large refused", checkBoxes(completeBoxes({ totalValueSalesExVAT: 1e14 })).some((p) => /too large/.test(p)));
eq("the body for HMRC", returnBody("24A1", b), { periodKey: "24A1", ...b, finalised: true });
t("period keys", periodKeyOk("24A1") && periodKeyOk("#001") && !periodKeyOk("24A") && !periodKeyOk("24A1x"));
t("negative box 1 allowed (credit notes)", checkBoxes(completeBoxes({ vatDueSales: -50 })).length === 0);

console.log("— a spreadsheet of the boxes");
const xero = [
  ["VAT Return", "", ""], ["Brightshelf Trading Ltd", "", ""], ["1 July 2026 to 30 September 2026", "", ""],
  ["Box 1", "VAT due in this period on sales and other outputs", "1,250.50"],
  ["Box 2", "VAT due in this period on acquisitions of goods made in Northern Ireland from EU Member States", "0.00"],
  ["Box 3", "Total VAT due (the sum of boxes 1 and 2)", "1,250.50"],
  ["Box 4", "VAT reclaimed in this period on purchases and other inputs", "340.25"],
  ["Box 5", "Net VAT to be paid to HMRC or reclaimed by you", "910.25"],
  ["Box 6", "Total value of sales and all other outputs excluding any VAT", "6,252"],
  ["Box 7", "Total value of purchases and all other inputs excluding any VAT", "1,701"],
  ["Box 8", "Total value of all supplies of goods and related costs, excluding any VAT, to EU Member States", "0"],
  ["Box 9", "Total value of all acquisitions of goods and related costs, excluding any VAT, from EU Member States", "0"],
];
const r = boxesFromRows(xero);
eq("Xero's layout: all nine found", r.found.length, 9);
eq("Xero's layout: the amounts", completeBoxes(r.boxes), b);
eq("no problems", r.problems, []);
const plain = boxesFromRows([["box", "amount"], [1, 1250.5], [4, 340.25], [6, 6252], [7, 1701]]);
eq("a bare number in the first column isn't a box label", plain.found.length, 0);
const labelled = boxesFromRows([["Box 1", 1250.5], ["Box 4", 340.25], ["Box 6", 6252], ["Box 7", 1701]]);
eq("box labels with numbers", [labelled.boxes.vatDueSales, labelled.boxes.vatReclaimedCurrPeriod, labelled.boxes.totalValueSalesExVAT], [1250.5, 340.25, 6252]);
const words = boxesFromRows([["VAT due on sales", "£1,000.00"], ["VAT reclaimed on purchases", "(200.00)"], ["Total value of sales", "5000"], ["Total value of purchases", "1000"]]);
eq("by the box's wording, with £ and brackets", [words.boxes.vatDueSales, words.boxes.vatReclaimedCurrPeriod], [1000, -200]);
t("missing boxes named", boxesFromRows([["Box 1", 10]]).problems.some((p) => /box 4, box 6, box 7/.test(p)));
t("nothing found says how the sheet should look", boxesFromRows([["Hello"]]).problems[0].includes("Box 1"));

console.log("— fraud prevention headers");
const client = { deviceId: "beec798b-b366-47fa-b1f8-92cede14a1ce", userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", timezone: "UTC+05:00", screens: [{ width: 1920, height: 1080, scalingFactor: 1.25, colourDepth: 24 }], window: { width: 1256, height: 803 } };
t("a good browser report passes", checkClientInfo(client) !== null);
t("a bad device ID fails", checkClientInfo({ ...client, deviceId: "x" }) === null);
t("a bad time zone fails", checkClientInfo({ ...client, timezone: "PKT" }) === null);
t("no screens fails", checkClientInfo({ ...client, screens: [] }) === null);
t("nothing fails", checkClientInfo(undefined) === null);
const h = fraudHeaders(client, { clientIp: "203.0.113.6", clientIpAt: "2026-10-26T10:39:57.123Z", clientPort: null, vendorIp: "198.51.100.7", userId: "u 1", productVersion: "50" });
eq("connection method", h["Gov-Client-Connection-Method"], "WEB_APP_VIA_SERVER");
eq("screens", h["Gov-Client-Screens"], "width=1920&height=1080&scaling-factor=1.25&colour-depth=24");
eq("window", h["Gov-Client-Window-Size"], "width=1256&height=803");
eq("user IDs, encoded", h["Gov-Client-User-IDs"], "nucta-file=u%201");
eq("vendor version, encoded", h["Gov-Vendor-Version"], "Nucta%20File=50");
eq("forwarded", h["Gov-Vendor-Forwarded"], "by=198.51.100.7&for=203.0.113.6");
eq("the IP and when it was read", [h["Gov-Client-Public-IP"], h["Gov-Client-Public-IP-Timestamp"]], ["203.0.113.6", "2026-10-26T10:39:57.123Z"]);
t("no port header when the host gives none", !("Gov-Client-Public-Port" in h));
t("no multi-factor or licence headers", !("Gov-Client-Multi-Factor" in h) && !("Gov-Vendor-License-IDs" in h));

console.log("— HMRC's errors in words");
t("duplicate", /already have a return/.test(hmrcVatError(403, { code: "DUPLICATE_SUBMISSION" })));
t("not ended", /hasn't ended/.test(hmrcVatError(403, { code: "TAX_PERIOD_NOT_ENDED" })));
t("nested", /isn't valid/.test(hmrcVatError(400, { code: "INVALID_REQUEST", errors: [{ code: "VRN_INVALID" }] })));
t("not authorised", /isn't allowed to see/.test(hmrcVatError(403, { code: "CLIENT_OR_AGENT_NOT_AUTHORISED" })));
t("expired", /Connect to HMRC again/.test(hmrcVatError(401, {})));
t("anything else says HMRC's words", /turned it down \(422\): Something/.test(hmrcVatError(422, { message: "Something" })));

console.log(`${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
