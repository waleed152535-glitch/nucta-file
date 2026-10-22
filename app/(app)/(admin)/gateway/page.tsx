import GatewayConsole from "./GatewayConsole";
import { getLiveSettings } from "@/lib/live-settings";
import { readiness, VENDOR_ID, SENDER_ID, ENDPOINTS } from "@/lib/hmrc";

export const dynamic = "force-dynamic";
/** The host allows a minute; submitting and polling both need most of it. */
export const maxDuration = 60;

export default async function GatewayPage() {
  const live = await getLiveSettings();
  return (
    <GatewayConsole
      checks={readiness(live)}
      vendorId={VENDOR_ID}
      senderId={SENDER_ID}
      endpoint={ENDPOINTS.test}
      testUtr={process.env.HMRC_TEST_UTR ?? "8596148860"}
    />
  );
}
