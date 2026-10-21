import ReturnWizard from "./ReturnWizard";
import { getReturn } from "@/lib/return-actions";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function ReturnPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await getReturn(id);
  if (!r.ok || !r.data || !r.company) {
    return (
      <div className="content">
        <div className="banner bad"><span>✕</span><span><b>This return couldn&apos;t be opened.</b> {r.error}</span></div>
      </div>
    );
  }
  return (
    <ReturnWizard id={id} periodStart={r.periodStart!} periodEnd={r.periodEnd!} status={r.status!}
      company={r.company} initial={r.data} submissions={r.submissions ?? []} />
  );
}
