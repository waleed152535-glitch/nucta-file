import { OG_SIZE, OG_TYPE, shareImage } from "@/lib/og";

export const size = OG_SIZE;
export const contentType = OG_TYPE;
export const alt = "Corporation Tax calculator: 19%, 25% and marginal relief";

export default function Image() {
  return shareImage({ kicker: "Free calculator", title: "Corporation Tax at 19%, 25% and marginal relief" });
}
