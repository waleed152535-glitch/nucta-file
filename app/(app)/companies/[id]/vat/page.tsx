import VatClient from "./VatClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "VAT returns" };

const NOTICES: Record<string, { tone: "good" | "bad" | "info"; text: string }> = {
  connected: { tone: "good", text: "Connected to HMRC. Nucta File can now see this business's VAT periods and send its returns." },
  declined: { tone: "info", text: "Nothing was connected: the authority wasn't granted on HMRC's page." },
  failed: { tone: "bad", text: "HMRC didn't complete the connection. Try again; if it keeps failing, check that the business is signed up for Making Tax Digital for VAT." },
  "wrong-person": { tone: "bad", text: "That HMRC sign-in was started by someone else. Start it again from this page." },
  expired: { tone: "bad", text: "The HMRC sign-in took too long. Start it again." },
  "not-set-up": { tone: "bad", text: "VAT returns aren't set up on this site yet." },
  "agent-for-practices": { tone: "info", text: "Agent services accounts are for practices. Connect with the business's own HMRC sign-in." },
};

export default async function VatPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ hmrc?: string }> }) {
  const { id } = await params;
  const n = NOTICES[(await searchParams).hmrc ?? ""];
  return <VatClient companyId={id} notice={n} />;
}
