import { GUIDES, relatedTo } from "../lib/guides";
import { CALCULATOR } from "../lib/calculator-content";
import { compute, type ReturnFigures } from "../lib/tax/computation";
import { pageMeta, articleGraph, homeGraph, calculatorGraph } from "../lib/seo";
import { publicPages, markdownFor, markdownPages, llmsTxt, guideMarkdown } from "../lib/public-markdown";
import { absolute, canonicalHost, siteOrigin } from "../lib/site";

let passed = 0, failed = 0;
const t = (name: string, ok: boolean, got?: unknown) => { if (ok) passed++; else { failed++; console.log("FAIL", name, got === undefined ? "" : JSON.stringify(got)); } };
const eq = (name: string, got: unknown, want: unknown) => t(name, JSON.stringify(got) === JSON.stringify(want), { got, want });

const keep = { url: process.env.NUCTA_SITE_URL, prod: process.env.VERCEL_PROJECT_PRODUCTION_URL };
const env = (url?: string, prod?: string) => {
  if (url === undefined) delete process.env.NUCTA_SITE_URL; else process.env.NUCTA_SITE_URL = url;
  if (prod === undefined) delete process.env.VERCEL_PROJECT_PRODUCTION_URL; else process.env.VERCEL_PROJECT_PRODUCTION_URL = prod;
};

console.log("— the site's address");
env(undefined, undefined);
eq("nothing set: the home domain", siteOrigin(), "https://nuctafilings.co.uk");
eq("nothing set: no redirects", canonicalHost(), null);
env(undefined, "nucta-file.vercel.app");
eq("hosting's production address", siteOrigin(), "https://nucta-file.vercel.app");
eq("hosting's address alone doesn't redirect", canonicalHost(), null);
env("https://nuctafilings.co.uk/", "nucta-file.vercel.app");
eq("NUCTA_SITE_URL wins, trailing slash dropped", siteOrigin(), "https://nuctafilings.co.uk");
eq("NUCTA_SITE_URL chooses the host", canonicalHost(), "nuctafilings.co.uk");
eq("absolute path", absolute("/guides"), "https://nuctafilings.co.uk/guides");
eq("absolute without slash", absolute("pricing"), "https://nuctafilings.co.uk/pricing");
env("not a url");
eq("a broken setting redirects nowhere", canonicalHost(), null);
env("https://nuctafilings.co.uk");

console.log("— page tags");
const m = pageMeta({ title: "Pricing", description: "d", path: "/pricing" });
eq("canonical", (m.alternates as { canonical: string }).canonical, "/pricing");
eq("title gets the brand in OG", (m.openGraph as { title: string }).title, "Pricing — Nucta Filings");
eq("share image by default", ((m.openGraph as { images: { url: string }[] }).images)[0].url, "/opengraph-image");
eq("large card", (m.twitter as { card: string }).card, "summary_large_image");
const g = pageMeta({ title: "x", description: "d", path: "/guides/x", type: "article", image: null, modified: "2026-11-12" });
t("own image left to the page's folder", !("images" in (g.openGraph as object)));
eq("article dates", [(g.openGraph as { modifiedTime: string }).modifiedTime, (g.openGraph as { publishedTime: string }).publishedTime], ["2026-11-12", "2026-11-12"]);
eq("absolute title", pageMeta({ title: "Home", absoluteTitle: true, description: "d", path: "/" }).title, { absolute: "Home" });

