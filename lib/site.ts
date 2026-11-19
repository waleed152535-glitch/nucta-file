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

/** The address Nucta File lives at once its own domain is connected. */
export const HOME_DOMAIN = "nuctafilings.co.uk";

const trim = (v: string) => v.trim().replace(/\/+$/, "");

/**
 * The site's own address, with no trailing slash: NUCTA_SITE_URL when it is
 * set, else the hosting's production address (Vercel picks the custom domain
 * once one is connected), else the home domain. Never a request's Host header,
 * which a visitor can forge.
 *
 * Static pages are built with whatever this is at build time, so
 * NUCTA_SITE_URL must be in the hosting settings before the build that
 * should use it.
 */
export function siteOrigin(): string {
  const set = process.env.NUCTA_SITE_URL?.trim();
  if (set) return trim(set);
  const prod = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (prod) return trim(/^https?:\/\//.test(prod) ? prod : `https://${prod}`);
  return `https://${HOME_DOMAIN}`;
}

/** A full address for a path on this site: absolute("/guides") → https://…/guides */
export const absolute = (path = "/"): string => `${siteOrigin()}${path.startsWith("/") ? path : `/${path}`}`;

/**
 * The host every visitor should end up on, or null when none is chosen.
 * Only NUCTA_SITE_URL chooses one: until it is set, the site answers on
 * every address it has, so connecting a domain can't break anything.
 */
export function canonicalHost(): string | null {
  const set = process.env.NUCTA_SITE_URL?.trim();
  if (!set) return null;
  try { return new URL(set).host.toLowerCase(); } catch { return null; }
}
