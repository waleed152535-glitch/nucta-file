import CompaniesClient from "./CompaniesClient";
import { listCompanies } from "@/lib/return-actions";

export const dynamic = "force-dynamic";

export default async function CompaniesPage() {
  const r = await listCompanies();
  return <CompaniesClient companies={r.companies} error={r.ok ? undefined : r.error} />;
}