console.log("— guides");
const slugs = GUIDES.map((x) => x.slug);
eq("slugs unique", new Set(slugs).size, slugs.length);
for (const x of GUIDES) {
  t(`${x.slug}: url-safe slug`, /^[a-z0-9-]+$/.test(x.slug));
  t(`${x.slug}: summary 100–200 characters`, x.summary.length >= 100 && x.summary.length <= 200, x.summary.length);
  t(`${x.slug}: title under 75 characters`, x.title.length <= 75, x.title.length);
  t(`${x.slug}: dates are dates`, /^\d{4}-\d{2}-\d{2}$/.test(x.updated) && (!x.published || x.published <= x.updated));
  t(`${x.slug}: related guides exist`, x.related.every((r) => slugs.includes(r) && r !== x.slug), x.related);
  eq(`${x.slug}: three to read next`, relatedTo(x).length, 3);
  t(`${x.slug}: has sources`, x.sources.length > 0 && x.sources.every((s) => /^https:\/\//.test(s.url)));
  t(`${x.slug}: never claims HMRC recognition`, !/recogni[sz]ed/i.test(JSON.stringify(x)));
}
const ch = GUIDES.find((x) => x.slug === "companies-house-software-filing-2028")!;
t("2028 guide says the P&L filing is paused", /paused/i.test(JSON.stringify(ch)) && /23 October 2026/.test(JSON.stringify(ch)));
t("2028 guide no longer says small companies will file the P&L", !/will file a profit and loss account/.test(JSON.stringify(ch)));
const pen = JSON.stringify(GUIDES.find((x) => x.slug === "corporation-tax-deadlines-penalties"));
t("penalties: £200 and £400", /£200/.test(pen) && /£400/.test(pen));
t("penalties: repeat £1,000 and £2,000", /£1,000/.test(pen) && /£2,000/.test(pen));
t("penalties: Companies House scale", ["£150", "£375", "£750", "£1,500"].every((v) => pen.includes(v)));

console.log("— the calculator's worked example");
const fig = (profit: number): ReturnFigures => ({
  periodFrom: "2026-04-01", periodTo: "2027-03-31", associatedCompanies: 0,
  pl: { turnover: profit, otherIncome: 0, interestReceived: 0, costOfSales: 0, staffCosts: 0, depreciation: 0, otherCharges: 0 },
  disallowable: { entertainment: 0, finesAndPenalties: 0, charitableDonations: 0, politicalDonations: 0, privateExpenses: 0, capitalItemsExpensed: 0, lossOnDisposals: 0, other: 0 },
  profitOnDisposals: 0,
  capitalAllowances: { additions: [], disposals: [], mainPoolBroughtForward: 0, specialPoolBroughtForward: 0 },
  tradingLossesBroughtForward: 0, qualifyingDonations: 0,
});
const r = compute(fig(100_000));
eq("£100,000: 25% is £25,000", r.corporationTax, 25000);
eq("£100,000: marginal relief £2,250", r.marginalRelief, 2250);
eq("£100,000: tax £22,750", r.taxChargeable, 22750);
t("the page states the same example", CALCULATOR.faq.some((f) => f.a.includes("£2,250") && f.a.includes("£22,750")));
eq("£50,000: 19%", compute(fig(50_000)).taxChargeable, 9500);
eq("£300,000: 25%", compute(fig(300_000)).taxChargeable, 75000);

console.log("— structured data");
const home = JSON.stringify(homeGraph());
t("home: organisation, website, software", ["Organization", "WebSite", "SoftwareApplication"].every((x) => home.includes(`"${x}"`)));
t("home: no ratings without reviews", !/aggregateRating|review/i.test(home));
const art = articleGraph({ title: "T", description: "D", path: "/guides/x", modified: "2026-11-12", section: "Guides" }) as { "@graph": Record<string, unknown>[] };
eq("article url", art["@graph"][0].url, "https://nuctafilings.co.uk/guides/x");
eq("breadcrumb trail", ((art["@graph"][1] as { itemListElement: { name: string }[] }).itemListElement).map((i) => i.name), ["Home", "Guides", "T"]);
const calc = JSON.stringify(calculatorGraph({ title: "C", description: "D", path: "/corporation-tax-calculator" }));
t("calculator: free web application", calc.includes('"WebApplication"') && calc.includes('"price":"0"'));

console.log("— sitemap, Markdown and llms.txt");
const pages = publicPages();
t("every guide in the sitemap", GUIDES.every((x) => pages.some((p) => p.path === `/guides/${x.slug}`)));
t("calculator in the sitemap", pages.some((p) => p.path === "/corporation-tax-calculator"));
t("no private pages in the sitemap", !pages.some((p) => /^\/(dashboard|companies|returns|account|gateway|log|settings)(\/|$)|^\/check\//.test(p.path)));
for (const p of markdownPages()) t(`markdown for ${p}`, markdownFor(p) !== null);
eq("unknown markdown", markdownFor("guides/nope"), null);
eq("guide copy points at the page", markdownFor(`guides/${GUIDES[0].slug}`)!.canonical, `https://nuctafilings.co.uk/guides/${GUIDES[0].slug}`);
eq("markdown sitemap has no canonical (noindex)", markdownFor("sitemap")!.canonical, null);
const md = guideMarkdown(GUIDES[0]);
t("guide copy has the title and every heading", md.startsWith(`# ${GUIDES[0].title}`) && GUIDES[0].sections.every((s) => md.includes(`## ${s.heading}`)));
const llms = llmsTxt();
t("llms.txt starts with the name", llms.startsWith("# Nucta Filings\n\n> "));
t("llms.txt links every guide's Markdown", GUIDES.every((x) => llms.includes(`/guides/${x.slug}.md`)));

env(keep.url, keep.prod);
console.log(`${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
