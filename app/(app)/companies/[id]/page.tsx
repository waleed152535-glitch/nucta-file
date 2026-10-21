import CompanyClient from "./CompanyClient";
import { getCompany } from "@/lib/return-actions";

export const dynamic = "force-dynamic";

export default async function CompanyPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string; to?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const r = await getCompany(id);
  if (!r.ok || !r.company) {
    return <div className="content"><div className="banner bad"><span>✕</span><span>{r.error}</span></div></div>;
  }
  const iso = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
  const suggest = iso(sp.from) && iso(sp.to) ? { from: sp.from!, to: sp.to! } : undefined;
  return <CompanyClient company={r.company} returns={r.returns} deadlines={r.deadlines} chReady={r.chReady} suggest={suggest} />;
}
