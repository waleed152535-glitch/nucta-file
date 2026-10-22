"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { importCompanies, type ImportLine } from "@/lib/return-actions";

const LABEL: Record<ImportLine["outcome"], [string, string]> = { added: ["Added", "ok"], exists: ["Already there", "draft"], "not-found": ["Not found", "bad"], problem: ["Not added", "warn"] };

/** Many companies at once: paste company numbers, with UTRs if you have them. */
export default function ImportCompanies({ chReady, onClose }: { chReady: boolean; onClose: () => void }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [results, setResults] = useState<ImportLine[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const lines = text.split(/\r?\n/).filter((l) => l.trim()).length;
  const run = () => start(async () => {
    setError(null);
    const r = await importCompanies(text);
    if (!r.ok) { setError(r.error ?? "Couldn't import."); return; }
    setResults(r.results); router.refresh();
  });
  const onFile = async (f: File | undefined) => { if (f) setText((await f.text()).slice(0, 40_000)); };
  const added = results?.filter((r) => r.outcome === "added").length ?? 0;
  return (
    <div className="card">
      <div className="hd"><h3>Import a list of companies</h3><button type="button" className="btn ghost sm" onClick={onClose}>Close</button></div>
      <div className="bd">
        <p className="note" style={{ marginTop: 0 }}>
          One company per line: its company number, then its Corporation Tax UTR if you have it. {chReady ? "Each one is looked up at Companies House for its name, address and accounts dates." : "Companies House search isn't set up, so add the company's name on each line too."} Up to 200 at a time; a spreadsheet saved as CSV works too.
        </p>
        <div className="field">
          <label>Companies<span className="hint">for example: 15123456, 1234567890</span></label>
          <textarea rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder={"15123456, 1234567890\n13550421\nSC612345, 9876543210"} style={{ fontVariantNumeric: "tabular-nums", resize: "vertical" }} />
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button type="button" className="btn" disabled={pending || !lines} onClick={run}>{pending ? `Looking up ${lines} compan${lines === 1 ? "y" : "ies"}…` : `Add ${lines || ""} compan${lines === 1 ? "y" : "ies"}`.replace("  ", " ")}</button>
          <label className="btn ghost sm" style={{ cursor: "pointer" }}>Choose a CSV file<input type="file" accept=".csv,.txt,text/csv,text/plain" hidden onChange={(e) => onFile(e.target.files?.[0])} /></label>
        </div>
        {error && <div className="banner bad" style={{ marginTop: 14 }}><span>✕</span><span>{error}</span></div>}
        {results && (
          <>
            <div className={`banner ${added ? "good" : "warn"}`} style={{ marginTop: 16 }}><span>{added ? "✓" : "!"}</span><span><b>{added} added</b> of {results.length}. Their deadlines are on the dashboard now.</span></div>
            <table>
              <thead><tr><th>Company</th><th>Result</th><th>Note</th></tr></thead>
              <tbody>
                {results.map((r, i) => (
                  <tr key={i}>
                    <td>{r.id ? <Link href={`/companies/${r.id}`} style={{ color: "var(--text)", fontWeight: 600 }}>{r.name}</Link> : <span style={{ fontWeight: 600 }}>{r.name ?? r.number ?? r.line}</span>}<div className="note">{r.number || r.line}</div></td>
                    <td><span className={`pill ${LABEL[r.outcome][1]}`}>{LABEL[r.outcome][0]}</span></td>
                    <td className="note">{r.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
}
