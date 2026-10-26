import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { SignUpForm } from "../AuthForms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Create your account" };

export default async function SignUp({ searchParams }: { searchParams: Promise<{ company?: string }> }) {
  const raw = String((await searchParams).company ?? "").toUpperCase();
  const company = /^[A-Z0-9]{8}$/.test(raw) ? raw : undefined;
  if (await currentUser()) redirect(company ? `/companies?add=1&number=${company}` : "/dashboard");
  return (
    <section className="auth">
      <div className="wrap">
        <div className="auth-side">
          <h2>Prepare your first return today</h2>
          <ul className="ticks">
            <li>{company ? <>Company {company} opens, ready to add, as soon as your account is made.</> : "Add a company from Companies House in a few seconds."}</li>
            <li>Enter the year&apos;s figures; the tax works itself out.</li>
            <li>Download the accounts, computation and CT600, and an approval pack for the director.</li>
            <li>File with HMRC using the company&apos;s HMRC sign-in, and get the figures for Companies House in the same place.</li>
            <li>Free while we launch.</li>
          </ul>
        </div>
        <SignUpForm company={company} />
      </div>
    </section>
  );
}
