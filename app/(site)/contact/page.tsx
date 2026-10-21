import { SITE } from "@/lib/site";

export const metadata = { title: "Contact", description: "How to reach the Nucta File team." };

export default function Contact() {
  return (
    <section className="read">
      <div className="wrap">
        <h1>Contact</h1>
        <p style={{ fontSize: 19 }}>Email <a href={`mailto:${SITE.email}`}>{SITE.email}</a> and we&apos;ll reply within one working day.</p>
        <h2>When you write</h2>
        <ul>
          <li>For a question about a return, include the company&apos;s name and the period — never a password or an authentication code.</li>
          <li>For a password reset, write from the email address you signed up with.</li>
        </ul>
        <p className="small">{SITE.company}{SITE.registeredOffice ? `, ${SITE.registeredOffice}` : ""}. <a href={SITE.parentSite}>{SITE.parentSite.replace("https://", "")}</a></p>
      </div>
    </section>
  );
}
