/**
 * VAT returns under Making Tax Digital: the rules, with nothing that touches
 * the network or the database, so each can be tested on its own.
 *
 *  - the VAT registration number and its check digits;
 *  - the nine boxes, how boxes 3 and 5 follow from the others, and the
 *    limits HMRC's API puts on each;
 *  - reading the nine boxes from a spreadsheet (a digital link, as MTD needs);
 *  - the fraud prevention headers HMRC require with every call, for a web
 *    application that reaches HMRC through its own server.
 */

// ---- the VAT number ----

/** A VAT number as typed — "GB 123 4567 89" — reduced to its nine digits, or null. */
export function cleanVrn(raw: string): string | null {
  const v = String(raw ?? "").replace(/\s|-/g, "").toUpperCase().replace(/^GB/, "");
  return /^\d{9}$/.test(v) ? v : null;
}

/**
 * Whether a nine-digit VAT number's check digits work: the first seven
 * digits weighted 8 down to 2, plus the last two, come to a multiple of 97 —
 * or, for numbers issued since 2010, to one once 55 is added.
 */
export function vrnCheckDigitsOk(vrn: string): boolean {
  if (!/^\d{9}$/.test(vrn)) return false;
  const d = vrn.split("").map(Number);
  const sum = d.slice(0, 7).reduce((s, x, i) => s + x * (8 - i), 0);
  const check = d[7] * 10 + d[8];
  return (sum + check) % 97 === 0 || (sum + check + 55) % 97 === 0;
}

// ---- the nine boxes ----

export interface VatBoxes {
  /** Box 1: VAT due on sales and other outputs. */
  vatDueSales: number;
  /** Box 2: VAT due on goods brought into Northern Ireland from the EU. */
  vatDueAcquisitions: number;
  /** Box 3: boxes 1 and 2 together. */
  totalVatDue: number;
  /** Box 4: VAT reclaimed on purchases and other inputs. */
  vatReclaimedCurrPeriod: number;
  /** Box 5: the difference between boxes 3 and 4, always positive. */
  netVatDue: number;
  /** Box 6: sales and other outputs, excluding VAT, whole pounds. */
  totalValueSalesExVAT: number;
  /** Box 7: purchases and other inputs, excluding VAT, whole pounds. */
  totalValuePurchasesExVAT: number;
  /** Box 8: goods supplied from Northern Ireland to the EU, whole pounds. */
  totalValueGoodsSuppliedExVAT: number;
  /** Box 9: goods brought into Northern Ireland from the EU, whole pounds. */
  totalAcquisitionsExVAT: number;
}

export const BOXES: { key: keyof VatBoxes; n: number; label: string; whole: boolean; worked?: boolean }[] = [
  { key: "vatDueSales", n: 1, label: "VAT due on sales and other outputs", whole: false },
  { key: "vatDueAcquisitions", n: 2, label: "VAT due on goods brought into Northern Ireland from the EU", whole: false },
  { key: "totalVatDue", n: 3, label: "Total VAT due (boxes 1 and 2)", whole: false, worked: true },
  { key: "vatReclaimedCurrPeriod", n: 4, label: "VAT reclaimed on purchases and other inputs", whole: false },
  { key: "netVatDue", n: 5, label: "Net VAT to pay to HMRC or reclaim (difference between boxes 3 and 4)", whole: false, worked: true },
  { key: "totalValueSalesExVAT", n: 6, label: "Total value of sales and other outputs, excluding VAT", whole: true },
  { key: "totalValuePurchasesExVAT", n: 7, label: "Total value of purchases and other inputs, excluding VAT", whole: true },
  { key: "totalValueGoodsSuppliedExVAT", n: 8, label: "Goods supplied from Northern Ireland to the EU, excluding VAT", whole: true },
  { key: "totalAcquisitionsExVAT", n: 9, label: "Goods brought into Northern Ireland from the EU, excluding VAT", whole: true },
];

const pence = (n: number) => Math.round(n * 100) / 100;

