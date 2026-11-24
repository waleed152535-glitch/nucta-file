# Security testing — Nucta Filings

Record of the security testing done before applying to HMRC for production
credentials (VAT, Making Tax Digital). Repeat before each major release.

## 24 November 2026 — build 57

### 1. Dependency audit (`npm audit --omit=dev`)
- Before: 20 known vulnerabilities (1 critical, 12 high, 7 moderate), including
  Next.js (critical, fixed in 16.4.5+), SheetJS xlsx 0.18.5 (prototype pollution,
  ReDoS), zod, undici, postcss, sharp.
- Fixes: Next.js upgraded to 16.4.6; xlsx replaced by SheetJS 0.20.3; unused
  packages removed (@vercel/blob, googleapis); remaining transitive packages
  updated with `npm audit fix`.
- After: **0 vulnerabilities**.

### 2. Automated web application scan (Wapiti 3, OWASP-style modules)
Modules: backup, brute_login_form, cookieflags, crlf, csrf, exec, file, htaccess,
http_headers, methods, permanentxss, redirect, sql, ssrf, timesql, xss, xxe.
42 pages crawled against a production build.

- SQL injection, blind SQL, XSS, stored XSS, command execution, path traversal,
  SSRF, XXE, CRLF injection, open redirect: **none found**.
- Cookie flags: **none found** (the session cookie is HttpOnly, Secure and SameSite=Lax).
- Default-credential login attempts: **none succeeded**.
- CSRF on sign-in, sign-up and forgotten-password forms: **false positive**. The
  forms post through Next.js Server Actions, which reject any request whose
  Origin does not match the host. Verified by hand: a cross-origin POST is
  aborted ("Invalid Server Actions request").
- OPTIONS returns 405/500 on static files: informational only.

### 3. Security headers (added in build 57)
X-Frame-Options SAMEORIGIN; CSP frame-ancestors 'self', base-uri 'self',
object-src 'none'; X-Content-Type-Options nosniff; HSTS (2 years, preload);
Referrer-Policy strict-origin-when-cross-origin; Permissions-Policy (no camera,
microphone, geolocation, payment); Cross-Origin-Opener-Policy same-origin;
X-Powered-By removed.

### 4. Controls confirmed in the code
- HMRC OAuth tokens encrypted at rest (AES-256-GCM); HMRC passwords never seen
  or stored (OAuth 2.0; CT600 Gateway passwords used once, not stored).
- Passwords hashed with scrypt; account locked for 15 minutes after 10 wrong passwords.
- Every company, return and VAT action checks the signed-in account owns it.
- Developer consoles restricted to NUCTA_ADMIN_EMAILS.
- All traffic over TLS; database encrypted at rest by the provider.
