import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

// Timezone groups for batch processing at each hour
const TIMEZONE_MIDNIGHT_HOURS: Record<string, number> = {
  "America/New_York": 5,      // UTC-5 (EST) or UTC-4 (EDT)
  "America/Chicago": 6,       // UTC-6 (CST) or UTC-5 (CDT)
  "America/Denver": 7,        // UTC-7 (MST) or UTC-6 (MDT)
  "America/Phoenix": 7,       // UTC-7 (MST, no DST)
  "America/Los_Angeles": 8,   // UTC-8 (PST) or UTC-7 (PDT)
  "America/Anchorage": 9,     // UTC-9 (AKST) or UTC-8 (AKDT)
  "Pacific/Honolulu": 10,     // UTC-10 (HST, no DST)
  "UTC": 0,
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Authenticate via x-cron-secret header
  const cronSecret = Deno.env.get("CRON_SECRET");
  const providedSecret = req.headers.get("x-cron-secret");

  if (!cronSecret || providedSecret !== cronSecret) {
    console.error("[daily-agent-reset] Unauthorized: Invalid or missing x-cron-secret");
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const now = new Date();
    const currentUtcHour = now.getUTCHours();
    const todayUtc = now.toISOString().split("T")[0];

    console.log(`[daily-agent-reset] Running at UTC hour ${currentUtcHour}, date ${todayUtc}`);

    // Find timezones where it's currently midnight (0:00)
    const timezonesToReset: string[] = [];
    for (const [tz, midnightUtcHour] of Object.entries(TIMEZONE_MIDNIGHT_HOURS)) {
      // Account for DST by checking a range (this is approximate)
      if (currentUtcHour === midnightUtcHour || currentUtcHour === midnightUtcHour - 1) {
        timezonesToReset.push(tz);
      }
    }

    if (timezonesToReset.length === 0) {
      console.log(`[daily-agent-reset] No timezones at midnight for UTC hour ${currentUtcHour}`);
      return new Response(
        JSON.stringify({ message: "No timezones to reset", utcHour: currentUtcHour }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[daily-agent-reset] Resetting for timezones: ${timezonesToReset.join(", ")}`);

    // Get all agents in those timezones (or default timezone if not set)
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id, timezone")
      .or(`timezone.in.(${timezonesToReset.join(",")}),timezone.is.null`);

    if (profilesError) {
      console.error("[daily-agent-reset] Error fetching profiles:", profilesError);
      throw profilesError;
    }

    if (!profiles || profiles.length === 0) {
      console.log("[daily-agent-reset] No agents found for reset");
      return new Response(
        JSON.stringify({ message: "No agents to reset", timezones: timezonesToReset }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get agency membership for each agent
    const agentIds = profiles.map((p) => p.id);
    const { data: members, error: membersError } = await supabase
      .from("agency_members")
      .select("user_id, agency_id")
      .in("user_id", agentIds);

    if (membersError) {
      console.error("[daily-agent-reset] Error fetching members:", membersError);
      throw membersError;
    }

    // Create a map of agent_id -> agency_id
    const agentAgencyMap = new Map<string, string>();
    for (const m of members || []) {
      agentAgencyMap.set(m.user_id, m.agency_id);
    }

    // Check existing daily states to ensure idempotency
    const { data: existingStates, error: statesError } = await supabase
      .from("agent_daily_state")
      .select("agent_id, local_date, reset_at")
      .in("agent_id", agentIds);

    if (statesError) {
      console.error("[daily-agent-reset] Error fetching existing states:", statesError);
    }

    // Create a map of agent_id -> latest state info
    const existingStateMap = new Map<string, { local_date: string; reset_at: string | null }>();
    for (const state of existingStates || []) {
      existingStateMap.set(state.agent_id, { local_date: state.local_date, reset_at: state.reset_at });
    }

    // Reset daily state for each agent
    let resetCount = 0;
    let skippedCount = 0;
    const errors: string[] = [];

    for (const profile of profiles) {
      const agencyId = agentAgencyMap.get(profile.id);
      if (!agencyId) {
        console.log(`[daily-agent-reset] Skipping agent ${profile.id} - no agency`);
        continue;
      }

      const timezone = profile.timezone || "America/New_York";
      
      // Only reset if this timezone is actually at midnight
      if (!timezonesToReset.includes(timezone) && profile.timezone !== null) {
        continue;
      }

      // Calculate the agent's local date
      const localDate = new Date(now.toLocaleString("en-US", { timeZone: timezone }));
      const localDateStr = localDate.toISOString().split("T")[0];

      // Idempotency check: skip if already reset today
      const existingState = existingStateMap.get(profile.id);
      if (existingState && existingState.local_date === localDateStr && existingState.reset_at) {
        const resetAtDate = new Date(existingState.reset_at);
        const resetAtLocalDate = resetAtDate.toISOString().split("T")[0];
        if (resetAtLocalDate === todayUtc || resetAtLocalDate === localDateStr) {
          console.log(`[daily-agent-reset] Skipping agent ${profile.id} - already reset today`);
          skippedCount++;
          continue;
        }
      }

      try {
        // Call the database function to reset
        const { error: resetError } = await supabase.rpc("reset_agent_daily_state", {
          _agent_id: profile.id,
          _agency_id: agencyId,
          _timezone: timezone,
        });

        if (resetError) {
          console.error(`[daily-agent-reset] Error resetting agent ${profile.id}:`, resetError);
          errors.push(`${profile.id}: ${resetError.message}`);
        } else {
          resetCount++;
          console.log(`[daily-agent-reset] Reset agent ${profile.id} (${timezone})`);
        }
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error(`[daily-agent-reset] Exception for agent ${profile.id}:`, err);
        errors.push(`${profile.id}: ${errMsg}`);
      }
    }

    const result = {
      message: `Reset ${resetCount} agents, skipped ${skippedCount} (already reset)`,
      timezones: timezonesToReset,
      resetCount,
      skippedCount,
      errors: errors.length > 0 ? errors : undefined,
      timestamp: now.toISOString(),
      idempotent: true,
    };

    console.log("[daily-agent-reset] Complete:", result);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error("[daily-agent-reset] Error:", error);
    return new Response(
      JSON.stringify({ error: errMsg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
