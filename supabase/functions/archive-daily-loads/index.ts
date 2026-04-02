import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Archive all active, non-booked loads
    const { data, error } = await supabaseAdmin
      .from("loads")
      .update({
        is_active: false,
        archived_at: new Date().toISOString(),
      })
      .eq("is_active", true)
      .neq("status", "booked")
      .select("id, agency_id, template_type");

    if (error) {
      console.error("Error archiving loads:", error);
      return new Response(
        JSON.stringify({ success: false, error: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const archivedCount = data?.length ?? 0;
    console.log(`Archived ${archivedCount} loads at midnight ET`);

    // Log the archive event per agency to email_import_logs for visibility
    if (archivedCount > 0) {
      const byAgency = new Map<string, number>();
      for (const load of data!) {
        const agencyId = load.agency_id as string;
        byAgency.set(agencyId, (byAgency.get(agencyId) || 0) + 1);
      }

      const logEntries = Array.from(byAgency.entries()).map(([agencyId, count]) => ({
        agency_id: agencyId,
        sender_email: "system@daily-archive",
        subject: `Nightly Archive — ${count} loads cleared`,
        status: "success",
        imported_count: count,
      }));

      const { error: logError } = await supabaseAdmin
        .from("email_import_logs")
        .insert(logEntries);

      if (logError) {
        console.error("Error logging archive:", logError);
      }
    }

    // Century PDF: same rules as pg_cron century_pdf_daily_cron_flip_purge (after nightly archive)
    const now = new Date();
    const todayUtc = now.toISOString().split("T")[0];
    const priorCalendarDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
    const shipDateStrictlyBefore = priorCalendarDay.toISOString().split("T")[0];

    const { data: centuryFlipped, error: centuryFlipError } = await supabaseAdmin
      .from("loads")
      .update({ is_active: true })
      .in("template_type", ["century_pdf", "Century"])
      .eq("ship_date", todayUtc)
      .eq("is_active", false)
      .select("id");

    if (centuryFlipError) {
      console.error("Century flip error:", centuryFlipError);
    } else {
      console.log(`Century: flipped active for ship_date=${todayUtc}, count=${centuryFlipped?.length ?? 0}`);
    }

    const { data: centuryPendingOpen, error: centuryPendingOpenError } = await supabaseAdmin
      .from("loads")
      .update({ dispatch_status: "open" })
      .in("template_type", ["century_pdf", "Century"])
      .eq("ship_date", todayUtc)
      .eq("dispatch_status", "pending")
      .select("id");

    if (centuryPendingOpenError) {
      console.error("Century pending→open error:", centuryPendingOpenError);
    } else {
      console.log(
        `Century: pending→open for ship_date=${todayUtc}, count=${centuryPendingOpen?.length ?? 0}`,
      );
    }

    const { data: centuryPurged, error: centuryPurgeError } = await supabaseAdmin
      .from("loads")
      .update({ is_active: false })
      .in("template_type", ["century_pdf", "Century"])
      .lt("ship_date", shipDateStrictlyBefore)
      .eq("is_active", true)
      .is("sms_book_status", null)
      .select("id");

    if (centuryPurgeError) {
      console.error("Century purge error:", centuryPurgeError);
    } else {
      console.log(
        `Century: purged inactive for ship_date < ${shipDateStrictlyBefore}, count=${centuryPurged?.length ?? 0}`,
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        archived_count: archivedCount,
        century_pdf_flipped_active: centuryFlipped?.length ?? 0,
        century_pending_to_open: centuryPendingOpen?.length ?? 0,
        century_pdf_purged_inactive: centuryPurged?.length ?? 0,
        century_flip_error: centuryFlipError?.message ?? null,
        century_pending_open_error: centuryPendingOpenError?.message ?? null,
        century_purge_error: centuryPurgeError?.message ?? null,
        timestamp: new Date().toISOString(),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );

  } catch (error: unknown) {
    console.error("Error in archive-daily-loads:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
