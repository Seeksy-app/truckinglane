import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  console.log("=== BACKFILL ELEVENLABS CALLS ===");

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!SUPABASE_URL || !SERVICE_KEY || !ELEVENLABS_API_KEY) {
      console.error("Missing env vars");
      return new Response(
        JSON.stringify({ error: "Server configuration error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // Parse request body for optional parameters
    let daysBack = 7;
    let agentId: string | null = null;
    
    try {
      const body = await req.json();
      if (body.days_back) daysBack = parseInt(body.days_back);
      if (body.agent_id) agentId = body.agent_id;
    } catch {
      // Use defaults
    }

    // Calculate timestamp for X days ago
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);
    const callStartAfterUnix = Math.floor(startDate.getTime() / 1000);

    console.log(`Fetching calls from last ${daysBack} days (after ${startDate.toISOString()})`);

    // Fetch conversations list from ElevenLabs
    let allConversations: any[] = [];
    let cursor: string | null = null;
    let hasMore = true;

    while (hasMore) {
      const params = new URLSearchParams({
        call_start_after_unix: callStartAfterUnix.toString(),
        page_size: "100",
        summary_mode: "include",
      });
      
      if (agentId) params.append("agent_id", agentId);
      if (cursor) params.append("cursor", cursor);

      const listUrl = `https://api.elevenlabs.io/v1/convai/conversations?${params}`;
      console.log(`Fetching: ${listUrl}`);

      const listResponse = await fetch(listUrl, {
        headers: { "xi-api-key": ELEVENLABS_API_KEY },
      });

      if (!listResponse.ok) {
        const errorText = await listResponse.text();
        console.error("ElevenLabs API error:", listResponse.status, errorText);
        throw new Error(`ElevenLabs API error: ${listResponse.status}`);
      }

      const listData = await listResponse.json();
      allConversations = allConversations.concat(listData.conversations || []);
      hasMore = listData.has_more || false;
      cursor = listData.next_cursor || null;
      
      console.log(`Fetched ${listData.conversations?.length || 0} conversations, has_more: ${hasMore}`);
    }

    console.log(`Total conversations found: ${allConversations.length}`);

    // Get the first agency for linking (fallback)
    const { data: defaultAgency } = await supabase
      .from("agencies")
      .select("id")
      .limit(1)
      .single();

    const defaultAgencyId = defaultAgency?.id;

    let processed = 0;
    let skipped = 0;
    let errors = 0;
    let updated = 0;
    let leadsCreated = 0;

    for (const conv of allConversations) {
      try {
        const conversationId = conv.conversation_id;
        
        // Check if already exists
        const { data: existing } = await supabase
          .from("elevenlabs_post_calls")
          .select("id, transcript_summary, agency_id")
          .eq("conversation_id", conversationId)
          .maybeSingle();

        // If exists WITH summary, skip entirely
        if (existing && existing.transcript_summary) {
          console.log(`Skipping ${conversationId} - already has summary`);
          skipped++;
          continue;
        }
        
        // If exists but NO summary, we'll update it below
        const needsUpdate = existing && !existing.transcript_summary;

        // Fetch full conversation details
        const detailUrl = `https://api.elevenlabs.io/v1/convai/conversations/${conversationId}`;
        const detailResponse = await fetch(detailUrl, {
          headers: { "xi-api-key": ELEVENLABS_API_KEY },
        });

        if (!detailResponse.ok) {
          console.error(`Failed to fetch details for ${conversationId}`);
          errors++;
          continue;
        }

        const detail = await detailResponse.json();
        const metadata = detail.metadata || {};

        // Build transcript text from messages
        let transcriptText = "";
        if (detail.transcript && Array.isArray(detail.transcript)) {
          transcriptText = detail.transcript
            .map((t: any) => `${t.role}: ${t.message}`)
            .join("\n");
        }

        // Extract phone numbers - check multiple locations
        const callerPhone = metadata.caller_id || 
                           metadata.customer_number || 
                           metadata.external_number ||
                           detail.phone_call?.external_number ||
                           conv.call_id || 
                           "unknown";
        const receiverPhone = metadata.agent_number || 
                             metadata.called_number || 
                             detail.phone_call?.agent_number ||
                             "unknown";

        // Look up agency by receiver phone
        let agencyId = existing?.agency_id || null;
        if (!agencyId && receiverPhone && receiverPhone !== "unknown" && receiverPhone.length > 5) {
          const phoneVariants = [
            receiverPhone,
            receiverPhone.replace(/^\+1/, ""),
            receiverPhone.replace(/^\+/, ""),
            `+1${receiverPhone.replace(/^\+?1?/, "")}`,
          ];
          
          const { data: phoneMatch } = await supabase
            .from("agency_phone_numbers")
            .select("agency_id")
            .in("phone_number", phoneVariants)
            .eq("is_active", true)
            .limit(1)
            .maybeSingle();
          
          if (phoneMatch) {
            agencyId = phoneMatch.agency_id;
          }
        }
        
        // Fallback to default agency
        if (!agencyId) {
          agencyId = defaultAgencyId;
        }

        // Get summary from ElevenLabs or generate with AI
        let summary = conv.transcript_summary || detail.analysis?.transcript_summary;
        let summaryTitle = detail.analysis?.call_summary_title;
        let outcome = detail.analysis?.call_outcome || null;

        // If no summary from ElevenLabs and we have transcript, use AI to generate
        if (!summary && transcriptText && transcriptText.length > 20 && LOVABLE_API_KEY) {
          try {
            console.log(`Generating AI summary for ${conversationId}...`);
            const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${LOVABLE_API_KEY}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: "google/gemini-2.5-flash",
                messages: [
                  {
                    role: "system",
                    content: `You are analyzing a trucking/logistics phone call transcript. Extract:
1. summary: 1-2 sentence summary of the call
2. title: 3-5 word title for the call (e.g., "Load booking confirmation", "Rate inquiry")
3. outcome: "booked", "callback_requested", "declined", "no_action", or "unknown"

Respond ONLY with valid JSON: {"summary":"...", "title":"...", "outcome":"..."}`
                  },
                  {
                    role: "user",
                    content: `Analyze this call transcript:\n\n${transcriptText.slice(0, 3000)}`
                  }
                ],
              }),
            });

            if (aiResponse.ok) {
              const aiData = await aiResponse.json();
              const content = aiData.choices?.[0]?.message?.content || "";
              const jsonMatch = content.match(/\{[\s\S]*\}/);
              if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                summary = parsed.summary || null;
                summaryTitle = parsed.title || parsed.outcome || null;
                outcome = parsed.outcome || null;
                console.log(`AI generated summary for ${conversationId}:`, summary);
              }
            }
          } catch (aiErr) {
            console.error("AI summary generation error:", aiErr);
          }
        }

        // Handle update vs insert for elevenlabs_post_calls
        if (needsUpdate) {
          // Update existing record with summary
          await supabase.from("elevenlabs_post_calls")
            .update({
              transcript_summary: summary,
              call_summary_title: summaryTitle,
              agency_id: agencyId,
            })
            .eq("id", existing.id);
          updated++;
          console.log(`Updated ${conversationId} with summary`);
        } else {
          // Insert new record
          await supabase.from("elevenlabs_post_calls").insert({
            conversation_id: conversationId,
            agent_id: conv.agent_id,
            external_number: callerPhone,
            agent_number: receiverPhone,
            call_duration_secs: metadata.call_duration_secs || conv.call_duration_secs,
            event_timestamp: metadata.start_time_unix_secs,
            status: detail.status,
            termination_reason: metadata.termination_reason,
            transcript_summary: summary,
            call_summary_title: summaryTitle,
            agency_id: agencyId,
            payload: detail,
          });
        }

        // 2. Create or update phone_call record
        const { data: phoneCall, error: phoneError } = await supabase
          .from("phone_calls")
          .upsert({
            elevenlabs_call_id: conversationId,
            caller_phone: callerPhone,
            receiver_phone: receiverPhone,
            agency_id: agencyId,
            call_status: "completed",
            duration_seconds: metadata.call_duration_secs || conv.call_duration_secs,
            call_started_at: metadata.start_time_unix_secs 
              ? new Date(metadata.start_time_unix_secs * 1000).toISOString() 
              : new Date(conv.start_time_unix_secs * 1000).toISOString(),
          }, {
            onConflict: "elevenlabs_call_id",
          })
          .select()
          .single();

        let phoneCallId = phoneCall?.id;
        
        if (phoneError) {
          console.error("Phone call error:", phoneError);
          // Try insert without upsert
          const { data: newCall } = await supabase
            .from("phone_calls")
            .insert({
              elevenlabs_call_id: conversationId,
              caller_phone: callerPhone,
              receiver_phone: receiverPhone,
              agency_id: agencyId,
              call_status: "completed",
              duration_seconds: metadata.call_duration_secs,
            })
            .select()
            .single();
          
          phoneCallId = newCall?.id;
        }

        // 3. Create conversation record
        if (phoneCallId) {
          await supabase.from("conversations").upsert({
            phone_call_id: phoneCallId,
            elevenlabs_call_id: conversationId,
            transcript: transcriptText,
            summary: summary,
            raw_payload: detail,
          }, {
            onConflict: "elevenlabs_call_id",
            ignoreDuplicates: false,
          });
        }

        // 4. CREATE LEAD if valid phone number and no existing lead
        const hasValidPhone = callerPhone && callerPhone !== "unknown" && callerPhone.length > 5;
        
        if (hasValidPhone && phoneCallId && agencyId) {
          // Check if lead already exists for this phone call
          const { data: existingLead } = await supabase
            .from("leads")
            .select("id")
            .eq("phone_call_id", phoneCallId)
            .maybeSingle();
          
          if (!existingLead) {
            // Calculate intent score
            const callDuration = metadata.call_duration_secs || conv.call_duration_secs || 0;
            let intentScore = 5;
            const isHighIntentCall = outcome === "callback_requested" || 
                                     outcome === "booked" ||
                                     callDuration > 30;
            
            if (outcome === "booked") intentScore = 10;
            else if (outcome === "callback_requested") intentScore = 8;
            else if (callDuration > 30) intentScore = 6;

            const { data: newLead, error: leadError } = await supabase
              .from("leads")
              .insert({
                agency_id: agencyId,
                caller_phone: callerPhone,
                phone_call_id: phoneCallId,
                status: "pending",
                intent_score: intentScore,
                is_high_intent: isHighIntentCall,
                notes: summary ? `[AI SUMMARY] ${summary}` : null,
              })
              .select()
              .single();

            if (leadError) {
              console.error("Failed to create lead:", leadError);
            } else {
              leadsCreated++;
              console.log(`Created lead ${newLead?.id} for call ${conversationId}`);
            }
          }
        }

        if (!needsUpdate) {
          processed++;
          console.log(`Processed ${conversationId}`);
        }

        // Small delay to avoid rate limiting
        await new Promise(r => setTimeout(r, 150));

      } catch (err) {
        console.error(`Error processing conversation:`, err);
        errors++;
      }
    }

    const result = {
      success: true,
      total_found: allConversations.length,
      processed,
      updated,
      skipped,
      errors,
      leads_created: leadsCreated,
      days_back: daysBack,
    };

    console.log("Backfill complete:", result);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("Backfill error:", err);
    return new Response(
      JSON.stringify({ error: "Backfill failed", details: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
