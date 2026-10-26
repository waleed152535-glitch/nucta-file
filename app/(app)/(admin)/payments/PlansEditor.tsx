"use client";

import { useState, useTransition } from "react";
import { updatePlans } from "@/lib/billing-actions";
import type { Plan } from "@/lib/membership-rules";

type Row = { key: string; name: string; returns: string; price: string; on: boolean };
const toRow = (p: Plan): Row => ({ key: p.key, name: p.name, returns: String(p.returns), price: String(p.price), on: p.on });

/** The yearly plans practices can buy: name, returns included, price. Changes apply to new purchases only. */
export default function PlansEditor({ initial }: { initial: Plan[] }) {
  const [rows, setRows] = useState<Row[]>(initial.map(toRow));
  const [msg, setMsg] = useState<{ ok: boolean; text: string[] } | null>(null);
  const [pending, start] = useTransition();
  const set = (i: number, k: keyof Row, v: string | boolean) => { setRows(rows.map((r, n) => (n === i ? { ...r, [k]: v } : r))); setMsg(null); };
  const add = () => setRows([...rows, { key: `p${rows.length + 1}${Date.now() % 1000}`, name: "", returns: "", price: "", on: true }]);
  const save = () => start(async () => {
    const r = await updatePlans(rows.map((x) => ({ key: x.key, name: x.name, returns: Number(x.returns), price: Number(x.price), on: x.on })));
    if (r.ok && r.plans) setRows(r.plans.map(toRow));
    setMsg(r.ok ? { ok: true, text: ["Saved. New purchases use these; memberships already bought keep what was paid for."] } : { ok: false, text: r.problems });
  });
  return (
    <div className="card" id="plans">
      <div className="hd"><h3>Memberships for practices</h3><span className="note">A year of returns for one payment, bought from each practice&apos;s account page</span></div>
      <div className="bd" style={{ overflowX: "auto" }}>
        <table className="paytable plans-edit">
          <thead><tr><th>Name</th><th className="num">Returns</th><th className="num">Price (£ a year)</th><th className="num">A return</th><th>On offer</th><th /></tr></thead>
          <tbody>
            {rows.map((r, i) => {
              const each = Number(r.price) / Number(r.returns);
              return (
                <tr key={r.key + i}>
                  <td><input aria-label="Plan name" value={r.name} onChange={(e) => set(i, "name", e.target.value)} maxLength={40} /></td>
                  <td className="num"><input aria-label="Returns included" inputMode="numeric" value={r.returns} onChange={(e) => set(i, "returns", e.target.value.replace(/[^\d]/g, ""))} /></td>
                  <td className="num"><input aria-label="Price in pounds" inputMode="decimal" value={r.price} onChange={(e) => set(i, "price", e.target.value.replace(/[^\d.]/g, ""))} /></td>
                  <td className="num note">{Number.isFinite(each) && each > 0 ? `£${each.toFixed(2)}` : "—"}</td>
                  <td><input type="checkbox" aria-label="On offer" checked={r.on} onChange={(e) => set(i, "on", e.target.checked)} /></td>
                  <td><button type="button" className="btn ghost sm" onClick={() => { setRows(rows.filter((_, n) => n !== i)); setMsg(null); }}>Remove</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 14, flexWrap: "wrap" }}>
          <button type="button" className="btn" disabled={pending} onClick={save}>{pending ? "Saving…" : "Save plans"}</button>
          <button type="button" className="btn ghost" onClick={add} disabled={rows.length >= 8}>Add a plan</button>
          {msg && (msg.ok ? <span className="ok-t">{msg.text[0]}</span> : <span className="late-t">{msg.text.join(" ")}</span>)}
        </div>
        <p className="note" style={{ marginBottom: 0 }}>Each return filed live with HMRC uses one; sending it again, both parts of a long period and amendments use nothing more. A membership runs twelve months. The website&apos;s pricing page shows the plans on offer.</p>
      </div>
    </div>
  );
}
