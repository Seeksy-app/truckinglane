import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ScoreRequest {
  account_id: string;
  auto_queue?: boolean;
}

interface ScoreBreakdown {
  commodity: number;
  equipment: number;
  fmcsa: number;
  geography: number;
  scale: number;
  website: number;
}

// V1 Locked Scoring Weights - DO NOT MODIFY
// Same inputs = same score every time
const SCORING_CONFIG = {
  COMMODITY_MATCH: 30,      // +30 → Commodity match
  EQUIPMENT_MATCH: 20,      // +20 → Equipment match
  FMCSA_ENRICHED: 20,       // +20 → FMCSA enrichment present
  GEOGRAPHY_RELEVANCE: 10,  // +10 → Geography relevance
  BUSINESS_SCALE: 10,       // +10 → Business scale signal
  WEBSITE_QUALITY: 10,      // +10 → Website quality signal
} as const;

// Target commodities for matching
const TARGET_COMMODITIES = ['flatbed', 'reefer', 'specialized', 'general', 'general freight', 'dry van', 'refrigerated'];

// Target equipment types for matching
const TARGET_EQUIPMENT = ['flatbed', 'stepdeck', 'step deck', 'van', 'reefer', 'dry van', 'lowboy', 'rgn', 'conestoga', 'hotshot'];

// US states for geography check
const US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'
];

/**
 * Deterministic Fit Score Calculator V1
 * Locked scoring rules - same inputs always produce same score
 */
