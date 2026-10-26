import { redirect } from "next/navigation";
import { chApiReady } from "@/lib/ch-api";
import CompaniesClient from "./CompaniesClient";
import { listCompanies } from "@/lib/return-actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Companies" };

export default async function CompaniesPage({ searchParams }: { searchParams: Promise<{ add?: string; number?: string }> }) {
  const r = await listCompanies();
  const sp = await searchParams;
  const add = sp.add === "1";
  // Arriving from the deadline checker with a company number: open it, or
  // go to it if it's already here.
  const raw = String(sp.number ?? "").toUpperCase();
  const number = /^[A-Z0-9]{8}$/.test(raw) ? raw : undefined;
  if (number) {
    const have = r.companies.find((c) => (c.companyNo ?? "").toUpperCase() === number);
    if (have) redirect(`/companies/${have.id}`);
  }
  return <CompaniesClient companies={r.companies} error={r.ok ? undefined : r.error} chReady={chApiReady()} startAdding={add || Boolean(number)} startNumber={number} />;
}
