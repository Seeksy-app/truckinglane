import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Scoring rules
const SCORING_RULES = {
  MC_DOT_PROVIDED: { points: 20, reason: "MC/DOT number provided" },
  COMPANY_PROVIDED: { points: 15, reason: "Company name provided" },
  LOAD_NUMBER_MENTIONED: { points: 20, reason: "Load number mentioned" },
  CITIES_MENTIONED: { points: 15, reason: "Origin/destination cities mentioned" },
  CALLBACK_REQUESTED: { points: 15, reason: "Callback requested" },
  DISPATCH_KEYWORD: { points: 10, reason: "Asked to speak with dispatch" },
  RATE_DISCUSSED: { points: 10, reason: "Rate/price discussed" },
  RATE_ACCEPTED: { points: 20, reason: "Rate acceptance indicated" },
  EQUIPMENT_MATCH: { points: 10, reason: "Equipment type specified" },
  URGENT_LANGUAGE: { points: 10, reason: "Urgent/immediate language detected" },
};

// Keywords to detect in transcripts
const KEYWORDS = {
  callback: ["callback", "call back", "call me back", "give me a call", "reach me at", "contact me"],
  dispatch: ["speak to dispatch", "talk to dispatch", "real person", "speak to someone", "transfer me", "speak with an agent"],
  rate: ["rate", "price", "how much", "pay", "cost", "dollars", "per mile", "per ton"],
  rateAccept: ["sounds good", "i'll take it", "book it", "let's do it", "we can do that", "that works", "deal", "confirmed", "we're good"],
  urgent: ["asap", "right now", "immediately", "today", "urgent", "emergency", "need it now", "quickly"],
  equipment: ["flatbed", "dry van", "reefer", "van", "step deck", "lowboy", "hotshot", "53 foot", "48 foot"],
  cities: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?),?\s*([A-Z]{2})\b/g,
  loadNumber: /\b(load\s*#?\s*\d+|\d{6,})\b/gi,
  mcDot: /\b(mc\s*#?\s*\d+|dot\s*#?\s*\d+|usdot\s*\d+|\d{5,7})\b/gi,
};

function scoreTranscript(text: string): { points: number; reasons: string[] } {
  const reasons: string[] = [];
  let points = 0;
  const lowerText = text.toLowerCase();

  // Check for MC/DOT
  if (KEYWORDS.mcDot.test(text)) {
    points += SCORING_RULES.MC_DOT_PROVIDED.points;
    reasons.push(SCORING_RULES.MC_DOT_PROVIDED.reason);
  }

  // Check for load number
  if (KEYWORDS.loadNumber.test(text)) {
    points += SCORING_RULES.LOAD_NUMBER_MENTIONED.points;
    reasons.push(SCORING_RULES.LOAD_NUMBER_MENTIONED.reason);
  }

  // Check for cities/lanes
  if (KEYWORDS.cities.test(text)) {
    points += SCORING_RULES.CITIES_MENTIONED.points;
    reasons.push(SCORING_RULES.CITIES_MENTIONED.reason);
  }

  // Check for callback keywords
  if (KEYWORDS.callback.some(kw => lowerText.includes(kw))) {
    points += SCORING_RULES.CALLBACK_REQUESTED.points;
    reasons.push(SCORING_RULES.CALLBACK_REQUESTED.reason);
  }

  // Check for dispatch keywords
  if (KEYWORDS.dispatch.some(kw => lowerText.includes(kw))) {
    points += SCORING_RULES.DISPATCH_KEYWORD.points;
    reasons.push(SCORING_RULES.DISPATCH_KEYWORD.reason);
  }

  // Check for rate discussion
  if (KEYWORDS.rate.some(kw => lowerText.includes(kw))) {
    points += SCORING_RULES.RATE_DISCUSSED.points;
    reasons.push(SCORING_RULES.RATE_DISCUSSED.reason);
  }

  // Check for rate acceptance
  if (KEYWORDS.rateAccept.some(kw => lowerText.includes(kw))) {
    points += SCORING_RULES.RATE_ACCEPTED.points;
    reasons.push(SCORING_RULES.RATE_ACCEPTED.reason);
  }

  // Check for equipment
  if (KEYWORDS.equipment.some(kw => lowerText.includes(kw))) {
    points += SCORING_RULES.EQUIPMENT_MATCH.points;
    reasons.push(SCORING_RULES.EQUIPMENT_MATCH.reason);
  }

  // Check for urgent language
  if (KEYWORDS.urgent.some(kw => lowerText.includes(kw))) {
    points += SCORING_RULES.URGENT_LANGUAGE.points;
    reasons.push(SCORING_RULES.URGENT_LANGUAGE.reason);
  }

  return { points, reasons };
}

function scoreLead(lead: any, conversation: any, callSummary: any): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;

  // Score from lead fields
  if (lead.carrier_mc || lead.carrier_usdot) {
    score += SCORING_RULES.MC_DOT_PROVIDED.points;
    reasons.push(SCORING_RULES.MC_DOT_PROVIDED.reason);
  }

  if (lead.caller_company && lead.caller_company !== "None" && lead.caller_company.trim() !== "") {
    score += SCORING_RULES.COMPANY_PROVIDED.points;
    reasons.push(SCORING_RULES.COMPANY_PROVIDED.reason);
  }

  if (lead.load_id) {
    score += SCORING_RULES.LOAD_NUMBER_MENTIONED.points;
    reasons.push(SCORING_RULES.LOAD_NUMBER_MENTIONED.reason);
  }

  if (lead.callback_requested_at) {
    score += SCORING_RULES.CALLBACK_REQUESTED.points;
    reasons.push(SCORING_RULES.CALLBACK_REQUESTED.reason);
  }

  // Score from transcript
  const transcriptText = conversation?.transcript || callSummary?.transcript || "";
  if (transcriptText) {
    const transcriptScore = scoreTranscript(transcriptText);
    // Avoid double-counting reasons already added
    for (const reason of transcriptScore.reasons) {
      if (!reasons.includes(reason)) {
        reasons.push(reason);
        // Find the points for this reason
        const rule = Object.values(SCORING_RULES).find(r => r.reason === reason);
        if (rule) {
          score += rule.points;
        }
      }
    }
  }

  // Score from notes
  if (lead.notes) {
    const notesScore = scoreTranscript(lead.notes);
    for (const reason of notesScore.reasons) {
      if (!reasons.includes(reason)) {
        reasons.push(reason);
        const rule = Object.values(SCORING_RULES).find(r => r.reason === reason);
        if (rule) {
          score += rule.points;
        }
      }
    }
  }

  // Score from summary
  const summaryText = conversation?.summary || callSummary?.summary || "";
  if (summaryText) {
    const summaryScore = scoreTranscript(summaryText);
    for (const reason of summaryScore.reasons) {
      if (!reasons.includes(reason)) {
        reasons.push(reason);
        const rule = Object.values(SCORING_RULES).find(r => r.reason === reason);
        if (rule) {
          score += rule.points;
        }
      }
    }
  }

  // Cap at 100
  score = Math.min(100, score);

  return { score, reasons };
}

