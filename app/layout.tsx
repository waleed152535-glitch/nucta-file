import type { Metadata, Viewport } from "next";
import "@fontsource/public-sans/400.css";
import "@fontsource/public-sans/500.css";
import "@fontsource/public-sans/600.css";
import "@fontsource/public-sans/700.css";
import "@fontsource/public-sans/800.css";
import "@fontsource-variable/bricolage-grotesque/opsz.css";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NUCTA_SITE_URL ?? "https://nucta-file.vercel.app"),
  title: { default: "Nucta File — Company Tax Returns and accounts for small companies", template: "%s — Nucta File" },
  description: "Prepare a small company's accounts, work out its Corporation Tax and file the CT600 to HMRC with the iXBRL accounts and computation attached.",
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
