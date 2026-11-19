import { GUIDES, type Guide } from "./guides";
import { CALCULATOR } from "./calculator-content";
import { SITE, absolute } from "./site";

/**
 * The public site as data: every page search engines should know about, and
 * plain Markdown copies of the pages that are mostly words. sitemap.xml,
 * sitemap.md, llms.txt and the .md copies all read from here, so a new guide
 * appears in every one of them at once.
 */

export interface PublicPage {
  path: string;
  title: string;
  /** A sentence on what the page is for. */
  about: string;
  modified?: string;
  /** The address of its Markdown copy, if it has one. */
  markdown?: string;
}

export function publicPages(): PublicPage[] {
  const latestGuide = GUIDES.map((g) => g.updated).sort().at(-1);
  return [
    { path: "/", title: "Nucta File", about: "CT600 software and accounts for small UK companies.", markdown: "/index.md" },
    { path: "/features", title: "Features", about: "What Nucta File prepares, works out and files." },
    { path: "/corporation-tax-calculator", title: CALCULATOR.title, about: CALCULATOR.description, modified: CALCULATOR.updated, markdown: `${CALCULATOR.path}.md` },
    { path: "/check", title: "Company deadline checker", about: "When a UK company's accounts, Company Tax Return and Corporation Tax are due, from its Companies House record." },
    { path: "/accountants", title: "For accountants", about: "Nucta File for accountancy practices and formation agents." },
    { path: "/pricing", title: "Pricing", about: "What filing a Company Tax Return with Nucta File costs." },
    { path: "/guides", title: "Guides", about: "Plain-English guides to Company Tax Returns and accounts.", modified: latestGuide, markdown: "/guides.md" },
    ...GUIDES.map((g) => ({ path: `/guides/${g.slug}`, title: g.title, about: g.summary, modified: g.updated, markdown: `/guides/${g.slug}.md` })),
    { path: "/about", title: "About", about: "Who makes Nucta File, and why." },
    { path: "/contact", title: "Contact", about: "How to reach the Nucta File team." },
    { path: "/terms", title: "Terms of use", about: "The terms for using Nucta File." },
    { path: "/privacy", title: "Privacy notice", about: "What Nucta File keeps, and why." },
  ];
}

const longDate = (iso: string) => new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

export function guideMarkdown(g: Guide): string {
  const out = [`# ${g.title}`, "", `> ${g.summary}`, "", `Updated ${longDate(g.updated)}. From ${SITE.product}: ${absolute(`/guides/${g.slug}`)}`, ""];
  for (const s of g.sections) {
    out.push(`## ${s.heading}`, "");
    for (const p of s.paragraphs) out.push(p, "");
  }
  out.push("## Sources", "", ...g.sources.map((s) => `- [${s.label}](${s.url})`), "");
  const next = g.related.map((slug) => GUIDES.find((x) => x.slug === slug)).filter((x): x is Guide => Boolean(x));
  if (next.length) out.push("## Read next", "", ...next.map((r) => `- [${r.title}](${absolute(`/guides/${r.slug}.md`)})`), "");
  out.push("This guide explains the general rules. It isn't advice about a particular company.", "");
  return out.join("\n");
}

export function calculatorMarkdown(): string {
  const c = CALCULATOR;
  const out = [`# ${c.title}`, "", `> ${c.intro}`, "", `The calculator itself runs in the page: ${absolute(c.path)}`, ""];
  out.push("## How it's worked out", "");
  for (const s of c.how) {
    out.push(`### ${s.heading}`, "");
    for (const p of s.paragraphs) out.push(p, "");
  }
  out.push("## Questions people ask", "");
  for (const f of c.faq) out.push(`### ${f.q}`, "", f.a, "");
  return out.join("\n");
}

export function guidesMarkdown(): string {
  return [
    "# Guides from Nucta File",
    "",
    "> The rules small UK companies ask about most, in plain words, with the sources.",
    "",
    ...GUIDES.map((g) => `- [${g.title}](${absolute(`/guides/${g.slug}.md`)}): ${g.summary}`),
    "",
  ].join("\n");
}

