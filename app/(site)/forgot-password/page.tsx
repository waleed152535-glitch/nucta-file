import { ForgotForm } from "../AuthForms";

export const metadata = { title: "Reset your password" };

export default function Forgot() {
  return (
    <section className="auth">
      <div className="wrap">
        <div className="auth-side">
          <h2>Forgotten your password?</h2>
          <p>Enter the email you signed up with. The link works for one hour, and signs you out of every other browser once used.</p>
        </div>
        <ForgotForm />
      </div>
    </section>
  );
}
