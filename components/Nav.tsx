"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOutAction } from "@/lib/session-actions";

type L = { section: string } | { href: string; label: string; icon: string };
const LINKS: L[] = [
  { section: "Filing" },
  { href: "/dashboard", label: "Dashboard", icon: "▣" },
  { href: "/companies", label: "Companies and returns", icon: "▤" },
  { href: "/account", label: "Your account", icon: "◉" },
];
/** Nucta File's own tools, shown to administrators only. */
const ADMIN: L[] = [
  { section: "Admin" },
  { href: "/gateway", label: "HMRC test console", icon: "⇄" },
  { href: "/companies-house", label: "Companies House console", icon: "⌂" },
  { href: "/log", label: "Submission log", icon: "☰" },
  { href: "/settings", label: "Credentials", icon: "⚙" },
  { href: "/status", label: "Project status", icon: "◷" },
];

export default function Nav({ user }: { user: { name: string; email: string; accountName: string; admin: boolean } }) {
  const path = usePathname() ?? "/";
  const links = user.admin ? [...LINKS, ...ADMIN] : LINKS;

  return (
    <aside className="side">
      <div className="brand">
        <h1>Nucta File</h1>
        {/* Not "recognised": HMRC recognition is applied for, not granted. */}
        <div className="tag">HMRC vendor 9754 · in testing</div>
      </div>
      <nav className="nav">
        {links.map((l, i) =>
          "section" in l ? (
            <div className="sec" key={`s${i}`}>{l.section}</div>
          ) : (
            <Link
              key={l.href}
              href={l.href}
              className={path === l.href || path.startsWith(`${l.href}/`) ? "active" : ""}
            >
              <span aria-hidden>{l.icon}</span>
              {l.label}
            </Link>
          ),
        )}
      </nav>
      <div className="side-foot">
        <b>{user.name}</b>
        <br />
        {user.accountName}
        <form action={signOutAction} style={{ marginTop: 8 }}>
          <button type="submit" className="side-out">Sign out</button>
        </form>
      </div>
    </aside>
  );
}
