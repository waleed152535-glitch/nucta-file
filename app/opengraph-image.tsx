import { OG_SIZE, OG_TYPE, shareImage } from "@/lib/og";

export const alt = "Nucta Filings: CT600 software and accounts for small UK companies";
export const size = OG_SIZE;
export const contentType = OG_TYPE;

export default function Image() {
  return shareImage({ title: "File the CT600 with HMRC, accounts and tax worked out for you" });
}