function calculateFitScore(account: any): { score: number; breakdown: ScoreBreakdown; reasons: string[] } {
  const breakdown: ScoreBreakdown = {
    commodity: 0,
    equipment: 0,
    fmcsa: 0,
    geography: 0,
    scale: 0,
    website: 0,
  };
  const reasons: string[] = [];

  // 1. Commodity Match (+30 max)
  const commodities = (account.commodities || []).map((c: string) => c.toLowerCase());
  const hasCommodityMatch = commodities.some((c: string) => 
    TARGET_COMMODITIES.some(target => c.includes(target) || target.includes(c))
  );
  if (hasCommodityMatch) {
    breakdown.commodity = SCORING_CONFIG.COMMODITY_MATCH;
    reasons.push(`+${SCORING_CONFIG.COMMODITY_MATCH}: Commodity match (${commodities.slice(0, 3).join(', ')})`);
  }

  // 2. Equipment Match (+20 max)
  const equipment = (account.equipment_types || []).map((e: string) => e.toLowerCase());
  const hasEquipmentMatch = equipment.some((e: string) => 
    TARGET_EQUIPMENT.some(target => e.includes(target) || target.includes(e))
  );
  if (hasEquipmentMatch) {
    breakdown.equipment = SCORING_CONFIG.EQUIPMENT_MATCH;
    reasons.push(`+${SCORING_CONFIG.EQUIPMENT_MATCH}: Equipment match (${equipment.slice(0, 3).join(', ')})`);
  }

  // 3. FMCSA Enrichment Present (+20 max)
  const hasMC = account.mc_number && account.mc_number.trim().length > 0;
  const hasDOT = account.dot_number && account.dot_number.trim().length > 0;
  const hasFmcsaData = account.fmcsa_data && Object.keys(account.fmcsa_data).length > 0;
  if (hasMC || hasDOT || hasFmcsaData) {
    breakdown.fmcsa = SCORING_CONFIG.FMCSA_ENRICHED;
    const identifiers = [];
    if (hasMC) identifiers.push(`MC-${account.mc_number}`);
    if (hasDOT) identifiers.push(`DOT-${account.dot_number}`);
    reasons.push(`+${SCORING_CONFIG.FMCSA_ENRICHED}: FMCSA enrichment (${identifiers.join(', ') || 'data present'})`);
  }

  // 4. Geography Relevance (+10 max)
  const regions = (account.regions || []).map((r: string) => r.toUpperCase());
  const isUSBased = regions.some((r: string) => US_STATES.includes(r) || r === 'US' || r === 'USA');
  const fmcsaState = account.fmcsa_data?.phyState?.toUpperCase();
  const hasInterstateAuth = account.fmcsa_data?.carrierOperation?.includes('Interstate') ||
                           account.fmcsa_data?.allowedToOperate === 'Y';
  if (isUSBased || (fmcsaState && US_STATES.includes(fmcsaState)) || hasInterstateAuth) {
    breakdown.geography = SCORING_CONFIG.GEOGRAPHY_RELEVANCE;
    reasons.push(`+${SCORING_CONFIG.GEOGRAPHY_RELEVANCE}: US-based / interstate carrier`);
  }

  // 5. Business Scale Signal (+10 max)
  const fmcsaData = account.fmcsa_data || {};
  const totalDrivers = parseInt(fmcsaData.totalDrivers || '0', 10);
  const totalPowerUnits = parseInt(fmcsaData.totalPowerUnits || '0', 10);
  const hasFleetSize = totalDrivers > 0 || totalPowerUnits > 0;
  const hasMultipleLocations = regions.length > 1;
  if (hasFleetSize || hasMultipleLocations) {
    breakdown.scale = SCORING_CONFIG.BUSINESS_SCALE;
    const scaleDetails = [];
    if (totalPowerUnits > 0) scaleDetails.push(`${totalPowerUnits} trucks`);
    if (totalDrivers > 0) scaleDetails.push(`${totalDrivers} drivers`);
    if (hasMultipleLocations) scaleDetails.push(`${regions.length} regions`);
    reasons.push(`+${SCORING_CONFIG.BUSINESS_SCALE}: Business scale (${scaleDetails.join(', ')})`);
  }

  // 6. Website Quality Signal (+10 max)
  const hasWebsite = account.website && account.website.trim().length > 0;
  const hasContactInfo = account.contact_email || account.contact_phone;
  if (hasWebsite && hasContactInfo) {
    breakdown.website = SCORING_CONFIG.WEBSITE_QUALITY;
    reasons.push(`+${SCORING_CONFIG.WEBSITE_QUALITY}: Website with contact info`);
  } else if (hasWebsite) {
    // Partial credit for just having a website
    breakdown.website = Math.floor(SCORING_CONFIG.WEBSITE_QUALITY / 2);
    reasons.push(`+${breakdown.website}: Has website (no contact info)`);
  }

  // Calculate total score (capped at 100)
  const score = Math.min(100, Object.values(breakdown).reduce((sum, val) => sum + val, 0));

  return { score, breakdown, reasons };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { account_id, auto_queue = true } = await req.json() as ScoreRequest;
    
    if (!account_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'account_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[score-account-fit] Scoring account: ${account_id}`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get account
    const { data: account, error: fetchError } = await supabase
      .from('accounts')
      .select('*')
      .eq('id', account_id)
      .single();

    if (fetchError || !account) {
      console.error(`[score-account-fit] Account not found: ${account_id}`);
      return new Response(
        JSON.stringify({ success: false, error: 'Account not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Calculate deterministic fit score
    const { score, breakdown, reasons } = calculateFitScore(account);
    
    console.log(`[score-account-fit] Score calculated: ${score}`, { breakdown, reasons });

    // Update account with score and breakdown
    const { error: updateError } = await supabase
      .from('accounts')
      .update({
        fit_score: score,
        fit_score_breakdown: breakdown,
        updated_at: new Date().toISOString()
      })
      .eq('id', account_id);

    if (updateError) {
      console.error('[score-account-fit] Update error:', updateError);
    }

    // Log scoring event
    await supabase.from('account_events').insert({
      account_id,
      event_type: 'scored',
      meta: { score, breakdown, reasons }
    });

    // Auto-queue if score >= 40 (lowered threshold per spec)
    let queued = false;
    if (auto_queue && score >= 40) {
      // Determine priority based on score thresholds
      let priority = 'low';
      if (score >= 80) {
        priority = 'high';
      } else if (score >= 50) {
        priority = 'medium';
      }

      // Check if already in queue
      const { data: existingQueue } = await supabase
        .from('prospecting_queue')
        .select('id')
        .eq('account_id', account_id)
        .single();

      if (!existingQueue) {
        const { error: queueError } = await supabase
          .from('prospecting_queue')
          .insert({
            account_id,
            agency_id: account.agency_id,
            priority,
            reason: reasons.slice(0, 3).join('; '),
            status: 'new'
          });

        if (!queueError) {
          queued = true;
          console.log(`[score-account-fit] Added to queue with priority: ${priority}`);
          
          // Log queue event
          await supabase.from('account_events').insert({
            account_id,
            event_type: 'queued',
            meta: { priority, score }
          });
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        account_id,
        fit_score: score,
        breakdown,
        reasons,
        queued,
        priority: score >= 80 ? 'high' : score >= 50 ? 'medium' : 'low'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('[score-account-fit] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
