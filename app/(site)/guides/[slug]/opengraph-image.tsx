import { GUIDES, guide } from "@/lib/guides";
import { OG_SIZE, OG_TYPE, shareImage } from "@/lib/og";

export const size = OG_SIZE;
export const contentType = OG_TYPE;
export const alt = "A Nucta File guide for small UK companies";

export function generateStaticParams() {
  return GUIDES.map((g) => ({ slug: g.slug }));
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const g = guide((await params).slug);
  return shareImage({ kicker: "Guide", title: g ? (g.short ?? g.title) : "Guides for small UK companies" });
}