/** Boxes 3 and 5 worked out from the others; boxes 6 to 9 to whole pounds. */
export function completeBoxes(b: Partial<VatBoxes>): VatBoxes {
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  const box1 = pence(num(b.vatDueSales)), box2 = pence(num(b.vatDueAcquisitions)), box4 = pence(num(b.vatReclaimedCurrPeriod));
  const box3 = pence(box1 + box2);
  return {
    vatDueSales: box1, vatDueAcquisitions: box2, totalVatDue: box3, vatReclaimedCurrPeriod: box4, netVatDue: pence(Math.abs(box3 - box4)),
    totalValueSalesExVAT: Math.trunc(num(b.totalValueSalesExVAT)), totalValuePurchasesExVAT: Math.trunc(num(b.totalValuePurchasesExVAT)),
    totalValueGoodsSuppliedExVAT: Math.trunc(num(b.totalValueGoodsSuppliedExVAT)), totalAcquisitionsExVAT: Math.trunc(num(b.totalAcquisitionsExVAT)),
  };
}

const MONEY_MAX = 9_999_999_999_999.99;
const NET_MAX = 99_999_999_999.99;
const WHOLE_MAX = 9_999_999_999_999;

/** What's wrong with a set of boxes before HMRC see it, in words. */
export function checkBoxes(b: VatBoxes): string[] {
  const out: string[] = [];
  const twoDp = (v: number) => Math.abs(Math.round(v * 100) - v * 100) < 1e-6;
  for (const x of BOXES) {
    const v = b[x.key];
    if (typeof v !== "number" || !Number.isFinite(v)) { out.push(`Box ${x.n} needs a number.`); continue; }
    if (x.whole && !Number.isInteger(v)) out.push(`Box ${x.n} is in whole pounds, with no pence.`);
    if (!x.whole && !twoDp(v)) out.push(`Box ${x.n} can have at most two decimal places.`);
    const max = x.key === "netVatDue" ? NET_MAX : x.whole ? WHOLE_MAX : MONEY_MAX;
    if (Math.abs(v) > max) out.push(`Box ${x.n} is too large for HMRC to accept.`);
  }
  if (b.netVatDue < 0) out.push("Box 5 is never negative: it's the difference between boxes 3 and 4.");
  if (Math.abs(pence(b.vatDueSales + b.vatDueAcquisitions) - b.totalVatDue) > 0.001) out.push("Box 3 should be boxes 1 and 2 added together.");
  if (Math.abs(pence(Math.abs(b.totalVatDue - b.vatReclaimedCurrPeriod)) - b.netVatDue) > 0.001) out.push("Box 5 should be the difference between boxes 3 and 4.");
  return out;
}

/** What goes to HMRC: the nine boxes, the period key, and the declaration. */
export function returnBody(periodKey: string, b: VatBoxes) {
  return { periodKey, ...b, finalised: true };
}

export const DECLARATION = "When you submit this VAT information you are making a legal declaration that the information is true and complete. A false declaration can result in prosecution.";

/** Whether the VAT is to pay, to reclaim, or nothing. */
export const vatOutcome = (b: VatBoxes): "pay" | "reclaim" | "nil" =>
  b.netVatDue === 0 ? "nil" : b.totalVatDue >= b.vatReclaimedCurrPeriod ? "pay" : "reclaim";

/** A period key as HMRC send it: four characters, letters, digits or #. */
export const periodKeyOk = (k: string) => /^[A-Za-z0-9#]{4}$/.test(k);

// ---- a spreadsheet of the nine boxes ----

const PHRASES: [keyof VatBoxes, RegExp][] = [
  ["vatDueSales", /vat due (in (the|this) period )?on sales/i],
  ["vatDueAcquisitions", /vat due (in (the|this) period )?on (acquisitions|goods brought)/i],
  ["totalVatDue", /total vat due/i],
  ["vatReclaimedCurrPeriod", /vat reclaimed/i],
  ["netVatDue", /net vat/i],
  ["totalValueSalesExVAT", /total value of sales/i],
  ["totalValuePurchasesExVAT", /total value of purchases/i],
  ["totalValueGoodsSuppliedExVAT", /(total value of )?(all )?(supplies of )?goods (and related costs, )?(excluding any vat, )?(supplied|to (other )?eu)/i],
  ["totalAcquisitionsExVAT", /(total value of )?(all )?acquisitions|goods brought into northern ireland/i],
];

const asNumber = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v !== "string") return null;
  let t = v.trim().replace(/[£,\s]/g, "");
  let neg = false;
  if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1); }
  if (/^[−-]/.test(t)) { neg = true; t = t.slice(1); }
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  return neg ? -Number(t) : Number(t);
};