export function indexMarkdown(): string {
  return [
    `# ${SITE.product}`,
    "",
    "> Software for small UK companies and their accountants: it prepares the company's accounts, works out its Corporation Tax and files the Company Tax Return (CT600) with HMRC, with the accounts and tax computation attached in iXBRL.",
    "",
    `${SITE.product} is made by ${SITE.company} and is registered with HMRC as a software developer (vendor ${SITE.vendorId}).`,
    "",
    "## What it does",
    "",
    "- Micro-entity accounts (FRS 105) and small company accounts (FRS 102 Section 1A), in iXBRL",
    "- The Corporation Tax computation: 19% and 25% rates, marginal relief, associated companies, short periods, and periods split across 1 April",
    "- Capital allowances, director's loans (CT600A and the section 455 charge), losses and charitable donations",
    "- First accounts longer than 12 months, split into two returns",
    "- Dormant company accounts, and nil returns when HMRC ask for one",
    "- Every client company's deadlines in one place, for accountants and formation agents",
    "",
    "## Pages",
    "",
    ...publicPages().filter((p) => p.path !== "/").map((p) => `- [${p.title}](${absolute(p.markdown ?? p.path)}): ${p.about}`),
    "",
  ].join("\n");
}

export function sitemapMarkdown(): string {
  return [
    `# ${SITE.product}: every public page`,
    "",
    ...publicPages().map((p) => `- [${p.title}](${absolute(p.path)})${p.markdown ? ` ([Markdown](${absolute(p.markdown)}))` : ""}: ${p.about}`),
    "",
  ].join("\n");
}

/** llms.txt: a short map of the site for AI assistants (llmstxt.org). */
export function llmsTxt(): string {
  const guides = GUIDES.map((g) => `- [${g.title}](${absolute(`/guides/${g.slug}.md`)}): ${g.summary}`);
  return [
    `# ${SITE.product}`,
    "",
    "> CT600 software for small UK companies and their accountants. Prepares micro-entity and small company accounts, works out Corporation Tax and files the Company Tax Return with HMRC, with the accounts and computation in iXBRL.",
    "",
    `Made by ${SITE.company}. Registered with HMRC as a software developer (vendor ${SITE.vendorId}). Contact: ${SITE.email}.`,
    "",
    "## Tools",
    "",
    `- [${CALCULATOR.title}](${absolute(`${CALCULATOR.path}.md`)}): ${CALCULATOR.description}`,
    `- [Company deadline checker](${absolute("/check")}): when a UK company's accounts, CT600 and Corporation Tax are due, from its Companies House record.`,
    "",
    "## Guides",
    "",
    ...guides,
    "",
    "## About the product",
    "",
    `- [Overview](${absolute("/index.md")}): what Nucta File does`,
    `- [Features](${absolute("/features")})`,
    `- [For accountants](${absolute("/accountants")})`,
    `- [Pricing](${absolute("/pricing")})`,
    "",
    "## Optional",
    "",
    `- [Every public page](${absolute("/sitemap.md")})`,
    `- [Terms of use](${absolute("/terms")})`,
    `- [Privacy notice](${absolute("/privacy")})`,
    "",
  ].join("\n");
}

/** The Markdown copy for a path under /md, or null if there isn't one. */
export function markdownFor(page: string): { body: string; canonical: string | null } | null {
  if (page === "index") return { body: indexMarkdown(), canonical: absolute("/") };
  if (page === "guides") return { body: guidesMarkdown(), canonical: absolute("/guides") };
  if (page === "sitemap") return { body: sitemapMarkdown(), canonical: null };
  if (page === CALCULATOR.path.slice(1)) return { body: calculatorMarkdown(), canonical: absolute(CALCULATOR.path) };
  const m = /^guides\/([a-z0-9-]+)$/.exec(page);
  if (m) {
    const g = GUIDES.find((x) => x.slug === m[1]);
    if (g) return { body: guideMarkdown(g), canonical: absolute(`/guides/${g.slug}`) };
  }
  return null;
}

/** Every path under /md that has a copy, for building them ahead of time. */
export const markdownPages = (): string[] => ["index", "guides", "sitemap", CALCULATOR.path.slice(1), ...GUIDES.map((g) => `guides/${g.slug}`)];
