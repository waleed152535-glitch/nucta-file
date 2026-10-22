"use client";

/**
 * The search window (Ctrl+K): any company or return in the account, the
 * software's pages, and the things people do most. "new" mode lists only
 * companies, for starting a return.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { quickFind, type FoundItem } from "@/lib/return-actions";

export type PaletteMode = "find" | "new";
interface Option { group: string; key: string; title: string; detail?: string; icon: string; href: string; download?: boolean }

const PAGES: Option[] = [
  { group: "Go to", key: "p-dash", title: "Dashboard", icon: "▦", href: "/dashboard" },
  { group: "Go to", key: "p-cos", title: "Companies and returns", icon: "▤", href: "/companies" },
  { group: "Go to", key: "p-dl", title: "Deadlines and calendar", icon: "◷", href: "/deadlines" },
  { group: "Go to", key: "p-acc", title: "Your account", icon: "◉", href: "/account" },
];
const ACTIONS: Option[] = [
  { group: "Do", key: "a-add", title: "Add a company", detail: "Search Companies House or type the details", icon: "+", href: "/companies?add=1" },
  { group: "Do", key: "a-ics", title: "Add every deadline to your calendar", detail: "A calendar file for Outlook, Google or your phone", icon: "◷", href: "/calendar.ics", download: true },
  { group: "Do", key: "a-csv", title: "Download the company list", detail: "A spreadsheet (CSV) of every company and its next deadline", icon: "⇩", href: "/companies/export", download: true },
];
const ADMIN: Option[] = [
  { group: "Admin", key: "x-gw", title: "HMRC test console", icon: "⇄", href: "/gateway" },
  { group: "Admin", key: "x-ch", title: "Companies House console", icon: "⌂", href: "/companies-house" },
  { group: "Admin", key: "x-log", title: "Submission log", icon: "☰", href: "/log" },
  { group: "Admin", key: "x-set", title: "Credentials", icon: "⚙", href: "/settings" },
  { group: "Admin", key: "x-st", title: "Project status", icon: "◷", href: "/status" },
];

export default function CommandPalette({ mode, admin, onClose }: { mode: PaletteMode; admin: boolean; onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [found, setFound] = useState<FoundItem[]>([]);
  /** The words the shown results are for: Enter waits until they match what was typed. */
  const [foundFor, setFoundFor] = useState<string | null>(null);
  const enterWaiting = useRef(false);
  const [busy, setBusy] = useState(true);
  const [on, setOn] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => { input.current?.focus(); }, []);
  useEffect(() => {
    let live = true;
    setBusy(true);
    const t = setTimeout(async () => {
      const r = await quickFind(q);
      if (live) { setFound(r); setFoundFor(q); setBusy(false); setOn(0); }
    }, q ? 140 : 0);
    return () => { live = false; clearTimeout(t); };
  }, [q]);

  const options = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const match = (o: Option) => words.every((w) => `${o.title} ${o.detail ?? ""}`.toLowerCase().includes(w));
    const fromSearch: Option[] = found
      .filter((f) => mode === "find" || f.kind === "company")
      .map((f) => ({
        group: f.kind === "company" ? (mode === "new" ? "Start a return for" : "Companies") : "Returns",
        key: `${f.kind}-${f.id}`, title: f.title, detail: f.detail, icon: f.kind === "company" ? "⌂" : "▤",
        href: mode === "new" && f.kind === "company" ? `${f.href}#start` : f.href,
      }));
    if (mode === "new") return [...fromSearch, ...ACTIONS.slice(0, 1).filter(match)];
    return [...fromSearch, ...PAGES.filter(match), ...ACTIONS.filter(match), ...(admin ? ADMIN.filter(match) : [])];
  }, [found, q, mode, admin]);

  // Enter pressed before the results for the latest words arrived: act once they do.
  useEffect(() => {
    if (enterWaiting.current && foundFor === q) { enterWaiting.current = false; go(options[0]); }
  });
  const go = (o: Option | undefined) => {
    if (!o) return;
    onClose();
    if (o.download) window.location.href = o.href; else router.push(o.href);
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); onClose(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); setOn((n) => Math.min(options.length - 1, n + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setOn((n) => Math.max(0, n - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); if (foundFor !== q) enterWaiting.current = true; else go(options[on]); }
  };
  useEffect(() => { list.current?.querySelector(".opt.on")?.scrollIntoView({ block: "nearest" }); }, [on]);

  let lastGroup = "";
  return (
    <div className="palette-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="palette" role="dialog" aria-modal="true" aria-label={mode === "new" ? "Start a return" : "Search Nucta File"}>
        <div className="q">
          <span aria-hidden style={{ color: "var(--faint)" }}>⌕</span>
          <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} role="combobox" aria-expanded="true" aria-controls="palette-list"
            aria-activedescendant={options[on] ? `opt-${options[on].key}` : undefined}
            placeholder={mode === "new" ? "Which company is the return for?" : "Search companies, returns and pages"} />
          <kbd>Esc</kbd>
        </div>
        <div className="res" ref={list} id="palette-list" role="listbox">
          {options.length === 0 && <div className="none">{busy ? "Searching…" : q ? `Nothing matches “${q}”.` : "No companies yet."}</div>}
          {options.map((o, i) => {
            const head = o.group !== lastGroup ? <div className="grp" key={`g-${o.group}`}>{o.group}</div> : null;
            lastGroup = o.group;
            return (
              <div key={o.key}>
                {head}
                <button type="button" id={`opt-${o.key}`} role="option" aria-selected={i === on} className={`opt${i === on ? " on" : ""}`}
                  onMouseMove={() => { if (on !== i) setOn(i); }} onClick={() => go(o)}>
                  <span className="k" aria-hidden>{o.icon}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>{o.title}{o.detail && <small>{o.detail}</small>}</span>
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
