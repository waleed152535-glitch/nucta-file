/**
 * Limits for the public company lookup on the website. Companies House allow
 * an API key 600 requests every five minutes, and the same key serves the
 * software's own company search, so the public pages keep to a share of it:
 * a cap per visitor, a cap for everyone together, and a short memory of
 * answers already fetched so a reload costs nothing.
 *
 * Everything here is plain logic with the clock passed in, so it can be
 * tested; lib/public-lookup.ts holds the live instance.
 */

export interface LimitRule {
  /** Lookups one visitor may make in the window. */
  perVisitor: number;
  /** Lookups all visitors together may make in the window. */
  overall: number;
  windowMs: number;
}

export const PUBLIC_LIMITS: LimitRule = { perVisitor: 30, overall: 240, windowMs: 5 * 60_000 };

export type LimitAnswer = { ok: true } | { ok: false; who: "visitor" | "everyone"; retryInSeconds: number };

export function makeLimiter(rule: LimitRule = PUBLIC_LIMITS) {
  const visitors = new Map<string, number[]>();
  let everyone: number[] = [];
  const fresh = (list: number[], now: number) => list.filter((t) => now - t < rule.windowMs);
  return {
    /** Counts one lookup, or says why it can't be made yet. */
    take(visitor: string, now = Date.now()): LimitAnswer {
      everyone = fresh(everyone, now);
      const mine = fresh(visitors.get(visitor) ?? [], now);
      const wait = (list: number[]) => Math.max(1, Math.ceil((list[0] + rule.windowMs - now) / 1000));
      if (mine.length >= rule.perVisitor) { visitors.set(visitor, mine); return { ok: false, who: "visitor", retryInSeconds: wait(mine) }; }
      if (everyone.length >= rule.overall) return { ok: false, who: "everyone", retryInSeconds: wait(everyone) };
      mine.push(now); everyone.push(now);
      visitors.set(visitor, mine);
      // Forget visitors who have gone quiet, so the map can't grow without end.
      if (visitors.size > 5000) for (const [k, v] of visitors) if (!fresh(v, now).length) visitors.delete(k);
      return { ok: true };
    },
  };
}

/** A small memory of answers, each kept for a while; the oldest go first when it fills. */
export function makeCache<T>(ttlMs: number, max = 400) {
  const m = new Map<string, { at: number; value: T }>();
  return {
    get(key: string, now = Date.now()): T | undefined {
      const e = m.get(key);
      if (!e) return undefined;
      if (now - e.at >= ttlMs) { m.delete(key); return undefined; }
      return e.value;
    },
    set(key: string, value: T, now = Date.now()) {
      m.delete(key);
      m.set(key, { at: now, value });
      while (m.size > max) m.delete(m.keys().next().value as string);
    },
    get size() { return m.size; },
  };
}

/**
 * The visitor's address, from the headers the host adds. Only the first
 * address in x-forwarded-for is the visitor's; the rest are proxies.
 */
export function visitorFrom(h: { get(name: string): string | null }): string {
  const fwd = (h.get("x-forwarded-for") ?? "").split(",")[0].trim();
  return fwd || (h.get("x-real-ip") ?? "").trim() || "unknown";
}
