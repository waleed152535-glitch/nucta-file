import GatewayConsole from "./GatewayConsole";
import { readiness, VENDOR_ID, SENDER_ID, ENDPOINTS } from "@/lib/hmrc";

export const dynamic = "force-dynamic";
/** The host allows a minute; submitting and polling both need most of it. */
export const maxDuration = 60;

export default function GatewayPage() {
  return (
    <GatewayConsole
      checks={readiness()}
      vendorId={VENDOR_ID}
      senderId={SENDER_ID}
      endpoint={ENDPOINTS.test}
      testUtr={process.env.HMRC_TEST_UTR ?? "8596148860"}
    />
  );
}
