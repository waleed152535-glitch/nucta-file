"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addCompany, lookupCompany, searchCompaniesHouse } from "@/lib/return-actions";
import type { ChProfile, ChSearchHit } from "@/lib/ch-api";

const day = (iso: string | null) => (iso ? new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "—");

/**
 * Adding a client company. With a Companies House API key, the company is
 * found by name or number and its details — and accounts dates — come from
 * Companies House; only the UTR, which Companies House don't hold, is typed.
 * Without a key, everything is typed as before.
 */
export default function AddCompany({ chReady, onCancel }: { chReady: boolean; onCancel?: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<ChSearchHit[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [profile, setProfile] = useState<ChProfile | null>(null);
  const [manual, setManual] = useState(!chReady);
  const [f, setF] = useState({ name: "", companyNo: "", utr: "", incorporatedOn: "", registeredOffice: "" });
  const [problems, setProblems] = useState<string[]>([]);
  const [pending, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Search as the name or number is typed, after a short pause.
  useEffect(() => {
    if (!chReady || manual || profile) return;
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2) { setHits([]); return; }
    timer.current = setTimeout(async () => {
      setSearching(true);
      const r = await searchCompaniesHouse(q);
      setSearching(false);
      setHits(r.hits); setSearchError(r.ok ? null : r.error ?? "Search failed.");
    }, 350);
  }, [q, chReady, manual, profile]);

  const pick = (h: ChSearchHit) => start(async () => {
    const r = await lookupCompany(h.number);
    if (!r.ok || !r.profile) { setSearchError(r.error ?? "Couldn't read that company."); return; }
    const p = r.profile;
    setProfile(p); setHits([]);
    setF({ ...f, name: p.name, companyNo: p.number, incorporatedOn: p.incorporatedOn ?? "", registeredOffice: p.registeredOffice });
  });

  const add = () => start(async () => {
    const r = await addCompany({ ...f, chProfile: profile });
    if (r.ok && r.id) router.push(`/companies/${r.id}`);
    else setProblems(r.problems);
  });

  return (
    <div className="card">
      <div className="hd"><h3>Add a company</h3>
        {chReady && <button type="button" className="btn ghost sm" onClick={() => { setManual(!manual); setProfile(null); setHits([]); }}>{manual ? "Search Companies House instead" : "Type the details instead"}</button>}
      </div>
      <div className="bd">
        {!chReady && (
          <p className="note" style={{ marginTop: 0 }}>
            Companies House search isn&apos;t set up yet, so type the details. With a free Companies House API key in the hosting settings
            (CH_API_KEY), a company is found by name or number and its address and accounts dates fill in by themselves.
          </p>
        )}
        {chReady && !manual && !profile && (
          <>
            <div className="field">
              <label>Search Companies House<span className="hint">company name or number</span></label>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. Brightshelf Trading or 15123456" autoFocus />
            </div>
            {searching && <p className="note">Searching Companies House…</p>}
            {searchError && <div className="banner bad"><span>✕</span><span>{searchError}</span></div>}
            {hits.map((h) => (
              <button key={h.number} type="button" className="check" onClick={() => pick(h)} disabled={pending}
                style={{ width: "100%", textAlign: "left", background: "none", border: 0, borderBottom: "1px solid var(--line, #eee)", cursor: "pointer" }}>
                <span style={{ flex: 1 }}>
                  <div className="t">{h.name}</div>
                  <div className="d"><span className="mono">{h.number}</span> · {h.status || "status unknown"}{h.incorporatedOn ? ` · incorporated ${day(h.incorporatedOn)}` : ""}<br />{h.address}</div>
                </span>
              </button>
            ))}
            {q.trim().length >= 2 && !searching && !searchError && hits.length === 0 && <p className="note">No companies found. Check the spelling, or type the details instead.</p>}
          </>
        )}
        {profile && (
          <div className="banner info">
            <span>⌂</span>
            <span>
              <b>{profile.name}</b> · <span className="mono">{profile.number}</span> · {profile.status}<br />
              {profile.registeredOffice}<br />
              Incorporated {day(profile.incorporatedOn)}
              {profile.ard ? ` · year end ${profile.ard.day} ${new Date(Date.UTC(2000, profile.ard.month - 1, 1)).toLocaleDateString("en-GB", { month: "long" })}` : ""}
              {profile.nextAccountsDue ? ` · next accounts (to ${day(profile.nextAccountsMadeUpTo)}) due ${day(profile.nextAccountsDue)}` : ""}
              {profile.accountsOverdue ? " · accounts overdue" : ""}
              {" "}<button type="button" className="btn ghost sm" onClick={() => { setProfile(null); setQ(""); }}>Choose another</button>
            </span>
          </div>
        )}
        {(manual || profile) && (
          <>
            {manual && (
              <>
                <div className="row2">
                  <div className="field"><label>Company name <span className="hint">as at Companies House</span></label>
                    <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
                  <div className="field"><label>Company number</label>
                    <input className="mono" value={f.companyNo} onChange={(e) => setF({ ...f, companyNo: e.target.value })} placeholder="e.g. 15123456 or SC123456" /></div>
                </div>
                <div className="field"><label>Incorporated on <span className="hint">optional — used for first-year deadlines</span></label>
                  <input type="date" value={f.incorporatedOn} onChange={(e) => setF({ ...f, incorporatedOn: e.target.value })} /></div>
              </>
            )}
            <div className="field"><label>Corporation Tax UTR <span className="hint">10 digits, from HMRC&apos;s letters to the company — Companies House don&apos;t hold it</span></label>
              <input className="mono" value={f.utr} onChange={(e) => setF({ ...f, utr: e.target.value })} /></div>
            {problems.length > 0 && <div className="banner bad"><span>✕</span><span><ul style={{ margin: 0, paddingLeft: 18 }}>{problems.map((p, i) => <li key={i}>{p}</li>)}</ul></span></div>}
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" className="btn" disabled={pending} onClick={add}>{pending ? "Adding…" : "Add the company"}</button>
              {onCancel && <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>}
            </div>
          </>
        )}
        {!manual && !profile && onCancel && <button type="button" className="btn ghost sm" onClick={onCancel}>Cancel</button>}
      </div>
    </div>
  );
}