/**
 * The nine boxes from a spreadsheet's rows — a VAT return report exported
 * from the bookkeeping, or a sheet with a row per box. A row counts when it
 * names a box ("Box 1", or the box's wording) and has a number in it; the
 * number is the last one in the row, so a "Box 1" heading cell isn't taken
 * for the amount.
 */
export function boxesFromRows(rows: unknown[][]): { boxes: Partial<VatBoxes>; found: (keyof VatBoxes)[]; problems: string[] } {
  const boxes: Partial<VatBoxes> = {};
  const found: (keyof VatBoxes)[] = [];
  for (const row of rows) {
    const cells = row.map((c) => (c === null || c === undefined ? "" : c));
    const text = cells.filter((c) => typeof c === "string").join(" ");
    let key: keyof VatBoxes | undefined;
    const m = /\bbox\s*([1-9])\b/i.exec(text);
    if (m) key = BOXES[Number(m[1]) - 1].key;
    else key = PHRASES.find(([, re]) => re.test(text))?.[0];
    if (!key || found.includes(key)) continue;
    const nums = cells.map(asNumber).filter((n): n is number => n !== null);
    // A bare box number on its own ("1") isn't an amount.
    const amount = m && nums.length > 1 && nums[0] === Number(m[1]) ? nums[nums.length - 1] : nums[nums.length - 1];
    if (amount === undefined) continue;
    boxes[key] = amount;
    found.push(key);
  }
  const problems: string[] = [];
  const need: (keyof VatBoxes)[] = ["vatDueSales", "vatReclaimedCurrPeriod", "totalValueSalesExVAT", "totalValuePurchasesExVAT"];
  const missing = need.filter((k) => !found.includes(k));
  if (missing.length === need.length) problems.push("No VAT return figures were found. The sheet needs a row for each box, labelled “Box 1” to “Box 9” or with the box's wording, and the amount in the same row.");
  else if (missing.length) problems.push(`These boxes weren't found, so they're 0: ${missing.map((k) => `box ${BOXES.findIndex((b) => b.key === k) + 1}`).join(", ")}.`);
  return { boxes, found, problems };
}

// ---- fraud prevention headers ----

/** What the browser reports about itself, sent along with each request to the server. */
export interface ClientInfo {
  deviceId: string;
  userAgent: string;
  /** e.g. "UTC+01:00" */
  timezone: string;
  screens: { width: number; height: number; scalingFactor: number; colourDepth: number }[];
  window: { width: number; height: number };
}

/** What the server knows about the request. */
export interface ServerInfo {
  clientIp: string | null;
  clientIpAt: string;
  clientPort: string | null;
  vendorIp: string | null;
  userId: string;
  productVersion: string;
}

const enc = encodeURIComponent;

/** Checks the browser's report, so nothing malformed goes to HMRC. */
export function checkClientInfo(c: unknown): ClientInfo | null {
  const o = (c ?? {}) as Record<string, unknown>;
  const int = (v: unknown, max = 100_000) => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= max ? v : null);
  const deviceId = typeof o.deviceId === "string" && /^[0-9a-f-]{36}$/i.test(o.deviceId) ? o.deviceId : null;
  const userAgent = typeof o.userAgent === "string" && o.userAgent.length > 0 && o.userAgent.length < 1000 ? o.userAgent : null;
  const timezone = typeof o.timezone === "string" && /^UTC[+-]\d{2}:\d{2}$/.test(o.timezone) ? o.timezone : null;
  const w = (o.window ?? {}) as Record<string, unknown>;
  const screens = Array.isArray(o.screens) ? (o.screens as Record<string, unknown>[]).slice(0, 8).map((s) => ({
    width: int(s.width), height: int(s.height), scalingFactor: typeof s.scalingFactor === "number" && s.scalingFactor > 0 && s.scalingFactor < 20 ? s.scalingFactor : null, colourDepth: int(s.colourDepth, 128),
  })) : [];
  if (!deviceId || !userAgent || !timezone || !screens.length || screens.some((s) => s.width === null || s.height === null || s.scalingFactor === null || s.colourDepth === null) || int(w.width) === null || int(w.height) === null) return null;
  return { deviceId, userAgent, timezone, screens: screens as ClientInfo["screens"], window: { width: w.width as number, height: w.height as number } };
}

