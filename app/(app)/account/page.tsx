import { currentUser } from "@/lib/auth";
import AccountClient from "./AccountClient";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const u = (await currentUser())!;
  return <AccountClient name={u.name} email={u.email} firm={u.accountName} kind={u.accountKind} />;
}
