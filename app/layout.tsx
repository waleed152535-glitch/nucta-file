import type { Metadata, Viewport } from "next";
import "@fontsource/public-sans/400.css";
import "@fontsource/public-sans/500.css";
import "@fontsource/public-sans/600.css";
import "@fontsource/public-sans/700.css";
import "@fontsource/public-sans/800.css";
import "@fontsource-variable/bricolage-grotesque/opsz.css";
import "./globals.css";
import { siteOrigin } from "@/lib/site";

export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin()),
  applicationName: "Nucta Filings",
  title: { default: "Nucta Filings — Company Tax Returns and accounts for small companies", template: "%s — Nucta Filings" },
  description: "Prepare a small company's accounts, work out its Corporation Tax and file the CT600 to HMRC with the iXBRL accounts and computation attached.",
  openGraph: { siteName: "Nucta Filings", locale: "en_GB", type: "website" },
  twitter: { card: "summary_large_image" },
  formatDetection: { telephone: false, email: false, address: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#070B14",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <body>{children}</body>
    </html>
  );
}
