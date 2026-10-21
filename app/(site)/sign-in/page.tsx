import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { SignInForm } from "../AuthForms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in" };

export default async function SignIn({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await currentUser()) redirect("/dashboard");
  const next = (await searchParams).next ?? "/dashboard";
  return (
    <section className="auth">
      <div className="wrap">
        <div className="auth-side">
          <h2>Welcome back</h2>
          <p>Your companies, their deadlines and every return you&apos;ve prepared are where you left them.</p>
        </div>
        <SignInForm next={next} />
      </div>
    </section>
  );
}
