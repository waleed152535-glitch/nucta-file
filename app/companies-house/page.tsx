import ChConsole from "./ChConsole";
import { CH_GATEWAY } from "@/lib/companies-house";

export const dynamic = "force-dynamic";
/** Sending is acknowledged within the same connection, but can take a while. */
export const maxDuration = 60;

export default function CompaniesHousePage() {
  const email = process.env.CH_CONTACT_EMAIL ?? process.env.HMRC_CONTACT_EMAIL;
  const checks = [
    {
      label: "Presenter ID",
      ok: Boolean(process.env.CH_PRESENTER_ID),
      detail: process.env.CH_PRESENTER_ID
        ? "Held in the environment; sent only as a hash."
        : "Add CH_PRESENTER_ID once Companies House email your test account details.",
    },
    {
      label: "Presenter authentication code",
      ok: Boolean(process.env.CH_PRESENTER_AUTH),
      detail: process.env.CH_PRESENTER_AUTH
        ? "Held in the environment, never in the code; sent only as a hash."
        : "Add CH_PRESENTER_AUTH from the same email. Don't paste it into a chat.",
    },
    {
      label: "Contact email",
      ok: Boolean(email),
      detail: email
        ? `Companies House will write to ${email} about results waiting to be collected.`
        : "Add CH_CONTACT_EMAIL — Companies House use it to tell you results are waiting.",
    },
  ];
  return <ChConsole checks={checks} gateway={CH_GATEWAY} />;
}
