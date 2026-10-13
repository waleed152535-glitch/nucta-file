"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Overview", icon: "▣" },
  { section: "Gateway" },
  { href: "/gateway", label: "HMRC test console", icon: "⇄" },
  { href: "/log", label: "Submission log", icon: "☰" },
  { section: "Setup" },
  { href: "/settings", label: "Credentials", icon: "⚙" },
];

export default function Nav() {
  const path = usePathname() ?? "/";

  // The sign-in screen stands alone.
  if (path.startsWith("/login")) return null;

  return (
    <aside className="side">
      <div className="brand">
        <h1>Nucta File</h1>
        <div className="tag">HMRC recognised · vendor 9754</div>
      </div>
      <nav className="nav">
        {LINKS.map((l, i) =>
          "section" in l ? (
            <div className="sec" key={`s${i}`}>{l.section}</div>
          ) : (
            <Link
              key={l.href}
              href={l.href!}
              className={path === l.href || (l.href !== "/" && path.startsWith(l.href!)) ? "active" : ""}
            >
              <span aria-hidden>{l.icon}</span>
              {l.label}
            </Link>
          ),
        )}
      </nav>
      <div className="side-foot">
        <b>Nucta Formations Ltd</b>
        <br />
        Test mode. Nothing filed here reaches a real company record.
      </div>
    </aside>
  );
}
