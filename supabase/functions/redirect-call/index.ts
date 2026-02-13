import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  console.log("=== REDIRECT-CALL WEBHOOK TOOL ===");

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const TWILIO_SID = Deno.env.get("TWILIO_SID");
  const TWILIO_TOKEN = Deno.env.get("TWILIO_TOKEN");

  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error("Missing Supabase env vars");
    return new Response(JSON.stringify({ error: "Server config error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!TWILIO_SID || !TWILIO_TOKEN) {
    console.error("Missing Twilio credentials");
    return new Response(JSON.stringify({ error: "Twilio not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    const body = await req.json();
    console.log("Redirect request body:", JSON.stringify(body));

    // ElevenLabs webhook tool sends parameters in different formats
    const callSid = body.call_sid || body.callSid || body.twilio_call_sid;
    const agentNumber = body.agent_number || body.agentNumber || body.to;
    const callerPhone = body.caller_phone || body.callerPhone || body.from || body.external_number;
    const callerName = body.caller_name || body.callerName || null;
    const reason = body.reason || "Caller requested to speak with dispatch";

    console.log("Parsed params:", { callSid, agentNumber, callerPhone, callerName, reason });

    if (!callSid) {
      console.error("No call_sid provided — cannot redirect without an active Twilio call SID");
      return new Response(JSON.stringify({
        success: false,
        error: "No call_sid provided. Cannot redirect the call without the active Twilio Call SID.",
        message: "I wasn't able to transfer the call. Let me get your number and have dispatch call you back."
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 1: Look up the agency by agent_number to find the dispatch number
    let agencyId: string | null = null;
    let dispatchNumber: string | null = null;

    if (agentNumber && agentNumber.length > 5) {
      const phoneVariants = [
        agentNumber,
        agentNumber.replace(/^\+1/, ""),
        agentNumber.replace(/^\+/, ""),
        `+1${agentNumber.replace(/^\+?1?/, "")}`,
      ];

      // Find the agency this agent number belongs to
      const { data: phoneMatch } = await supabase
        .from("agency_phone_numbers")
        .select("agency_id, phone_number")
        .in("phone_number", phoneVariants)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();

      if (phoneMatch) {
        agencyId = phoneMatch.agency_id;
        console.log("Matched agency:", agencyId);

        // Get the agency's primary contact or a different phone number for dispatch
        // Strategy: use the agency's main_contact or the first OTHER active phone number
        const { data: agency } = await supabase
          .from("agencies")
          .select("main_contact_name, main_contact_email")
          .eq("id", agencyId)
          .single();

        // Find a dispatch number — prefer a number labeled as dispatch, 
        // otherwise use any other active number that ISN'T the AI agent number
        const { data: dispatchNumbers } = await supabase
          .from("agency_phone_numbers")
          .select("phone_number, label")
          .eq("agency_id", agencyId)
          .eq("is_active", true)
          .not("phone_number", "in", `(${phoneVariants.join(",")})`)
          .order("created_at", { ascending: true });

        if (dispatchNumbers && dispatchNumbers.length > 0) {
          // Prefer a number labeled "dispatch" or "main"
          const dispatchLabeled = dispatchNumbers.find(
            (n) => n.label && /dispatch|main|office|forward/i.test(n.label)
          );
          dispatchNumber = dispatchLabeled?.phone_number || dispatchNumbers[0].phone_number;
          console.log("Found dispatch number:", dispatchNumber, "label:", dispatchLabeled?.label || "default");
        }

        console.log("Agency info:", agency?.main_contact_name);
      }
    }

    // Fallback: use get_primary_agency_id if no match
    if (!agencyId) {
      const { data: fallbackAgency } = await supabase
        .from("agencies")
        .select("id")
        .limit(1)
        .maybeSingle();
      agencyId = fallbackAgency?.id || null;

      if (agencyId) {
        const { data: fallbackNumbers } = await supabase
          .from("agency_phone_numbers")
          .select("phone_number, label")
          .eq("agency_id", agencyId)
          .eq("is_active", true)
          .order("created_at", { ascending: true })
          .limit(5);

        if (fallbackNumbers && fallbackNumbers.length > 0) {
          const dispatchLabeled = fallbackNumbers.find(
            (n) => n.label && /dispatch|main|office|forward/i.test(n.label)
          );
          dispatchNumber = dispatchLabeled?.phone_number || fallbackNumbers[0].phone_number;
        }
      }
    }

    if (!dispatchNumber) {
      console.error("No dispatch number found for agency:", agencyId);
      return new Response(JSON.stringify({
        success: false,
        error: "No dispatch number configured for this agency.",
        message: "I can't transfer right now, but let me get your number and have someone call you back."
      }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 2: Use Twilio to redirect the active call
    // We update the call with TwiML that dials the dispatch number
    console.log(`Redirecting call ${callSid} to dispatch: ${dispatchNumber}`);

    // Normalize dispatch number to E.164
    let normalizedDispatch = dispatchNumber;
    if (!normalizedDispatch.startsWith("+")) {
      normalizedDispatch = `+1${normalizedDispatch.replace(/\D/g, "")}`;
    }

    // Build TwiML to connect caller to dispatch
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Please hold while I connect you to dispatch.</Say>
  <Dial callerId="${agentNumber || normalizedDispatch}" timeout="30" action="${SUPABASE_URL}/functions/v1/redirect-call-status">
    <Number>${normalizedDispatch}</Number>
  </Dial>
  <Say voice="alice">We were unable to connect you. A dispatcher will call you back shortly.</Say>
</Response>`;

    console.log("TwiML:", twiml);

    // Call Twilio API to update the active call
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Calls/${callSid}.json`;
    const twilioAuth = btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`);

    const formData = new URLSearchParams();
    formData.append("Twiml", twiml);

    const twilioResponse = await fetch(twilioUrl, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${twilioAuth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formData.toString(),
    });

    const twilioResult = await twilioResponse.text();
    console.log("Twilio response status:", twilioResponse.status);
    console.log("Twilio response:", twilioResult.slice(0, 500));

    if (!twilioResponse.ok) {
      console.error("Twilio redirect failed:", twilioResult);

      // Log the failure for debugging
      await supabase.from("system_health_events").insert({
        service_name: "redirect_call",
        status: "fail",
        error_message: `Twilio ${twilioResponse.status}: ${twilioResult.slice(0, 200)}`,
        metadata: { call_sid: callSid, dispatch_number: normalizedDispatch },
      });

      return new Response(JSON.stringify({
        success: false,
        error: `Twilio error: ${twilioResponse.status}`,
        message: "The transfer didn't go through. Let me get your number and have dispatch call you right back."
      }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 3: Log the redirect event
    console.log("✅ Call redirected successfully to:", normalizedDispatch);

    // Log health event
    await supabase.from("system_health_events").insert({
      service_name: "redirect_call",
      status: "ok",
      metadata: {
        call_sid: callSid,
        agent_number: agentNumber,
        dispatch_number: normalizedDispatch,
        caller_phone: callerPhone,
        caller_name: callerName,
        reason,
        agency_id: agencyId,
      },
    });

    // Return success to ElevenLabs — the agent will hear this as the tool response
    return new Response(JSON.stringify({
      success: true,
      message: `Call successfully transferred to dispatch at ${normalizedDispatch}. The caller is being connected now.`,
      dispatch_number: normalizedDispatch,
      call_sid: callSid,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("Redirect-call error:", err);

    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (supabaseUrl && serviceKey) {
        const sb = createClient(supabaseUrl, serviceKey);
        await sb.from("system_health_events").insert({
          service_name: "redirect_call",
          status: "fail",
          error_message: String(err),
        });
      }
    } catch (logErr) {
      console.error("Failed to log health event:", logErr);
    }

    return new Response(JSON.stringify({
      success: false,
      error: String(err),
      message: "Something went wrong with the transfer. Let me get your number so dispatch can call you back."
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