/**
 * The headers for the WEB_APP_VIA_SERVER connection method. Gov-Client-Public-Port
 * is sent only when the host passes it on; Gov-Client-Multi-Factor and
 * Gov-Vendor-License-IDs are left out because Nucta File uses neither.
 */
export function fraudHeaders(c: ClientInfo, s: ServerInfo): Record<string, string> {
  const h: Record<string, string> = {
    "Gov-Client-Connection-Method": "WEB_APP_VIA_SERVER",
    "Gov-Client-Browser-JS-User-Agent": c.userAgent,
    "Gov-Client-Device-ID": c.deviceId,
    "Gov-Client-Timezone": c.timezone,
    "Gov-Client-Screens": c.screens.map((x) => `width=${x.width}&height=${x.height}&scaling-factor=${x.scalingFactor}&colour-depth=${x.colourDepth}`).join(","),
    "Gov-Client-Window-Size": `width=${c.window.width}&height=${c.window.height}`,
    "Gov-Client-User-IDs": `nucta-file=${enc(s.userId)}`,
    "Gov-Vendor-Product-Name": enc("Nucta File"),
    "Gov-Vendor-Version": `${enc("Nucta File")}=${enc(s.productVersion)}`,
  };
  if (s.clientIp) {
    h["Gov-Client-Public-IP"] = s.clientIp;
    h["Gov-Client-Public-IP-Timestamp"] = s.clientIpAt;
  }
  if (s.clientPort) h["Gov-Client-Public-Port"] = s.clientPort;
  if (s.vendorIp) h["Gov-Vendor-Public-IP"] = s.vendorIp;
  if (s.vendorIp && s.clientIp) h["Gov-Vendor-Forwarded"] = `by=${enc(s.vendorIp)}&for=${enc(s.clientIp)}`;
  return h;
}

/** HMRC's error codes, in words for the person submitting. */
export function hmrcVatError(status: number, body: unknown): string {
  const o = (body ?? {}) as { code?: string; message?: string; errors?: { code?: string; message?: string; path?: string }[] };
  const codes = [o.code, ...(o.errors ?? []).map((e) => e.code)].filter(Boolean) as string[];
  const has = (c: string) => codes.includes(c);
  if (has("DUPLICATE_SUBMISSION")) return "HMRC already have a return for this period. It can't be sent again; to correct it, tell HMRC about the error (form VAT652) or adjust the next return if the rules allow.";
  if (has("TAX_PERIOD_NOT_ENDED")) return "This VAT period hasn't ended yet, so HMRC won't take its return until it has.";
  if (has("INVALID_VRN") || has("VRN_INVALID")) return "HMRC say the VAT number isn't valid. Check it on the company's VAT certificate.";
  if (has("CLIENT_OR_AGENT_NOT_AUTHORISED") || status === 403 && has("FORBIDDEN")) return "The HMRC sign-in connected here isn't allowed to see this VAT number. Connect with the business's own sign-in, or an agent services account the business has authorised for VAT.";
  if (has("INVALID_CREDENTIALS") || status === 401) return "HMRC didn't accept the connection — it may have expired. Connect to HMRC again.";
  if (has("NOT_SIGNED_UP_TO_MTD") || has("VRN_NOT_FOUND")) return "This VAT number isn't signed up for Making Tax Digital at HMRC yet. The business signs up on GOV.UK first.";
  if (has("INSOLVENT_TRADER")) return "HMRC have this business marked as insolvent, so its returns can't be sent through software.";
  if (has("DATE_RANGE_TOO_LARGE")) return "Asked HMRC about too long a period at once.";
  if (has("NOT_FOUND") || status === 404) return "HMRC have nothing for that VAT number and period.";
  if (has("MATCHING_RESOURCE_NOT_FOUND")) return "HMRC have no record of that.";
  if (status === 429) return "HMRC are receiving too many requests. Try again in a minute.";
  if (status >= 500) return "HMRC's service had a problem. Try again in a few minutes.";
  return `HMRC turned it down (${status})${o.message ? `: ${String(o.message).slice(0, 200)}` : ""}.`;
}
