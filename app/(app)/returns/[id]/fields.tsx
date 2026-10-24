"use client";

import { useEffect, useState } from "react";

/**
 * Inputs for the return screens.
 *
 * Amounts accept what people actually type or paste — "182,400", "£1,250",
 * "1250.50", "-45", "−45", "(45)" — and show thousands commas once you move
 * on. Accounts and tax returns are in whole pounds, so amounts are kept to
 * the nearest pound: what the screen adds up is exactly what is filed.
 */

export const parseMoney = (v: string): number => {
  let t = v.trim().replace(/[\u2212\u2013\u2012\u2014]/g, "-").replace(/[£,\s]/g, "");
  let sign = 1;
  if (/^\(.*\)$/.test(t)) { sign = -1; t = t.slice(1, -1); }
  if (/^.+-$/.test(t)) { sign = -sign; t = t.slice(0, -1); }
  if (t.startsWith("-")) { sign = -sign; t = t.slice(1); }
  const n = Number(t);
  return Number.isFinite(n) ? sign * n : 0;
};
const parse = (v: string): number => Math.round(parseMoney(v));
const show = (n: number): string => (n ? n.toLocaleString("en-GB", { maximumFractionDigits: 2 }) : "");

export function Money({ label, hint, value, onChange, help }: {
  label: string; hint?: string; help?: string; value: number; onChange: (n: number) => void;
}) {
  const [text, setText] = useState(show(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => { if (!focused) setText(show(value)); }, [value, focused]);
  return (
    <div className="field">
      <label>{label}{hint && <span className="hint">{hint}</span>}</label>
      <input
        inputMode="decimal"
        value={text}
        placeholder="0"
        onFocus={() => setFocused(true)}
        onChange={(e) => { setText(e.target.value); onChange(parse(e.target.value)); }}
        onBlur={() => { setFocused(false); setText(show(parse(text))); }}
        style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}
      />
      {help && <div className="note" style={{ marginTop: 4 }}>{help}</div>}
    </div>
  );
}

export function Whole({ label, hint, value, onChange }: { label: string; hint?: string; value: number; onChange: (n: number) => void }) {
  return (
    <div className="field">
      <label>{label}{hint && <span className="hint">{hint}</span>}</label>
      <input type="number" min={0} step={1} value={value} onChange={(e) => onChange(Math.max(0, Math.round(Number(e.target.value) || 0)))} />
    </div>
  );
}

export function Text({ label, hint, value, onChange, placeholder }: { label: string; hint?: string; value: string; onChange: (s: string) => void; placeholder?: string }) {
  return (
    <div className="field">
      <label>{label}{hint && <span className="hint">{hint}</span>}</label>
      <input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

export function DateField({ label, hint, value, onChange }: { label: string; hint?: string; value: string; onChange: (s: string) => void }) {
  return (
    <div className="field">
      <label>{label}{hint && <span className="hint">{hint}</span>}</label>
      <input type="date" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

export function YesNo({ question, value, onChange, why }: { question: string; value: boolean | undefined; onChange: (v: boolean) => void; why?: string }) {
  return (
    <div className="check" style={{ alignItems: "center" }}>
      <span style={{ flex: 1 }}>
        <div className="t" style={{ fontWeight: 500 }}>{question}</div>
        {why && <div className="d">{why}</div>}
      </span>
      <span className="yn" role="group" aria-label={question}>
        <button type="button" aria-pressed={value === true} onClick={() => onChange(true)}>Yes</button>
        <button type="button" aria-pressed={value === false} onClick={() => onChange(false)}>No</button>
      </span>
    </div>
  );
}

/** £ with commas, for the running totals. */
export const gbp = (n: number, pence = false): string =>
  `${n < 0 ? "−" : ""}£${Math.abs(n).toLocaleString("en-GB", { minimumFractionDigits: pence ? 2 : 0, maximumFractionDigits: pence ? 2 : 0 })}`;
