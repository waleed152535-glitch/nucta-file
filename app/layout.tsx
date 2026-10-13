import type { Metadata, Viewport } from "next";
import "./globals.css";
import Nav from "@/components/Nav";

export const metadata: Metadata = {
  title: "Nucta File — UK tax and accounts filing",
  description:
    "File Corporation Tax returns, statutory accounts and VAT returns directly with HMRC and Companies House.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0C1222",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <body>
        <div className="app">
          <Nav />
          <div className="main">{children}</div>
        </div>
      </body>
    </html>
  );
}
