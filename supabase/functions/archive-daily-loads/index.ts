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

    // Flip today's pending Century loads active after midnight archive
    const today = new Date().toISOString().split("T")[0];
    await supabaseAdmin
      .from("loads")
      .update({ is_active: true })
      .eq("template_type", "century_pdf")
      .eq("ship_date", today)
      .eq("is_active", false);

    console.log("Century pending loads flipped active for", today);

    return new Response(
      JSON.stringify({ 
        success: true, 
        archived_count: archivedCount,
        timestamp: new Date().toISOString()
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
