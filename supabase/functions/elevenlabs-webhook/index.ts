import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  console.log("=== ELEVENLABS WEBHOOK ===");

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error("Missing env vars");
    return new Response(JSON.stringify({ error: "Server config error" }), { 
      status: 500, 
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    const payload = await req.json();
    console.log("Webhook payload:", JSON.stringify(payload).slice(0, 500));

    // Extract event type - ElevenLabs uses different structures
    const eventType = payload.type || payload.event_type || payload.event || "unknown";
    const status = payload.status || eventType;
    console.log("Event type:", eventType, "Status:", status);

    // Extract phone numbers early for initial insert - check all possible locations
    const data = payload.data || payload;
    const metadata = payload.metadata || data.metadata || {};
    const phoneCallMeta = metadata.phone_call || {};
    const extractedExternalNumber = phoneCallMeta.external_number || 
                                    data.external_number || 
                                    payload.external_number || 
                                    payload.from || 
                                    payload.caller_phone || 
                                    "unknown";
    const extractedAgentNumber = phoneCallMeta.agent_number || 
                                 data.agent_number || 
                                 payload.agent_number || 
                                 payload.to || 
                                 "";
    const extractedConversationId = data.conversation_id || payload.conversation_id || payload.call_id;
    const extractedCallSid = phoneCallMeta.call_sid || data.call_sid || payload.call_sid || payload.twilio_call_sid;
    
    // Extract analysis data
    const analysis = data.analysis || payload.analysis || {};
    const extractedSummary = analysis.transcript_summary || 
                             data.transcript_summary || data.summary || 
                             payload.transcript_summary || payload.summary || null;
    const extractedSummaryTitle = analysis.call_summary_title || 
                                  data.call_summary_title || 
                                  payload.call_summary_title || null;
    const extractedTerminationReason = data.termination_reason || 
                                       payload.termination_reason || null;
    const extractedDuration = data.call_duration_secs || payload.call_duration_secs || 
                              data.duration || payload.duration || null;

    // Look up agency BEFORE insert so we can store it
    let agencyId: string | null = null;
    if (extractedAgentNumber && extractedAgentNumber !== "unknown" && extractedAgentNumber.length > 5) {
      const phoneVariants = [
        extractedAgentNumber,
        extractedAgentNumber.replace(/^\+1/, ""),
        extractedAgentNumber.replace(/^\+/, ""),
        `+1${extractedAgentNumber.replace(/^\+?1?/, "")}`,
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
        console.log("Matched agency by phone for insert:", agencyId);
      }
    }
    
    // Fallback to first agency if no phone match
    if (!agencyId) {
      const { data: fallbackAgency } = await supabase
        .from("agencies")
        .select("id")
        .limit(1)
        .maybeSingle();
      agencyId = fallbackAgency?.id || null;
    }

    // Store raw payload in elevenlabs_post_calls with properly extracted data
    const { data: postCall, error: postCallError } = await supabase
      .from("elevenlabs_post_calls")
      .insert({
        payload: payload,
        event_timestamp: payload.timestamp || Date.now(),
        conversation_id: extractedConversationId,
        call_sid: extractedCallSid,
        agent_id: data.agent_id || payload.agent_id,
        agent_number: extractedAgentNumber,
        external_number: extractedExternalNumber,
        direction: payload.direction || "inbound",
        status: status,
        termination_reason: extractedTerminationReason,
        call_duration_secs: extractedDuration,
        transcript_summary: extractedSummary,
        call_summary_title: extractedSummaryTitle,
        agency_id: agencyId,
      })
      .select()
      .single();

    if (postCallError) {
      console.error("Error storing post_call:", postCallError);
    } else {
      console.log("Stored post_call:", postCall?.id, "agency:", agencyId);
    }

    // Handle transcription completed, call ended, or done events - process ALL events that have phone data
    const shouldProcessCall = eventType.includes("transcription") || 
                              eventType.includes("call") || 
                              eventType === "post_call_transcription" ||
                              status === "done" ||
                              (extractedExternalNumber && extractedExternalNumber !== "unknown");
    
    if (shouldProcessCall) {
      // Parse transcript - can be a string or an array of {role, message} objects
      let transcript = "";
      if (typeof data.transcript === "string") {
        transcript = data.transcript;
      } else if (Array.isArray(data.transcript)) {
        // Convert array format to readable string
        transcript = data.transcript
          .filter((t: { role?: string; message?: string }) => t.message)
          .map((t: { role?: string; message?: string }) => `${t.role || 'unknown'}: ${t.message}`)
          .join("\n");
      }
      
      // Fallback to other transcript fields
      if (!transcript) {
        transcript = payload.transcript || payload.transcription || payload.text || "";
      }
      
      // Use already-extracted values from above
      const callerPhone = extractedExternalNumber;
      const receiverPhone = extractedAgentNumber;
      const callId = extractedConversationId;
      const payloadSummary = extractedSummary;
      const payloadSummaryTitle = extractedSummaryTitle;
      const payloadTerminationReason = extractedTerminationReason;
      const payloadCallSuccessful = analysis.call_successful || null;
      
      // Extract recording URL - ElevenLabs provides this in various places
      const recordingUrl = data.recording_url || 
                          payload.recording_url || 
                          payload.recording?.url || 
                          data.recording?.url ||
                          payload.audio_url ||
                          data.audio_url ||
                          payload.analysis?.recording_url ||
                          null;
      
      console.log("Parsed transcript length:", transcript.length);
      console.log("Recording URL:", recordingUrl);
      console.log("Transcript summary from payload:", payloadSummary);
      console.log("Caller phone:", callerPhone);
      console.log("Call ID:", callId);

      if (!transcript && (!callerPhone || callerPhone === "unknown")) {
        console.log("No transcript or caller info, skipping conversation creation");
        return new Response(JSON.stringify({ success: true, message: "Event logged" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // Use already-resolved agency from above
      const agency = agencyId ? { id: agencyId } : null;

      if (!agency) {
        console.error("No agency found");
        return new Response(JSON.stringify({ error: "No agency" }), { 
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      
      console.log("Using agency:", agency.id);


      // Create or update phone_call record
      let phoneCall;
      if (callId) {
        // Check if phone_call exists
        const { data: existing } = await supabase
          .from("phone_calls")
          .select("id")
          .eq("elevenlabs_call_id", callId)
          .maybeSingle();

        if (existing) {
          const { data: updated } = await supabase
            .from("phone_calls")
            .update({
              call_status: "completed",
              duration_seconds: payload.call_duration_secs || payload.duration,
              call_ended_at: new Date().toISOString(),
            })
            .eq("id", existing.id)
            .select()
            .single();
          phoneCall = updated;
        } else {
          const { data: created } = await supabase
            .from("phone_calls")
            .insert({
              agency_id: agency.id,
              caller_phone: callerPhone || "+10000000000",
              receiver_phone: receiverPhone || "+10000000000",
              elevenlabs_call_id: callId,
              call_status: "completed",
              duration_seconds: payload.call_duration_secs,
              call_started_at: new Date(Date.now() - (payload.call_duration_secs || 0) * 1000).toISOString(),
              call_ended_at: new Date().toISOString(),
            })
            .select()
            .single();
          phoneCall = created;
        }
      }

      if (!phoneCall) {
        // Create a new phone call if we don't have one
        const { data: created } = await supabase
          .from("phone_calls")
          .insert({
            agency_id: agency.id,
            caller_phone: callerPhone || "+10000000000",
            receiver_phone: receiverPhone || "+10000000000",
            elevenlabs_call_id: callId || `webhook-${Date.now()}`,
            call_status: "completed",
          })
          .select()
          .single();
        phoneCall = created;
      }

      console.log("Phone call:", phoneCall?.id);

      // Analyze transcript with AI if we have one
      let sentiment = null;
      let intent = payloadSummaryTitle || null; // Use ElevenLabs title as intent
      let outcome = null;
      let summary = payloadSummary; // Prefer ElevenLabs summary - it's more detailed
      let summaryTitle = payloadSummaryTitle;
      let callSuccessful = payloadCallSuccessful;
      let terminationReason = payloadTerminationReason;

      // Variables for carrier extraction
      let carrierUsdot = null;
      let carrierMc = null;
      let carrierName = null;
      let carrierStatus = null;
      
      // Shipper and equipment tags (for Aldelphia)
      let shipper: string | null = null;
      let equipmentType: string | null = null;
      
      // Check if agent provided tags in tool call results or metadata
      const toolCallResults = data.tool_call_results || payload.tool_call_results || [];
      const agentTags = data.tags || payload.tags || metadata.tags || {};
      
      // Extract from agent tags if present
      if (agentTags.shipper) shipper = agentTags.shipper;
      if (agentTags.equipment_type) equipmentType = agentTags.equipment_type;

      if (transcript && transcript.length > 20 && LOVABLE_API_KEY) {
        try {
          console.log("Analyzing transcript with AI...");
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
1. sentiment: "positive", "neutral", or "negative" based on caller's tone and engagement
2. intent: Brief description of what the caller wanted (e.g., "rate quote", "book load", "speak to dispatch", "general inquiry")
3. outcome: "booked", "callback_requested", "declined", "no_action", or "unknown"
4. summary: 1-2 sentence summary of the call
5. carrier_usdot: If a DOT number is mentioned (e.g., "DOT 123456", "my DOT is 1234567"), extract just the number. Otherwise null.
6. carrier_mc: If an MC number is mentioned (e.g., "MC 987654", "our MC is 123456"), extract just the number. Otherwise null.
7. carrier_name: If a company/carrier name is mentioned, extract it. Otherwise null.
8. shipper: If the conversation mentions "Aldelphia" as the shipper/source, return "Aldelphia". Otherwise null.
9. equipment_type: If equipment/truck type is discussed:
   - Return "flatbed" if flatbed truck is mentioned
   - Return "not_flatbed" if hot shot, sprinter, van, or box truck is mentioned
   - Otherwise null

Respond ONLY with valid JSON: {"sentiment":"...", "intent":"...", "outcome":"...", "summary":"...", "carrier_usdot":null|"string", "carrier_mc":null|"string", "carrier_name":null|"string", "shipper":null|"string", "equipment_type":null|"string"}`
              },
                {
                  role: "user",
                  content: `Analyze this call transcript:\n\n${transcript.slice(0, 3000)}`
                }
              ],
            }),
          });

          if (aiResponse.ok) {
            const aiData = await aiResponse.json();
            const content = aiData.choices?.[0]?.message?.content || "";
            console.log("AI response:", content);
            
            try {
              // Extract JSON from response
              const jsonMatch = content.match(/\{[\s\S]*\}/);
              if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                sentiment = parsed.sentiment || null;
                intent = intent || parsed.intent || null; // Prefer ElevenLabs title
                outcome = parsed.outcome || null;
                // Only use AI summary if ElevenLabs didn't provide one
                if (!summary) {
                  summary = parsed.summary || null;
                }
                carrierUsdot = parsed.carrier_usdot || null;
                carrierMc = parsed.carrier_mc || null;
                carrierName = parsed.carrier_name || null;
                // Extract shipper and equipment tags if not already set
                if (!shipper) shipper = parsed.shipper || null;
                if (!equipmentType) equipmentType = parsed.equipment_type || null;
                console.log("Parsed AI analysis:", { sentiment, intent, outcome, carrierUsdot, carrierMc, carrierName });
              }
            } catch (parseErr) {
              console.error("Failed to parse AI response:", parseErr);
            }
          } else {
            console.error("AI request failed:", await aiResponse.text());
          }
        } catch (aiErr) {
          console.error("AI analysis error:", aiErr);
        }
      }

      // ============================================
      // HIGH-INTENT KEYWORD MATCHING
      // ============================================
      // Check transcript against active keywords from high_intent_keywords table
      // If matched: boost intent_score to at least 85%, set is_high_intent=true
      // ============================================
      let keywordMatchResult: {
        matched: boolean;
        keywordId: string | null;
        keyword: string | null;
        matchType: string | null;
        weight: number;
      } = { matched: false, keywordId: null, keyword: null, matchType: null, weight: 0.85 };

      if (transcript && transcript.length > 10 && agencyId) {
        try {
          console.log("Checking transcript against high-intent keywords...");
          
          // Fetch active, non-expired keywords for this agency
          const { data: activeKeywords, error: kwError } = await supabase
            .from("high_intent_keywords")
            .select("id, keyword, match_type, case_sensitive, weight, scope, agent_id")
            .eq("agency_id", agencyId)
            .eq("active", true)
            .gt("expires_at", new Date().toISOString());

          if (kwError) {
            console.error("Failed to fetch keywords:", kwError);
          } else if (activeKeywords && activeKeywords.length > 0) {
            console.log(`Checking ${activeKeywords.length} active keywords...`);
            
            // Check each keyword against transcript
            for (const kw of activeKeywords) {
              const matchType = kw.match_type || "contains";
              const caseSensitive = kw.case_sensitive || false;
              const weight = kw.weight || 0.85;
              
              const textToSearch = caseSensitive ? transcript : transcript.toLowerCase();
              const keywordToMatch = caseSensitive ? kw.keyword : kw.keyword.toLowerCase();
              
              let matched = false;
              
              try {
                if (matchType === "contains") {
                  // Substring match
                  matched = textToSearch.includes(keywordToMatch);
                } else if (matchType === "exact") {
                  // Word boundary exact match
                  const wordBoundaryRegex = new RegExp(`\\b${keywordToMatch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, caseSensitive ? '' : 'i');
                  matched = wordBoundaryRegex.test(transcript);
                } else if (matchType === "regex") {
                  // Regex match with try/catch for invalid patterns
                  try {
                    const regex = new RegExp(kw.keyword, caseSensitive ? '' : 'i');
                    matched = regex.test(transcript);
                  } catch (regexErr) {
                    console.warn(`Invalid regex pattern: ${kw.keyword}`, regexErr);
                  }
                }
              } catch (matchErr) {
                console.warn(`Error matching keyword ${kw.keyword}:`, matchErr);
              }

              if (matched) {
                console.log(`✅ Keyword matched: "${kw.keyword}" (${matchType}, weight: ${weight})`);
                keywordMatchResult = {
                  matched: true,
                  keywordId: kw.id,
                  keyword: kw.keyword,
                  matchType: matchType,
                  weight: weight,
                };
                
                // Record the match in keyword_match_events
                await supabase
                  .from("keyword_match_events")
                  .insert({
                    agency_id: agencyId,
                    keyword_id: kw.id,
                    source: "webhook_transcript",
                    matched_text: kw.keyword,
                  });
                
                break; // Stop at first match (prioritize)
              }
            }
          }
        } catch (kwErr) {
          console.error("Keyword matching error:", kwErr);
        }
      }

      // If we have a DOT or MC, try to look up carrier status
      if (carrierUsdot || carrierMc) {
        try {
          // Check carrier_intelligence table first
          const dotToCheck = carrierUsdot || carrierMc;
          const { data: existingCarrier } = await supabase
            .from("carrier_intelligence")
            .select("usdot, carrier_name, fmcsa_data")
            .eq("usdot", dotToCheck)
            .maybeSingle();

          if (existingCarrier && existingCarrier.fmcsa_data) {
            const fmcsa = existingCarrier.fmcsa_data as { authority_status?: string; insurance_status?: string };
            const authorityOk = fmcsa.authority_status === "ACTIVE";
            const insuranceOk = fmcsa.insurance_status === "ACTIVE";
            carrierName = existingCarrier.carrier_name || carrierName;
            
            if (authorityOk && insuranceOk) {
              carrierStatus = `✅ ${carrierName || 'Carrier'} (DOT ${dotToCheck}) - VERIFIED ACTIVE & INSURED`;
            } else {
              const issues = [];
              if (!authorityOk) issues.push("Authority: " + (fmcsa.authority_status || "UNKNOWN"));
              if (!insuranceOk) issues.push("Insurance: " + (fmcsa.insurance_status || "UNKNOWN"));
              carrierStatus = `⚠️ ${carrierName || 'Carrier'} (DOT ${dotToCheck}) - ${issues.join(", ")}`;
            }
            console.log("Carrier status from cache:", carrierStatus);
          } else {
            // No cached data, just note the DOT/MC for reference
            carrierStatus = `📋 Carrier mentioned: ${carrierName || ''} ${carrierUsdot ? 'DOT ' + carrierUsdot : ''} ${carrierMc ? 'MC ' + carrierMc : ''} - Status pending lookup`;
          }
        } catch (carrierErr) {
          console.error("Carrier lookup error:", carrierErr);
        }
      }

      // Update phone_call with carrier_usdot if found
      if (phoneCall && carrierUsdot) {
        await supabase
          .from("phone_calls")
          .update({ carrier_usdot: carrierUsdot })
          .eq("id", phoneCall.id);
        console.log("Updated phone_call with carrier_usdot:", carrierUsdot);
      }

      // Create or update conversation
      const { data: existingConvo } = await supabase
        .from("conversations")
        .select("id")
        .eq("phone_call_id", phoneCall.id)
        .maybeSingle();

      let conversation;
      if (existingConvo) {
        const { data: updated } = await supabase
          .from("conversations")
          .update({
            transcript: transcript || undefined,
            summary: summary || undefined,
            sentiment: sentiment || undefined,
            intent: intent || undefined,
            outcome: outcome || undefined,
            recording_url: recordingUrl || undefined,
            elevenlabs_call_id: callId,
            raw_payload: payload,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existingConvo.id)
          .select()
          .single();
        conversation = updated;
      } else {
        const { data: created } = await supabase
          .from("conversations")
          .insert({
            phone_call_id: phoneCall.id,
            transcript: transcript,
            summary: summary,
            sentiment: sentiment,
            intent: intent,
            outcome: outcome,
            recording_url: recordingUrl,
            elevenlabs_call_id: callId,
            raw_payload: payload,
          })
          .select()
          .single();
        conversation = created;
      }

      console.log("Conversation:", conversation?.id, { sentiment, intent, outcome });

      // Update lead if exists for this call - try multiple matching strategies
      if (phoneCall.id) {
        // Strategy 1: Direct phone_call_id match
        let { data: lead } = await supabase
          .from("leads")
          .select("id")
          .eq("phone_call_id", phoneCall.id)
          .maybeSingle();
        
        // Strategy 2: Match by phone number if caller phone is valid (not "unknown")
        if (!lead && callerPhone && callerPhone !== "unknown" && callerPhone.length > 5) {
          const normalizedPhone = callerPhone.replace(/\D/g, "");
          const phoneVariants = [
            callerPhone,
            `+${normalizedPhone}`,
            `+1${normalizedPhone.slice(-10)}`,
            normalizedPhone.slice(-10),
          ];
          
          console.log("Trying phone match with variants:", phoneVariants);
          
          const { data: phoneLead } = await supabase
            .from("leads")
            .select("id")
            .in("caller_phone", phoneVariants)
            .is("phone_call_id", null)
            .eq("status", "pending")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          
          if (phoneLead) {
            lead = phoneLead;
            console.log("Matched lead by phone number:", lead.id);
            
            // Link the phone call to this lead
            await supabase
              .from("leads")
              .update({ phone_call_id: phoneCall.id })
              .eq("id", lead.id);
          }
        }
        
        // Strategy 3: Match by recent time (within 5 minutes) if still no match
        if (!lead) {
          const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
          const { data: recentLead } = await supabase
            .from("leads")
            .select("id, caller_phone")
            .is("phone_call_id", null)
            .eq("status", "pending")
            .gte("created_at", fiveMinutesAgo)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          
          if (recentLead) {
            lead = recentLead;
            console.log("Matched lead by recent time:", lead.id, "phone:", recentLead.caller_phone);
            
            // Link and update the phone call with the lead's phone
            await supabase
              .from("leads")
              .update({ phone_call_id: phoneCall.id })
              .eq("id", lead.id);
            
            // Update phone_call with the lead's actual phone number if we have "unknown"
            if (recentLead.caller_phone && (callerPhone === "unknown" || !callerPhone)) {
              await supabase
                .from("phone_calls")
                .update({ caller_phone: recentLead.caller_phone })
                .eq("id", phoneCall.id);
            }
          }
        }

        if (lead) {
          // Calculate intent score based on analysis
          let intentScore = 5; // Default neutral
          if (outcome === "booked") intentScore = 10;
          else if (outcome === "callback_requested") intentScore = 8;
          else if (carrierUsdot || carrierMc) intentScore = 9; // HIGH INTENT if they gave DOT/MC
          else if (sentiment === "positive") intentScore = 7;
          else if (outcome === "declined") intentScore = 2;
          else if (sentiment === "negative") intentScore = 3;

          // KEYWORD BOOST: If keyword matched, ensure score is at least 85% (8.5/10)
          if (keywordMatchResult.matched) {
            const keywordBoostScore = Math.round(keywordMatchResult.weight * 10); // 0.85 -> 8.5 -> 9
            intentScore = Math.max(intentScore, keywordBoostScore);
            console.log(`Keyword boost applied: score raised to ${intentScore}`);
          }

          // Mark as high intent if DOT/MC provided OR keyword matched
          const isHighIntent = intentScore >= 7 || !!carrierUsdot || !!carrierMc || keywordMatchResult.matched;

          // Build intent reason breakdown
          let intentReasonBreakdown: Record<string, unknown> | null = null;
          if (keywordMatchResult.matched) {
            intentReasonBreakdown = {
              keyword_match: {
                rule_id: keywordMatchResult.keywordId,
                keyword: keywordMatchResult.keyword,
                match_type: keywordMatchResult.matchType,
                matched_at: new Date().toISOString(),
              }
            };
          }

          // Build carrier info note if available
          let updatedNotes = null;
          if (carrierStatus) {
            updatedNotes = `[CARRIER STATUS]\n${carrierStatus}`;
            if (carrierName) updatedNotes += `\nCompany: ${carrierName}`;
            if (carrierUsdot) updatedNotes += `\nDOT: ${carrierUsdot}`;
            if (carrierMc) updatedNotes += `\nMC: ${carrierMc}`;
          }

          const updatePayload: Record<string, unknown> = {
            intent_score: intentScore,
            is_high_intent: isHighIntent,
            conversation_id: conversation?.id,
            caller_company: carrierName || undefined,
            // Shipper and equipment tags (only set if not already present)
            ...(shipper ? { shipper } : {}),
            ...(equipmentType ? { equipment_type: equipmentType } : {}),
            // Add carrier verification fields
            carrier_usdot: carrierUsdot || undefined,
            carrier_mc: carrierMc || undefined,
            carrier_name: carrierName || undefined,
            carrier_verified_at: (carrierUsdot || carrierMc) ? new Date().toISOString() : undefined,
            // Add keyword match info to intent_reason_breakdown
            ...(intentReasonBreakdown ? { intent_reason_breakdown: intentReasonBreakdown } : {}),
          };

          // IMPORTANT: Update caller_phone to the original caller number if the lead has a different one
          // This handles cases where create-lead collected a callback number different from the caller's actual phone
          if (callerPhone && callerPhone !== "unknown" && callerPhone.length > 5) {
            updatePayload.caller_phone = callerPhone;
            console.log("Updating lead caller_phone to original caller:", callerPhone);
          }
          
          if (updatedNotes) {
            updatePayload.notes = updatedNotes;
          }

          await supabase
            .from("leads")
            .update(updatePayload)
            .eq("id", lead.id);

          console.log("Updated lead:", lead.id, "intent_score:", intentScore, "is_high_intent:", isHighIntent, "carrier_status:", carrierStatus);
        } else {
          // NO EXISTING LEAD - Create a new lead for ALL calls with valid phone numbers
          // Every call with a phone number is a lead opportunity
          const hasValidPhone = callerPhone && callerPhone !== "unknown" && callerPhone.length > 5;
          
          if (hasValidPhone) {
            console.log("Creating new lead for call with phone number:", callerPhone);
            
            // Calculate intent score based on call quality
            let intentScore = 5; // Default for any call with phone
            let isHighIntentCall = outcome === "callback_requested" || 
                                     outcome === "booked" ||
                                     !!carrierUsdot || 
                                     !!carrierMc ||
                                     (payload.call_duration_secs && payload.call_duration_secs > 30) ||
                                     keywordMatchResult.matched;
            
            if (outcome === "booked") intentScore = 10;
            else if (outcome === "callback_requested") intentScore = 8;
            else if (carrierUsdot || carrierMc) intentScore = 9;
            else if (sentiment === "positive") intentScore = 7;
            else if (payload.call_duration_secs && payload.call_duration_secs > 30) intentScore = 6;

            // KEYWORD BOOST: If keyword matched, ensure score is at least 85% (8.5/10)
            if (keywordMatchResult.matched) {
              const keywordBoostScore = Math.round(keywordMatchResult.weight * 10);
              intentScore = Math.max(intentScore, keywordBoostScore);
              isHighIntentCall = true;
              console.log(`Keyword boost applied to new lead: score raised to ${intentScore}`);
            }

            // Build intent reason breakdown for new leads
            let intentReasonBreakdown: Record<string, unknown> | null = null;
            if (keywordMatchResult.matched) {
              intentReasonBreakdown = {
                keyword_match: {
                  rule_id: keywordMatchResult.keywordId,
                  keyword: keywordMatchResult.keyword,
                  match_type: keywordMatchResult.matchType,
                  matched_at: new Date().toISOString(),
                }
              };
            }

            // Build notes
            let leadNotes = summary ? `[AI SUMMARY] ${summary}` : null;
            if (carrierStatus) {
              leadNotes = (leadNotes ? leadNotes + "\n\n" : "") + `[CARRIER STATUS]\n${carrierStatus}`;
            }

            const { data: newLead, error: leadError } = await supabase
              .from("leads")
              .insert({
                agency_id: agency.id,
                caller_phone: callerPhone,
                caller_company: carrierName || null,
                phone_call_id: phoneCall.id,
                conversation_id: conversation?.id,
                status: "pending",
                intent_score: intentScore,
                is_high_intent: isHighIntentCall,
                // Shipper and equipment tags
                shipper: shipper || null,
                equipment_type: equipmentType || null,
                carrier_usdot: carrierUsdot || null,
                carrier_mc: carrierMc || null,
                carrier_name: carrierName || null,
                carrier_verified_at: (carrierUsdot || carrierMc) ? new Date().toISOString() : null,
                notes: leadNotes,
                // Add keyword match info
                intent_reason_breakdown: intentReasonBreakdown,
              })
              .select()
              .single();

            if (leadError) {
              console.error("Failed to create lead:", leadError);
            } else {
              console.log("Created new lead:", newLead?.id, "intent_score:", intentScore, "is_high_intent:", isHighIntentCall);
            }
          } else {
            console.log("No valid phone number to create lead. callerPhone:", callerPhone);
          }
        }
      }

      // Update the elevenlabs_post_calls record with AI-generated summary if we have one
      // This ensures ALL calls have summaries displayed in the dashboard
      if (postCall?.id && summary) {
        await supabase
          .from("elevenlabs_post_calls")
          .update({
            transcript_summary: summary,
            call_summary_title: intent || outcome || undefined,
            agency_id: agency.id, // Add agency_id for filtering
          })
          .eq("id", postCall.id);
        console.log("Updated elevenlabs_post_calls with summary:", postCall.id);
      }

      // Create or update ai_call_summaries record for dashboard display
      // Include keyword match in high intent determination
      const isHighIntentSummary = outcome === "callback_requested" || 
                               outcome === "booked" ||
                               !!carrierUsdot || 
                               !!carrierMc ||
                               keywordMatchResult.matched ||
                               (payload.call_duration_secs && payload.call_duration_secs > 30);

      // Extract call cost from ElevenLabs metadata
      const callCostCredits = metadata?.cost || data.metadata?.cost || null;

      const { error: summaryError } = await supabase
        .from("ai_call_summaries")
        .upsert({
          conversation_id: callId || `webhook-${Date.now()}`,
          agency_id: agency.id,
          call_sid: payload.call_sid || payload.twilio_call_sid,
          agent_number: receiverPhone,
          external_number: callerPhone || "unknown",
          duration_secs: payload.call_duration_secs || payload.duration || data.call_duration_secs,
          call_outcome: outcome,
          termination_reason: terminationReason || payload.termination_reason,
          summary: summary,
          summary_short: summary,
          summary_title: summaryTitle || intent || outcome || "Call",
          transcript: transcript,
          is_high_intent: isHighIntentSummary,
          high_intent_reasons: keywordMatchResult.matched 
            ? { reasons: ["Keyword match: " + keywordMatchResult.keyword], keyword_id: keywordMatchResult.keywordId } 
            : (carrierUsdot || carrierMc) ? { reasons: ["Carrier ID provided"] } : null,
          carrier_usdot: carrierUsdot,
          carrier_mc: carrierMc,
          carrier_name: carrierName,
          call_cost_credits: callCostCredits,
          started_at: new Date(Date.now() - (payload.call_duration_secs || data.call_duration_secs || 0) * 1000).toISOString(),
          ended_at: new Date().toISOString(),
        }, { onConflict: 'conversation_id' });

      if (summaryError) {
        console.error("Failed to upsert ai_call_summaries:", summaryError);
      } else {
        console.log("Upserted ai_call_summaries for:", callId);
      }

      // ============================================
      // UPDATE AGENT_DAILY_STATE COUNTERS
      // ============================================
      // Increment ai_calls for all processed calls
      // Increment booked if outcome is "booked"
      // Also increment high_intent if applicable
      // ============================================
      try {
        // Get all agents in the agency to update their daily state
        // (For now, update the agency-level state - agents will have their own state based on claimed leads)
        const { data: agencyMembers } = await supabase
          .from("agency_members")
          .select("user_id, agency_id")
          .eq("agency_id", agency.id);

        if (agencyMembers && agencyMembers.length > 0) {
          // Calculate today's local date (using agency's timezone, default to America/New_York)
          const now = new Date();
          const localDate = now.toISOString().split("T")[0]; // Use UTC date for simplicity

          // Calculate call duration in minutes
          const callDurationMins = (payload.call_duration_secs || payload.duration || 0) / 60;

          for (const member of agencyMembers) {
            // Upsert agent_daily_state for each member
            const { data: existingState } = await supabase
              .from("agent_daily_state")
              .select("*")
              .eq("agent_id", member.user_id)
              .eq("local_date", localDate)
              .maybeSingle();

            if (existingState) {
              // Update existing state
              const updateData: Record<string, unknown> = {
                ai_calls: (existingState.ai_calls || 0) + 1,
                ai_minutes: Number(existingState.ai_minutes || 0) + callDurationMins,
                updated_at: new Date().toISOString(),
              };

              // Increment high_intent if this is a high intent call
              if (isHighIntentSummary) {
                updateData.high_intent = (existingState.high_intent || 0) + 1;
              }

              // Increment booked if outcome is booked
              if (outcome === "booked") {
                updateData.booked = (existingState.booked || 0) + 1;
              }

              await supabase
                .from("agent_daily_state")
                .update(updateData)
                .eq("id", existingState.id);

              console.log("Updated agent_daily_state for agent:", member.user_id, updateData);
            } else {
              // Create new state for today
              const insertData = {
                agent_id: member.user_id,
                agency_id: member.agency_id,
                local_date: localDate,
                ai_calls: 1,
                ai_minutes: callDurationMins,
                high_intent: isHighIntentSummary ? 1 : 0,
                booked: outcome === "booked" ? 1 : 0,
              };

              await supabase
                .from("agent_daily_state")
                .insert(insertData);

              console.log("Created agent_daily_state for agent:", member.user_id, insertData);
            }
          }
        }
      } catch (stateErr) {
        console.error("Failed to update agent_daily_state:", stateErr);
        // Don't fail the webhook, just log the error
      }

      // Log health event: successful call processing
      await supabase.from('system_health_events').insert({
        service_name: 'elevenlabs_webhook',
        status: 'ok',
        metadata: { phone_call_id: phoneCall?.id, conversation_id: conversation?.id },
      });

      return new Response(JSON.stringify({ 
        success: true, 
        phone_call_id: phoneCall?.id,
        conversation_id: conversation?.id,
        analysis: { sentiment, intent, outcome }
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // For other event types, just acknowledge
    return new Response(JSON.stringify({ success: true, event: eventType }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (err) {
    console.error("Webhook error:", err);
    
    // Log health event: webhook failure
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (supabaseUrl && serviceKey) {
        const supabase = createClient(supabaseUrl, serviceKey);
        await supabase.from('system_health_events').insert({
          service_name: 'elevenlabs_webhook',
          status: 'fail',
          error_message: String(err),
        });
      }
    } catch (logErr) {
      console.error("Failed to log health event:", logErr);
    }
    
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
