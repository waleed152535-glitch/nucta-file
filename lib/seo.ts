import type { Metadata } from "next";
import { SITE, absolute, siteOrigin } from "./site";

/**
 * What search engines and link previews see for each public page: one
 * canonical address, the Open Graph and X (Twitter) card tags, and the
 * structured data (JSON-LD) that says what the page is about.
 *
 * Everything here describes what is visible on the page itself. Nothing is
 * claimed in the markup that the page doesn't say: no ratings (there are no
 * reviews yet), and no HMRC recognition until HMRC list the software.
 */

export interface PageSeo {
  /** The page's own title; " — Nucta File" is added unless `absoluteTitle`. */
  title: string;
  description: string;
  /** The page's path, e.g. "/pricing". Becomes the canonical address. */
  path: string;
  absoluteTitle?: boolean;
  type?: "website" | "article";
  /**
   * The share image. Leave it out for the site's own (/opengraph-image).
   * Pass null where the page's folder has its own opengraph-image file, which
   * Next adds by itself under an address it chooses.
   */
  image?: string | null;
  modified?: string;
  published?: string;
}

const SHARE_ALT = "Nucta File: Company Tax Returns and accounts for small UK companies";

export function pageMeta(p: PageSeo): Metadata {
  const full = p.absoluteTitle ? p.title : `${p.title} — ${SITE.product}`;
  const images = p.image === null ? undefined : [{ url: p.image ?? "/opengraph-image", width: 1200, height: 630, alt: SHARE_ALT }];
  const article = p.type === "article"
    ? { publishedTime: p.published ?? p.modified, modifiedTime: p.modified }
    : {};
  return {
    title: p.absoluteTitle ? { absolute: p.title } : p.title,
    description: p.description,
    alternates: { canonical: p.path },
    openGraph: {
      type: p.type ?? "website",
      url: p.path,
      siteName: SITE.product,
      locale: "en_GB",
      title: full,
      description: p.description,
      ...(images ? { images } : {}),
      ...article,
    },
    twitter: {
      card: "summary_large_image",
      title: full,
      description: p.description,
      ...(images ? { images: images.map((i) => i.url) } : {}),
    },
  };
}

// ---- structured data ----

type Thing = Record<string, unknown>;
const ORG_ID = () => `${siteOrigin()}/#organization`;
const SITE_ID = () => `${siteOrigin()}/#website`;
const APP_ID = () => `${siteOrigin()}/#software`;

/** The company behind Nucta File. */
export function organization(): Thing {
  return {
    "@type": "Organization",
    "@id": ORG_ID(),
    name: SITE.company,
    url: SITE.parentSite,
    email: SITE.email,
    ...(SITE.companyNumber ? { identifier: { "@type": "PropertyValue", propertyID: "Companies House company number", value: SITE.companyNumber } } : {}),
    brand: { "@type": "Brand", name: SITE.product },
  };
}

export function website(): Thing {
  return {
    "@type": "WebSite",
    "@id": SITE_ID(),
    name: SITE.product,
    url: absolute("/"),
    inLanguage: "en-GB",
    publisher: { "@id": ORG_ID() },
  };
}

/** Nucta File itself, as the home page describes it. */
export function softwareApplication(): Thing {
  return {
    "@type": "SoftwareApplication",
    "@id": APP_ID(),
    name: SITE.product,
    url: absolute("/"),
    applicationCategory: "FinanceApplication",
    operatingSystem: "Web browser",
    description: "Prepares a small UK company's accounts, works out its Corporation Tax and files the Company Tax Return (CT600) with HMRC, with the accounts and tax computation attached in iXBRL.",
    featureList: [
      "CT600 Company Tax Returns filed with HMRC",
      "Micro-entity (FRS 105) and small company (FRS 102 Section 1A) accounts in iXBRL",
      "Corporation Tax computation with marginal relief and associated companies",
      "Capital allowances, director's loans (CT600A) and losses",
      "Dormant company accounts",
      "Deadline tracking for every client company",
    ],
    inLanguage: "en-GB",
    publisher: { "@id": ORG_ID() },
  };
}

/** The home page's graph: who, what site, what product. */
export function homeGraph(): Thing {
  return { "@context": "https://schema.org", "@graph": [organization(), website(), softwareApplication()] };
}

export function breadcrumbs(items: { name: string; path: string }[]): Thing {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: absolute(it.path) })),
  };
}

export function articleGraph(a: { title: string; description: string; path: string; modified: string; published?: string; section: string }): Thing {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        headline: a.title,
        description: a.description,
        url: absolute(a.path),
        mainEntityOfPage: absolute(a.path),
        datePublished: a.published ?? a.modified,
        dateModified: a.modified,
        inLanguage: "en-GB",
        author: { "@id": ORG_ID() },
        publisher: { "@id": ORG_ID() },
        isPartOf: { "@id": SITE_ID() },
      },
      breadcrumbs([{ name: "Home", path: "/" }, { name: a.section, path: "/guides" }, { name: a.title, path: a.path }]),
      organization(),
    ],
  };
}

/** The free calculator page: a tool anyone can use, at no cost. */
export function calculatorGraph(a: { title: string; description: string; path: string }): Thing {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebApplication",
        name: a.title,
        description: a.description,
        url: absolute(a.path),
        applicationCategory: "FinanceApplication",
        operatingSystem: "Web browser",
        isAccessibleForFree: true,
        offers: { "@type": "Offer", price: "0", priceCurrency: "GBP" },
        inLanguage: "en-GB",
        publisher: { "@id": ORG_ID() },
      },
      breadcrumbs([{ name: "Home", path: "/" }, { name: a.title, path: a.path }]),
      organization(),
    ],
  };
}
