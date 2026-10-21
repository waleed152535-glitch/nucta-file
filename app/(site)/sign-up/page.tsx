import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { SignUpForm } from "../AuthForms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Create your account" };

export default async function SignUp() {
  if (await currentUser()) redirect("/dashboard");
  return (
    <section className="auth">
      <div className="wrap">
        <div className="auth-side">
          <h2>Prepare your first return today</h2>
          <ul className="ticks">
            <li>Add a company from Companies House in a few seconds.</li>
            <li>Enter the year&apos;s figures; the tax works itself out.</li>
            <li>Download the accounts, computation and CT600, and an approval pack for the director.</li>
            <li>Test the return with HMRC&apos;s test service. When live filing opens, it&apos;s ready to file.</li>
          </ul>
        </div>
        <SignUpForm />
      </div>
    </section>
  );
}
