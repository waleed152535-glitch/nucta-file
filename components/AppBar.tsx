"use client";

/**
 * The software's top bar: where you are, search (Ctrl+K), a new return, and
 * your account. Replaces the old sidebar, so the work gets the full width.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { signOutAction } from "@/lib/session-actions";
import Mark from "./Mark";
import CommandPalette, { type PaletteMode } from "./CommandPalette";

export interface BarUser { name: string; email: string; accountName: string; accountKind: string; admin: boolean; live?: "off" | "til" | "on" }

const TABS = [
  { href: "/dashboard", label: "Dashboard", also: [] as string[] },
  { href: "/companies", label: "Companies", also: ["/returns"] },
  { href: "/deadlines", label: "Deadlines", also: [] as string[] },
];
const ADMIN = [
  { href: "/live-filing", label: "Live filing" },
  { href: "/gateway", label: "HMRC test console" },
  { href: "/companies-house", label: "Companies House console" },
  { href: "/log", label: "Submission log" },
  { href: "/settings", label: "Credentials" },
  { href: "/status", label: "Project status" },
];

const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "N";

export default function AppBar({ user }: { user: BarUser }) {
  const path = usePathname() ?? "/";
  const [palette, setPalette] = useState<PaletteMode | null>(null);
  const acct = useRef<HTMLDetailsElement>(null), adm = useRef<HTMLDetailsElement>(null);
  const active = (t: (typeof TABS)[number]) => [t.href, ...t.also].some((h) => path === h || path.startsWith(`${h}/`));

  // Ctrl+K or / anywhere opens the search; menus close when you move on.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && (e.target.closest("input,textarea,select,[contenteditable]") !== null);
      if ((e.key === "k" || e.key === "K") && (e.ctrlKey || e.metaKey)) { e.preventDefault(); setPalette("find"); }
      else if (e.key === "/" && !typing) { e.preventDefault(); setPalette("find"); }
    };
    const onDown = (e: MouseEvent) => {
      for (const d of [acct.current, adm.current]) if (d?.open && !d.contains(e.target as Node)) d.open = false;
    };
    const onOpen = (e: Event) => setPalette(((e as CustomEvent).detail as PaletteMode) ?? "find");
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    window.addEventListener("nf-palette", onOpen);
    return () => { window.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onDown); window.removeEventListener("nf-palette", onOpen); };
  }, []);
  useEffect(() => { if (acct.current) acct.current.open = false; if (adm.current) adm.current.open = false; }, [path]);

  return (
    <>
      <header className="appbar">
        <div className="appbar-in">
          <Link href="/dashboard" className="brand" aria-label="Nucta File dashboard"><Mark size={24} />Nucta File{(user.admin || user.live !== "on") && <small title={user.live === "on" ? "Returns can be filed with HMRC for real" : user.live === "til" ? "HMRC's Test in Live check is open" : "Filing isn't open for this account yet"}>{user.live === "on" ? "Live filing" : user.live === "til" ? "Test in Live" : "Preparing only"}</small>}</Link>
          <nav className="tabsnav" aria-label="Main">
            {TABS.map((t) => <Link key={t.href} href={t.href} className={active(t) ? "active" : ""} aria-current={active(t) ? "page" : undefined}>{t.label}</Link>)}
          </nav>
          <span className="grow" />
          <Link href="/" className="sitelink" title="The Nucta File website: features, pricing and guides">Website</Link>
          <button type="button" className="findbtn" onClick={() => setPalette("find")} aria-label="Search (Ctrl+K)">
            <span className="ic" aria-hidden /><span className="grow">Search companies and returns</span><kbd>Ctrl K</kbd>
          </button>
          <button type="button" className="btn newbtn" onClick={() => setPalette("new")}>New return</button>
          {user.admin && (
            <details className="menu" ref={adm}>
              <summary className="adminbtn">Admin</summary>
              <div className="drop">
                <div className="sec">Nucta File&apos;s own tools</div>
                {ADMIN.map((a) => <Link key={a.href} href={a.href}>{a.label}</Link>)}
              </div>
            </details>
          )}
          <details className="menu" ref={acct}>
            <summary aria-label="Your account"><span className="avatar">{initials(user.name)}</span></summary>
            <div className="drop">
              <div className="who"><b>{user.name}</b><span>{user.accountName}</span><br /><span>{user.email}</span></div>
              <Link href="/account">Your account</Link>
              <a href="/calendar.ics">Add deadlines to your calendar</a>
              <Link href="/">Nucta File website</Link>
              <form action={signOutAction}><button type="submit">Sign out</button></form>
            </div>
          </details>
        </div>
      </header>
      <nav className="mobile-nav" aria-label="Main">
        {TABS.map((t) => <Link key={t.href} href={t.href} className={active(t) ? "active" : ""}>{t.label}</Link>)}
        <Link href="/account" className={path.startsWith("/account") ? "active" : ""}>Account</Link>
        <Link href="/">Website</Link>
        {user.admin && <Link href="/gateway" className={path.startsWith("/gateway") ? "active" : ""}>Admin</Link>}
      </nav>
      {palette && <CommandPalette mode={palette} admin={user.admin} onClose={() => setPalette(null)} />}
    </>
  );
}

/** Opens the search window from anywhere in the software (e.g. a "New return" button on a page). */
export const openPalette = (mode: PaletteMode = "find") => window.dispatchEvent(new CustomEvent("nf-palette", { detail: mode }));
