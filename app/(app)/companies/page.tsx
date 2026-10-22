import { chApiReady } from "@/lib/ch-api";
import CompaniesClient from "./CompaniesClient";
import { listCompanies } from "@/lib/return-actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Companies" };

export default async function CompaniesPage({ searchParams }: { searchParams: Promise<{ add?: string }> }) {
  const r = await listCompanies();
  const add = (await searchParams).add === "1";
  return <CompaniesClient companies={r.companies} error={r.ok ? undefined : r.error} chReady={chApiReady()} startAdding={add} />;
}
