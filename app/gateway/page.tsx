import GatewayConsole from "./GatewayConsole";
import { readiness, VENDOR_ID, SENDER_ID, ENDPOINTS } from "@/lib/hmrc";

export const dynamic = "force-dynamic";

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
