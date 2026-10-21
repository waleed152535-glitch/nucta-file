/**
 * The website's facts in one place: who runs Nucta File, how to reach them,
 * and the prices. Change them here and every page follows.
 */

export const SITE = {
  product: "Nucta File",
  company: "Nucta Formations Ltd",
  /** Shown in the footer and legal pages once filled in. */
  companyNumber: process.env.NUCTA_COMPANY_NUMBER ?? "",
  registeredOffice: process.env.NUCTA_REGISTERED_OFFICE ?? "",
  email: process.env.NUCTA_CONTACT_EMAIL ?? "waleed@nuctaformations.com",
  parentSite: "https://nuctaformations.com",
  /** HMRC vendor ID for Corporation Tax XML filing. */
  vendorId: "9754",
};

/**
 * Prices at launch. Nothing is charged until live filing opens: until then
 * every return can be prepared, checked and tested free.
 */
export const PRICES = {
  company: { perReturn: 39, dormant: 15 },
  practice: { perReturn: 19, dormant: 9 },
};

export const gbp = (n: number) => `£${n.toLocaleString("en-GB")}`;