serve(async (req) => {
  console.log("=== BACKFILL INTENT SCORES ===");

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SERVICE_KEY) {
      throw new Error("Missing environment variables");
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // Get all leads that are not manually resolved (status = pending or claimed)
    // Also include booked/closed that don't have a score yet
    const { data: leads, error: leadsError } = await supabase
      .from("leads")
      .select("*")
      .or("status.eq.pending,status.eq.claimed,intent_score.is.null");

    if (leadsError) {
      throw leadsError;
    }

    console.log(`Found ${leads?.length || 0} leads to process`);

    let processedCount = 0;
    let updatedCount = 0;
    const errors: string[] = [];

    for (const lead of leads || []) {
      try {
        processedCount++;

        // Fetch conversation data if available
        let conversation = null;
        if (lead.conversation_id) {
          const { data } = await supabase
            .from("conversations")
            .select("transcript, summary")
            .eq("id", lead.conversation_id)
            .maybeSingle();
          conversation = data;
        } else if (lead.phone_call_id) {
          const { data } = await supabase
            .from("conversations")
            .select("transcript, summary")
            .eq("phone_call_id", lead.phone_call_id)
            .maybeSingle();
          conversation = data;
        }

        // Fetch ai_call_summaries data if available
        let callSummary = null;
        if (lead.phone_call_id) {
          const { data: phoneCall } = await supabase
            .from("phone_calls")
            .select("elevenlabs_call_id")
            .eq("id", lead.phone_call_id)
            .maybeSingle();

          if (phoneCall?.elevenlabs_call_id) {
            const { data } = await supabase
              .from("ai_call_summaries")
              .select("transcript, summary")
              .eq("conversation_id", phoneCall.elevenlabs_call_id)
              .maybeSingle();
            callSummary = data;
          }
        }

        // Calculate score
        const { score, reasons } = scoreLead(lead, conversation, callSummary);

        // Determine if high intent (score >= 50)
        const isHighIntent = score >= 50;

        // Update the lead
        const { error: updateError } = await supabase
          .from("leads")
          .update({
            intent_score: score,
            is_high_intent: isHighIntent,
            intent_reason_breakdown: reasons,
          })
          .eq("id", lead.id);

        if (updateError) {
          errors.push(`Lead ${lead.id}: ${updateError.message}`);
        } else {
          updatedCount++;

          // Log the backfill event
          await supabase.from("lead_events").insert({
            lead_id: lead.id,
            event_type: "intent_backfill",
            meta: {
              old_score: lead.intent_score,
              new_score: score,
              reasons,
              is_high_intent: isHighIntent,
            },
          });
        }

        // Progress log every 10 leads
        if (processedCount % 10 === 0) {
          console.log(`Processed ${processedCount}/${leads?.length || 0} leads`);
        }
      } catch (leadError) {
        const errorMsg = leadError instanceof Error ? leadError.message : String(leadError);
        errors.push(`Lead ${lead.id}: ${errorMsg}`);
      }
    }

    console.log(`Backfill complete: ${updatedCount} updated, ${errors.length} errors`);

    return new Response(
      JSON.stringify({
        success: true,
        processed: processedCount,
        updated: updatedCount,
        errors: errors.length > 0 ? errors.slice(0, 10) : undefined, // Limit error output
        message: `Backfilled ${updatedCount} leads with intent scores`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Backfill error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
