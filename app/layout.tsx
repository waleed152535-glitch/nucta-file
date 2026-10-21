import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NUCTA_SITE_URL ?? "https://nucta-file.vercel.app"),
  title: { default: "Nucta File — Company Tax Returns and accounts for small companies", template: "%s — Nucta File" },
  description: "Prepare a small company's accounts, work out its Corporation Tax and file the CT600 to HMRC with the iXBRL accounts and computation attached.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0E1626",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <body>{children}</body>
    </html>
  );
}
