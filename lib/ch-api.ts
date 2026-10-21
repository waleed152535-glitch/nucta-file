/**
 * Companies House's public data API: looking a company up by name or number,
 * so adding a client fills in its details — and its accounts dates — rather
 * than having them typed.
 *
 * This is the free REST API (developer.company-information.service.gov.uk),
 * separate from the XML Gateway that files accounts. It needs an API key,
 * held in CH_API_KEY and sent as the user name of HTTP Basic authentication
 * with no password. Without a key, companies are added by hand as before.
 */

export const CH_API_BASE = process.env.CH_API_BASE ?? "https://api.company-information.service.gov.uk";
export const chApiReady = (): boolean => Boolean(process.env.CH_API_KEY);

export interface ChSearchHit {
  number: string;
  name: string;
  status: string;
  incorporatedOn: string | null;
  address: string;
}

/** What Nucta File keeps from a company's Companies House record. */
export interface ChProfile {
  number: string;
  name: string;
  status: string;
  type: string;
  incorporatedOn: string | null;
  registeredOffice: string;
  sic: string[];
  /** The accounting reference date, e.g. 31 March. */
  ard: { day: number; month: number } | null;
  nextAccountsMadeUpTo: string | null;
  nextAccountsDue: string | null;
  accountsOverdue: boolean;
  lastAccountsMadeUpTo: string | null;
  confirmationStatementDue: string | null;
  /** When this was read from Companies House. */
  fetchedAt: string;
}

export type ChResult<T> = { ok: true; value: T } | { ok: false; error: string };

/** A company number as Companies House index it: eight characters, digits padded with zeros. */
export function chNumber(raw: string): string {
  const n = raw.replace(/\s/g, "").toUpperCase();
  return /^\d{1,8}$/.test(n) ? n.padStart(8, "0") : n;
}

async function get(path: string): Promise<ChResult<unknown>> {
  const key = process.env.CH_API_KEY;
  if (!key) return { ok: false, error: "Companies House search isn't set up: add CH_API_KEY to the hosting settings." };
  let res: Response;
  try {
    res = await fetch(CH_API_BASE + path, {
      headers: { Authorization: `Basic ${Buffer.from(`${key}:`).toString("base64")}`, Accept: "application/json" },
      cache: "no-store",
    });
  } catch (e) {
    return { ok: false, error: `Couldn't reach Companies House: ${String((e as Error)?.message ?? e).slice(0, 120)}` };
  }
  if (res.status === 401) return { ok: false, error: "Companies House didn't accept the API key in CH_API_KEY. Check it was copied in full." };
  if (res.status === 404) return { ok: false, error: "Companies House have no company with that number." };
  if (res.status === 429) return { ok: false, error: "Too many lookups at once — Companies House allow 600 every five minutes. Try again shortly." };
  if (!res.ok) return { ok: false, error: `Companies House answered ${res.status}. Try again in a moment.` };
  try {
    return { ok: true, value: await res.json() };
  } catch {
    return { ok: false, error: "Companies House sent something that wasn't readable." };
  }
}

type Raw = Record<string, unknown>;
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const date = (v: unknown): string | null => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

/** An address object as one line, in Companies House's own order: "12 High Street, Leeds, LS1 4AB". */
export function addressLine(a: unknown): string {
  const o = (a ?? {}) as Raw;
  const t = (k: string) => str(o[k]).trim();
  const first = [t("premises"), t("address_line_1")].filter(Boolean).join(" ");
  return [t("care_of") && `c/o ${t("care_of")}`, t("po_box") && `PO Box ${t("po_box")}`, first, t("address_line_2"), t("locality"), t("region"), t("postal_code"), t("country")]
    .filter(Boolean).join(", ");
}

export async function searchCompanies(q: string): Promise<ChResult<ChSearchHit[]>> {
  const query = q.trim();
  if (query.length < 2) return { ok: true, value: [] };
  const r = await get(`/search/companies?q=${encodeURIComponent(query)}&items_per_page=10`);
  if (!r.ok) return r;
  const items = (((r.value as Raw).items ?? []) as Raw[]);
  return {
    ok: true,
    value: items.map((i) => ({
      number: str(i.company_number), name: str(i.title), status: str(i.company_status),
      incorporatedOn: date(i.date_of_creation), address: str(i.address_snippet) || addressLine(i.address),
    })).filter((h) => h.number && h.name),
  };
}

export function profileFrom(raw: Raw, fetchedAt = new Date().toISOString()): ChProfile {
  const acc = (raw.accounts ?? {}) as Raw;
  const ard = (acc.accounting_reference_date ?? null) as Raw | null;
  const last = (acc.last_accounts ?? {}) as Raw;
  const cs = (raw.confirmation_statement ?? {}) as Raw;
  return {
    number: str(raw.company_number), name: str(raw.company_name), status: str(raw.company_status), type: str(raw.type),
    incorporatedOn: date(raw.date_of_creation), registeredOffice: addressLine(raw.registered_office_address),
    sic: Array.isArray(raw.sic_codes) ? (raw.sic_codes as unknown[]).map(String) : [],
    ard: ard && Number(ard.day) && Number(ard.month) ? { day: Number(ard.day), month: Number(ard.month) } : null,
    nextAccountsMadeUpTo: date(acc.next_made_up_to), nextAccountsDue: date(acc.next_due), accountsOverdue: acc.overdue === true,
    lastAccountsMadeUpTo: date(last.made_up_to), confirmationStatementDue: date(cs.next_due), fetchedAt,
  };
}

export async function companyProfile(number: string): Promise<ChResult<ChProfile>> {
  const n = chNumber(number);
  if (!/^[A-Z0-9]{8}$/.test(n)) return { ok: false, error: "A company number is 8 characters, like 15123456 or SC612345." };
  const r = await get(`/company/${encodeURIComponent(n)}`);
  if (!r.ok) return r;
  return { ok: true, value: profileFrom(r.value as Raw) };
}
