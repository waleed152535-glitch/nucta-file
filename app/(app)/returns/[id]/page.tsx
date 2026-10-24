import ReturnWizard from "./ReturnWizard";
import { getReturn } from "@/lib/return-actions";
import { checkFilingFee } from "@/lib/billing-actions";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function ReturnPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ fee?: string; step?: string; session_id?: string }> }) {
  const { id } = await params;
  const q = await searchParams;
  // Back from Stripe's payment page, or a link to the filing step: open "Review and file".
  const initialStep = q.fee || q.step === "file" ? 8 : 0;
  // Back from Stripe: ask Stripe how the payment went, here on the server, before the page is shown.
  let feeNotice: { tone: "good" | "bad" | "info"; text: string } | undefined;
  if (q.fee === "cancelled") feeNotice = { tone: "info", text: "Payment cancelled. Nothing was charged." };
  else if (q.fee === "back" && q.session_id) {
    const c = await checkFilingFee(id, q.session_id);
    feeNotice = { tone: c.ok ? "good" : c.status === "pending" ? "info" : "bad", text: c.words };
  }
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
      company={r.company} initial={r.data} submissions={r.submissions ?? []} initialStep={initialStep} feeNotice={feeNotice} />
  );
}
