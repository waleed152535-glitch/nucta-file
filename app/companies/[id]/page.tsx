import CompanyClient from "./CompanyClient";
import { getCompany } from "@/lib/return-actions";

export const dynamic = "force-dynamic";

export default async function CompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await getCompany(id);
  if (!r.ok || !r.company) {
    return <div className="content"><div className="banner bad"><span>✕</span><span>{r.error}</span></div></div>;
  }
  return <CompanyClient company={r.company} returns={r.returns} />;
}
