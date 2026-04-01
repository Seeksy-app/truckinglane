import { TL_TRIGGER_KEY_HEADER } from "@/lib/datLaneRates";

const DEFAULT_NOTIFY_SMS_URL = "https://axel.podlogix.io/tl/notify-sms";

function notifySmsUrl(): string {
  const v = import.meta.env.VITE_TL_NOTIFY_SMS_URL as string | undefined;
  return (v && v.trim()) || DEFAULT_NOTIFY_SMS_URL;
}

/** Send a one-off SMS via VPS tl-trigger /notify-sms (SimpleTexting). */
export async function sendBookingNotifySms(phone: string, text: string): Promise<{ ok: boolean; error?: string }> {
  let res: Response;
  try {
    res = await fetch(notifySmsUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-TL-Trigger-Key": TL_TRIGGER_KEY_HEADER,
      },
      body: JSON.stringify({ phone, text }),
    });
  } catch {
    return { ok: false, error: "Network error" };
  }
  let data: { ok?: boolean; error?: string } = {};
  try {
    data = (await res.json()) as { ok?: boolean; error?: string };
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    return { ok: false, error: data.error || `HTTP ${res.status}` };
  }
  return { ok: true };
}
