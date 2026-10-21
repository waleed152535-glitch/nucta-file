"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const NAV = [
  { href: "/features", label: "Features" },
  { href: "/accountants", label: "For accountants" },
  { href: "/pricing", label: "Pricing" },
  { href: "/guides", label: "Guides" },
];

export default function SiteHeader() {
  const path = usePathname() ?? "/";
  // Read after the page loads, so the pages themselves can stay static.
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => { setSignedIn(/(?:^|;\s*)nf_in=1/.test(document.cookie)); }, []);
  const here = (href: string) => (path === href || path.startsWith(`${href}/`) ? "page" : undefined);
  return (
    <header className="s-head">
      <div className="wrap">
        <Link href="/" className="s-brand" aria-label="Nucta File home"><span className="s-mark" aria-hidden />Nucta File</Link>
        <nav className="s-nav" aria-label="Main">
          {NAV.map((n) => <Link key={n.href} href={n.href} aria-current={here(n.href)}>{n.label}</Link>)}
        </nav>
        <details className="s-menu">
          <summary>Menu</summary>
          <nav aria-label="Main">
            {NAV.map((n) => <Link key={n.href} href={n.href}>{n.label}</Link>)}
            {signedIn ? <Link href="/dashboard">Open Nucta File</Link> : <Link href="/sign-in">Sign in</Link>}
          </nav>
        </details>
        <div className="s-actions">
          {signedIn ? <Link href="/dashboard" className="s-btn">Open Nucta File</Link> : (
            <>
              <Link href="/sign-in" className="s-link">Sign in</Link>
              <Link href="/sign-up" className="s-btn">Create account</Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
