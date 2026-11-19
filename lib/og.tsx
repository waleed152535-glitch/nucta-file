import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { HOME_DOMAIN, siteOrigin } from "./site";

/**
 * The picture shown when a page is shared (LinkedIn, WhatsApp, X, Slack):
 * 1200 × 630, the site's night blue, the folded-paper N, and the page's own
 * title large enough to read in a feed.
 */
export const OG_SIZE = { width: 1200, height: 630 };
export const OG_TYPE = "image/png";

const fonts = async () => {
  const dir = join(process.cwd(), "assets/fonts");
  const [regular, heavy] = await Promise.all([
    readFile(join(dir, "public-sans-latin-400-normal.woff")),
    readFile(join(dir, "public-sans-latin-800-normal.woff")),
  ]);
  return [
    { name: "Public Sans", data: regular, weight: 400 as const, style: "normal" as const },
    { name: "Public Sans", data: heavy, weight: 800 as const, style: "normal" as const },
  ];
};

const host = () => {
  try { return new URL(siteOrigin()).host; } catch { return HOME_DOMAIN; }
};

export async function shareImage({ kicker, title, foot }: { kicker?: string; title: string; foot?: string }) {
  const size = title.length > 70 ? 56 : title.length > 44 ? 66 : 78;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between",
          padding: "64px 72px", color: "#EEF2F8", fontFamily: "Public Sans",
          backgroundColor: "#070B14",
          backgroundImage: "radial-gradient(circle at 92% 8%, rgba(252,60,23,0.28), rgba(7,11,20,0) 46%), radial-gradient(circle at 0% 100%, rgba(36,73,184,0.22), rgba(7,11,20,0) 50%)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <svg width="56" height="56" viewBox="0 0 48 48">
            <rect x="8" y="7" width="10" height="34" rx="2" fill="#FC3C17" />
            <polygon points="8,7 18,7 40,41 30,41" fill="#FFB4A3" />
            <rect x="30" y="7" width="10" height="34" rx="2" fill="#FC3C17" />
          </svg>
          <div style={{ display: "flex", fontSize: 34, fontWeight: 800, letterSpacing: -0.5 }}>Nucta Filings</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {kicker ? <div style={{ display: "flex", fontSize: 28, color: "#FF8466" }}>{kicker}</div> : null}
          <div style={{ display: "flex", fontSize: size, fontWeight: 800, lineHeight: 1.06, letterSpacing: -1.5, maxWidth: 1040 }}>{title}</div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", fontSize: 26, color: "#AAB5C9" }}>
          <div style={{ display: "flex" }}>{foot ?? "Company Tax Returns and accounts for small UK companies"}</div>
          <div style={{ display: "flex", color: "#EEF2F8" }}>{host()}</div>
        </div>
      </div>
    ),
    { ...OG_SIZE, fonts: await fonts() },
  );
}
