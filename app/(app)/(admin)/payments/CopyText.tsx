"use client";

import { useState } from "react";

/** An address to paste somewhere else, with a button to copy it. */
export default function CopyText({ value }: { value: string }) {
  const [done, setDone] = useState(false);
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <code className="mono" style={{ padding: "7px 10px", background: "var(--input-bg)", borderRadius: 8, border: "1px solid var(--border)", wordBreak: "break-all", flex: "1 1 260px" }}>{value}</code>
      <button type="button" className="btn ghost sm" onClick={async () => { try { await navigator.clipboard.writeText(value); setDone(true); setTimeout(() => setDone(false), 1500); } catch { /* it's on screen */ } }}>{done ? "Copied" : "Copy"}</button>
    </div>
  );
}
