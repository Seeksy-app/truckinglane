import { supabase } from "@/integrations/supabase/client";

export type SendTrackingLinkResult =
  | { ok: true; phone_e164: string }
  | { needPhone: true }
  | { error: string };

export async function sendTrackingLinkRequest(
  loadId: string,
  driverPhone?: string,
): Promise<SendTrackingLinkResult> {
  const body: { load_id: string; driver_phone?: string } = { load_id: loadId };
  if (driverPhone?.trim()) body.driver_phone = driverPhone.trim();

  const { data, error } = await supabase.functions.invoke("send-tracking-link", { body });

  if (error) {
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx) {
        const j = (await ctx.json()) as { error?: string; need_phone?: boolean };
        if (j.need_phone) return { needPhone: true };
        if (j.error) return { error: j.error };
      }
    } catch {
      /* ignore */
    }
    return { error: error.message || "Request failed" };
  }

  const d = data as {
    success?: boolean;
    error?: string;
    need_phone?: boolean;
    phone_e164?: string;
  } | null;

  if (d?.need_phone) return { needPhone: true };
  if (!d?.success) return { error: d?.error || "Failed to send tracking link" };
  return { ok: true, phone_e164: d.phone_e164 || "" };
}
