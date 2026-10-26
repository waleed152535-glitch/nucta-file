/**
 * What the browser reports about itself for HMRC's fraud prevention headers:
 * a device ID kept on this device, the time zone, the screens and the window.
 * Browser only.
 */
import type { ClientInfo } from "./vat-rules";

const KEY = "nf_device";

function deviceId(): string {
  let id: string | null = null;
  try { id = localStorage.getItem(KEY); } catch { /* storage blocked */ }
  if (!id) {
    const m = /(?:^|;\s*)nf_device=([0-9a-f-]{36})/i.exec(document.cookie);
    id = m?.[1] ?? null;
  }
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) id = crypto.randomUUID();
  try { localStorage.setItem(KEY, id); } catch { /* storage blocked */ }
  document.cookie = `${KEY}=${id}; Path=/; Max-Age=${60 * 60 * 24 * 365 * 5}; SameSite=Lax`;
  return id;
}

export function clientInfo(): ClientInfo {
  const off = -new Date().getTimezoneOffset();
  const pad = (n: number) => String(Math.floor(Math.abs(n))).padStart(2, "0");
  return {
    deviceId: deviceId(),
    userAgent: navigator.userAgent,
    timezone: `UTC${off >= 0 ? "+" : "-"}${pad(off / 60)}:${pad(off % 60)}`,
    screens: [{ width: screen.width, height: screen.height, scalingFactor: window.devicePixelRatio || 1, colourDepth: screen.colorDepth || 24 }],
    window: { width: window.innerWidth, height: window.innerHeight },
  };
}
