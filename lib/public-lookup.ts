/**
 * The website's company lookup: Companies House search and company records
 * for visitors who aren't signed in, kept within limits (lib/lookup-limits.ts)
 * so the public pages can't use up the API key the software relies on.
 *
 * Server-only: imported by the /check pages, never by the browser.
 */
import { headers } from "next/headers";
import { chApiReady, chNumber, companyProfile, searchCompanies, type ChProfile, type ChResult, type ChSearchHit } from "./ch-api";
import { makeCache, makeLimiter, visitorFrom } from "./lookup-limits";

const limiter = makeLimiter();
const searches = makeCache<ChSearchHit[]>(10 * 60_000);
const profiles = makeCache<ChProfile>(15 * 60_000);

export type Lookup<T> = ChResult<T> | { ok: false; error: string; limited: true };

export const lookupReady = chApiReady;

async function allowed(): Promise<{ ok: true } | { ok: false; error: string; limited: true }> {
  const r = limiter.take(visitorFrom(await headers()));
  if (r.ok) return r;
  const mins = Math.ceil(r.retryInSeconds / 60);
  return {
    ok: false, limited: true,
    error: r.who === "visitor"
      ? `That's a lot of lookups in a few minutes. Try again in ${mins} minute${mins === 1 ? "" : "s"}.`
      : `The company lookup is busy. Try again in ${mins} minute${mins === 1 ? "" : "s"}.`,
  };
}

export async function publicSearch(q: string): Promise<Lookup<ChSearchHit[]>> {
  const key = q.trim().toLowerCase().replace(/\s+/g, " ");
  if (key.length < 2) return { ok: true, value: [] };
  const hit = searches.get(key);
  if (hit) return { ok: true, value: hit };
  const gate = await allowed();
  if (!gate.ok) return gate;
  const r = await searchCompanies(key);
  if (r.ok) searches.set(key, r.value);
  return r;
}

export async function publicProfile(number: string): Promise<Lookup<ChProfile>> {
  const n = chNumber(number);
  const hit = profiles.get(n);
  if (hit) return { ok: true, value: hit };
  const gate = await allowed();
  if (!gate.ok) return gate;
  const r = await companyProfile(n);
  if (r.ok) profiles.set(n, r.value);
  return r;
}
