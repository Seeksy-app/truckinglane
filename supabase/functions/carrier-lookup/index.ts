import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CarrierDetails {
  legalName: string;
  dbaName?: string;
  dotNumber: string;
  mcNumber?: string;
  allowedToOperate: string;
  bipdInsuranceOnFile: string;
  bipdInsuranceRequired: string;
  bondInsuranceOnFile?: string;
  cargoInsuranceOnFile?: string;
  safetyRating?: string;
  safetyRatingDate?: string;
  totalPowerUnits?: number;
  totalDrivers?: number;
  phyCity?: string;
  phyState?: string;
  phyZipcode?: string;
  oosDate?: string;
}

interface FMCSACarrierResponse {
  content?: {
    carrier?: CarrierDetails;
  };
  carrier?: CarrierDetails;
}

interface FMCSASearchResult {
  content?: Array<{
    dotNumber: string;
    legalName: string;
    dbaName?: string;
    phyCity?: string;
    phyState?: string;
    mcNumber?: string;
  }>;
}

// Cache duration: 24 hours
const CACHE_DURATION_HOURS = 24;
const FETCH_TIMEOUT_MS = 10000;

// Helper to fetch with timeout
async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('FMCSA_TIMEOUT');
    }
    throw error;
  }
}

// Helper to build error response
function errorResponse(code: string, message: string, status: number, debugId: string) {
  console.error(`[${debugId}] Error: ${code} - ${message}`);
  return new Response(
    JSON.stringify({ ok: false, code, message, debug_id: debugId }),
    { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Health check endpoint
  const url = new URL(req.url);
  if (url.pathname.endsWith('/health') || url.searchParams.get('health') === 'true') {
    return new Response(JSON.stringify({ status: 'ok', service: 'carrier-lookup', timestamp: new Date().toISOString() }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const debugId = crypto.randomUUID().slice(0, 8);

  try {
    const { usdot, mc, company_name, agency_id } = await req.json();
    
    if (!usdot && !mc && !company_name) {
      return errorResponse('VALIDATION', 'USDOT, MC number, or company name is required', 400, debugId);
    }

    console.log(`[${debugId}] Looking up carrier - USDOT: ${usdot}, MC: ${mc}, Name: ${company_name}`);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get FMCSA API key (webKey)
    const FMCSA_WEBKEY = Deno.env.get('FMCSA_API_KEY');
    if (!FMCSA_WEBKEY) {
      console.error(`[${debugId}] FMCSA_API_KEY not configured`);
      return errorResponse('CONFIG_ERROR', 'FMCSA API not configured', 500, debugId);
    }

    // Clean inputs - strip non-digits for DOT/MC
    let cleanDot = usdot ? usdot.toString().replace(/\D/g, '') : null;
    let cleanMc = mc ? mc.toString().replace(/\D/g, '').replace(/^0+/, '') : null; // Remove leading zeros
    const cleanName = company_name ? company_name.toString().trim() : null;
    
    let fmcsaData: FMCSACarrierResponse | null = null;
    let multipleResults: FMCSASearchResult['content'] | null = null;

    // Step 1: Check cache in carrier_intelligence table
    if (agency_id && (cleanDot || cleanMc)) {
      let cacheQuery = supabase
        .from('carrier_intelligence')
        .select('*')
        .eq('agency_id', agency_id);
      
      if (cleanDot) {
        cacheQuery = cacheQuery.eq('usdot', cleanDot);
      } else if (cleanMc) {
        cacheQuery = cacheQuery.eq('mc', cleanMc);
      }
      
      const { data: cached } = await cacheQuery.maybeSingle();

      if (cached?.fmcsa_fetched_at) {
        const fetchedAt = new Date(cached.fmcsa_fetched_at);
        const hoursAgo = (Date.now() - fetchedAt.getTime()) / (1000 * 60 * 60);
        
        if (hoursAgo < CACHE_DURATION_HOURS) {
          console.log(`[${debugId}] Returning cached data for ${cleanDot || cleanMc} (${hoursAgo.toFixed(1)}h old)`);
          return new Response(
            JSON.stringify({
              ok: true,
              carrier: {
                usdot: cached.usdot,
                mc: cached.mc,
                name: cached.carrier_name,
                ...cached.fmcsa_data,
              },
              ai_activity: cached.ai_activity,
              ai_insights: cached.ai_insights,
              last_call_outcome: cached.last_call_outcome,
              last_call_at: cached.last_call_at,
              fetched_at: cached.fmcsa_fetched_at,
              verified_badge: getVerifiedBadge(cached.fmcsa_data),
              cached: true,
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }
    }

    // Step 2: Fetch from FMCSA API
    // Priority: USDOT > MC > Company name search
    const baseUrl = 'https://mobile.fmcsa.dot.gov/qc/services';
    
    if (cleanDot) {
      // Direct USDOT lookup
      const fmcsaUrl = `${baseUrl}/carriers/${cleanDot}?webKey=${FMCSA_WEBKEY}`;
      console.log(`[${debugId}] Fetching FMCSA by USDOT: ${cleanDot}`);
      console.log(`[${debugId}] FMCSA URL (key hidden): ${baseUrl}/carriers/${cleanDot}?webKey=***`);
      
      try {
        const response = await fetchWithTimeout(fmcsaUrl, FETCH_TIMEOUT_MS);
        console.log(`[${debugId}] FMCSA response status: ${response.status}`);
        
        if (response.ok) {
          const responseText = await response.text();
          console.log(`[${debugId}] FMCSA response preview: ${responseText.slice(0, 200)}`);
          try {
            fmcsaData = JSON.parse(responseText);
          } catch (parseErr) {
            console.error(`[${debugId}] Failed to parse FMCSA response as JSON`);
          }
        } else if (response.status === 401 || response.status === 403) {
          const errorBody = await response.text().catch(() => '');
          console.error(`[${debugId}] FMCSA ${response.status} - Auth error. Response: ${errorBody.slice(0, 300)}`);
          return errorResponse('FMCSA_AUTH', 'FMCSA API key invalid or unauthorized. Please check your FMCSA_API_KEY secret.', 500, debugId);
        } else if (response.status === 404) {
          const errorBody = await response.text().catch(() => '');
          console.log(`[${debugId}] FMCSA 404 - Response: ${errorBody.slice(0, 300)}`);
        } else {
          const errorBody = await response.text().catch(() => 'Unable to read response');
          console.error(`[${debugId}] FMCSA ${response.status}: ${errorBody.slice(0, 500)}`);
          if (response.status >= 500) {
            return errorResponse('FMCSA_5XX', 'FMCSA server error', 502, debugId);
          }
        }
      } catch (error) {
        if (error instanceof Error && error.message === 'FMCSA_TIMEOUT') {
          return errorResponse('FMCSA_TIMEOUT', 'FMCSA request timed out', 504, debugId);
        }
        throw error;
      }
    }

    if (!fmcsaData && cleanMc) {
      // MC number lookup via docket-number endpoint
      const fmcsaUrl = `${baseUrl}/carriers/docket-number/${cleanMc}?webKey=${FMCSA_WEBKEY}`;
      console.log(`[${debugId}] Fetching FMCSA by MC: ${cleanMc}`);
      console.log(`[${debugId}] MC URL (key hidden): ${baseUrl}/carriers/docket-number/${cleanMc}?webKey=***`);
      
      try {
        const response = await fetchWithTimeout(fmcsaUrl, FETCH_TIMEOUT_MS);
        console.log(`[${debugId}] MC lookup response status: ${response.status}`);
        
        if (response.ok) {
          const responseText = await response.text();
          console.log(`[${debugId}] MC lookup response preview: ${responseText.slice(0, 300)}`);
          
          try {
            const data = JSON.parse(responseText);
            // MC lookup may return content.searchResults or content array
            const searchResults = data.content?.searchResults || data.content || [];
            console.log(`[${debugId}] MC search results count: ${Array.isArray(searchResults) ? searchResults.length : 'not array'}`);
            
            if (Array.isArray(searchResults) && searchResults.length > 0) {
              // Get the first matching carrier's DOT and fetch full details
              const firstCarrier = searchResults[0];
              console.log(`[${debugId}] First MC result: ${JSON.stringify(firstCarrier).slice(0, 200)}`);
              
              // Try to get DOT from dotNumber field or extract from _links URLs
              let extractedDot = firstCarrier.dotNumber;
              if (!extractedDot && firstCarrier._links) {
                // Extract DOT from links like "carriers/4038099/basics"
                const linksStr = JSON.stringify(firstCarrier._links);
                const dotMatch = linksStr.match(/\/carriers\/(\d+)\//);
                if (dotMatch) {
                  extractedDot = dotMatch[1];
                  console.log(`[${debugId}] Extracted DOT from links: ${extractedDot}`);
                }
              }
              
              if (extractedDot) {
                cleanDot = extractedDot;
                const detailUrl = `${baseUrl}/carriers/${cleanDot}?webKey=${FMCSA_WEBKEY}`;
                console.log(`[${debugId}] Fetching full details for DOT: ${cleanDot}`);
                const detailResponse = await fetchWithTimeout(detailUrl, FETCH_TIMEOUT_MS);
                if (detailResponse.ok) {
                  fmcsaData = await detailResponse.json();
                }
              } else {
                console.log(`[${debugId}] Could not extract DOT from MC result`);
              }
            }
          } catch (parseErr) {
            console.error(`[${debugId}] Failed to parse MC response: ${parseErr}`);
          }
        } else if (response.status === 401 || response.status === 403) {
          return errorResponse('FMCSA_401', 'Invalid FMCSA API key', 500, debugId);
        } else if (response.status === 404) {
          console.log(`[${debugId}] FMCSA 404 - Carrier not found by MC: ${cleanMc}`);
        } else {
          const errorBody = await response.text().catch(() => '');
          console.error(`[${debugId}] FMCSA MC lookup ${response.status}: ${errorBody.slice(0, 500)}`);
          if (response.status >= 500) {
            return errorResponse('FMCSA_5XX', 'FMCSA server error', 502, debugId);
          }
        }
      } catch (error) {
        if (error instanceof Error && error.message === 'FMCSA_TIMEOUT') {
          return errorResponse('FMCSA_TIMEOUT', 'FMCSA request timed out', 504, debugId);
        }
        throw error;
      }
    }

    if (!fmcsaData && cleanName) {
      // Company name search
      const encodedName = encodeURIComponent(cleanName);
      const fmcsaUrl = `${baseUrl}/carriers/name/${encodedName}?webKey=${FMCSA_WEBKEY}&start=0&size=25`;
      console.log(`[${debugId}] Fetching FMCSA by name: ${cleanName}`);
      
      try {
        const response = await fetchWithTimeout(fmcsaUrl, FETCH_TIMEOUT_MS);
        
        if (response.ok) {
          const data: FMCSASearchResult = await response.json();
          
          if (data.content && data.content.length > 0) {
            // If multiple results, return them for user to pick
            if (data.content.length > 1) {
              multipleResults = data.content;
            }
            
            // Get the first/best match
            const bestMatch = data.content[0];
            if (bestMatch.dotNumber) {
              cleanDot = bestMatch.dotNumber;
              const detailUrl = `${baseUrl}/carriers/${cleanDot}?webKey=${FMCSA_WEBKEY}`;
              const detailResponse = await fetchWithTimeout(detailUrl, FETCH_TIMEOUT_MS);
              if (detailResponse.ok) {
                fmcsaData = await detailResponse.json();
              }
            }
          }
        } else if (response.status === 401) {
          return errorResponse('FMCSA_401', 'Invalid FMCSA API key', 500, debugId);
        } else if (response.status === 404) {
          console.log(`[${debugId}] FMCSA 404 - No carriers found by name: ${cleanName}`);
        } else {
          const errorBody = await response.text().catch(() => '');
          console.error(`[${debugId}] FMCSA name lookup ${response.status}: ${errorBody.slice(0, 500)}`);
          if (response.status >= 500) {
            return errorResponse('FMCSA_5XX', 'FMCSA server error', 502, debugId);
          }
        }
      } catch (error) {
        if (error instanceof Error && error.message === 'FMCSA_TIMEOUT') {
          return errorResponse('FMCSA_TIMEOUT', 'FMCSA request timed out', 504, debugId);
        }
        throw error;
      }
    }

    // FMCSA API wraps carrier data in content.carrier
    const carrierData = fmcsaData?.content?.carrier || fmcsaData?.carrier;
    
    if (!carrierData) {
      console.error(`[${debugId}] No carrier data found in FMCSA response. Structure: ${JSON.stringify(Object.keys(fmcsaData || {}))}`);
      return errorResponse('FMCSA_404', 'Carrier not found', 404, debugId);
    }

    const carrier = carrierData;

    // Format FMCSA data
    const authorityStatus = carrier.allowedToOperate === 'Y' ? 'ACTIVE' : 'INACTIVE';
    const isOutOfService = !!carrier.oosDate;
    
    // CANONICAL INSURANCE LOGIC - NO INFERENCE
    // Only show ACTIVE if explicitly confirmed, NOT_ON_FILE if explicitly denied, else UNKNOWN
    let insuranceStatus: 'ACTIVE' | 'NOT_ON_FILE' | 'UNKNOWN';
    if (carrier.bipdInsuranceOnFile === 'Y') {
      insuranceStatus = 'ACTIVE';
    } else if (carrier.bipdInsuranceOnFile === 'N' || (carrier.bipdInsuranceRequired === 'Y' && carrier.bipdInsuranceOnFile === 'N')) {
      insuranceStatus = 'NOT_ON_FILE';
    } else {
      // Insurance data absent, delayed, or not returned - DO NOT INFER
      insuranceStatus = 'UNKNOWN';
    }
    
    // Log raw insurance fields for audit when not ACTIVE
    if (insuranceStatus !== 'ACTIVE') {
      console.log(`[${debugId}] Insurance audit: bipdInsuranceOnFile=${carrier.bipdInsuranceOnFile}, bipdInsuranceRequired=${carrier.bipdInsuranceRequired}, cargoInsuranceOnFile=${carrier.cargoInsuranceOnFile}`);
    }

    const fmcsaFormatted = {
      authority_status: authorityStatus,
      insurance_status: insuranceStatus,
      safety_rating: carrier.safetyRating || 'NOT RATED',
      power_units: carrier.totalPowerUnits || 0,
      drivers: carrier.totalDrivers || 0,
      mc_number: carrier.mcNumber || null,
      legal_name: carrier.legalName,
      out_of_service: isOutOfService,
      oos_date: carrier.oosDate || null,
      location: {
        city: carrier.phyCity || null,
        state: carrier.phyState || null,
        zip: carrier.phyZipcode || null,
      },
      insurance_details: {
        liability: carrier.bipdInsuranceOnFile === 'Y',
        liability_raw: carrier.bipdInsuranceOnFile,
        liability_required: carrier.bipdInsuranceRequired,
        cargo: carrier.cargoInsuranceOnFile === 'Y',
        cargo_raw: carrier.cargoInsuranceOnFile,
        bond: carrier.bondInsuranceOnFile === 'Y',
        bond_raw: carrier.bondInsuranceOnFile,
      },
    };

    const carrierName = carrier.dbaName || carrier.legalName;
    const riskScore = calculateRiskScore(carrier);
    const verifiedBadge = getVerifiedBadge(fmcsaFormatted);

    // Step 3: Upsert to carrier_intelligence if agency_id provided
    if (agency_id) {
      const aiInsights = {
        risk_score: riskScore,
        risk_factors: getRiskFactors(carrier),
        recommended_action: getRecommendation(carrier),
        conversion_likelihood: 0,
      };

      const { error: upsertError } = await supabase
        .from('carrier_intelligence')
        .upsert({
          agency_id,
          usdot: carrier.dotNumber,
          mc: carrier.mcNumber || null,
          carrier_name: carrierName,
          fmcsa_data: fmcsaFormatted,
          fmcsa_fetched_at: new Date().toISOString(),
          last_verified_at: new Date().toISOString(),
          out_of_service_flag: isOutOfService,
          ai_insights: aiInsights,
        }, {
          onConflict: 'agency_id,usdot',
        });

      if (upsertError) {
        console.error(`[${debugId}] Error caching carrier data:`, upsertError);
      } else {
        console.log(`[${debugId}] Cached carrier data for USDOT ${carrier.dotNumber}`);
      }
    }

    // Build response
    const responseData = {
      ok: true,
      carrier: {
        usdot: carrier.dotNumber,
        mc: carrier.mcNumber || null,
        name: carrierName,
        ...fmcsaFormatted,
      },
      ai_insights: {
        risk_score: riskScore,
        risk_factors: getRiskFactors(carrier),
        recommended_action: getRecommendation(carrier),
        conversion_likelihood: 0,
      },
      verified_badge: verifiedBadge,
      fetched_at: new Date().toISOString(),
      cached: false,
      // Include multiple results if name search returned many
      multiple_results: multipleResults ? multipleResults.map(r => ({
        usdot: r.dotNumber,
        name: r.legalName,
        dba_name: r.dbaName,
        city: r.phyCity,
        state: r.phyState,
        mc: r.mcNumber,
      })) : undefined,
    };

    console.log(`[${debugId}] Successfully fetched carrier: ${carrierName} (DOT: ${carrier.dotNumber}, MC: ${carrier.mcNumber})`);

    return new Response(
      JSON.stringify(responseData),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error(`[${debugId}] Unhandled error:`, error);
    return errorResponse(
      'NETWORK', 
      error instanceof Error ? error.message : 'Unknown error', 
      500, 
      debugId
    );
  }
});

function calculateRiskScore(carrier: CarrierDetails): number {
  let score = 0;
  if (carrier.allowedToOperate !== 'Y') score += 0.5;
  // CANONICAL: only penalize heavily if explicitly NO, lower penalty for unknown
  if (carrier.bipdInsuranceOnFile === 'N') {
    score += 0.4; // Explicit denial is high risk
  } else if (carrier.bipdInsuranceOnFile !== 'Y') {
    score += 0.15; // Unknown is lower risk but still needs attention
  }
  if (carrier.oosDate) score += 0.4;
  if (carrier.safetyRating === 'UNSATISFACTORY') score += 0.3;
  else if (carrier.safetyRating === 'CONDITIONAL') score += 0.15;
  else if (!carrier.safetyRating || carrier.safetyRating === 'NOT RATED') score += 0.05;
  if ((carrier.totalPowerUnits || 0) < 3) score += 0.05;
  return Math.min(1, Math.max(0, score));
}

function getRiskFactors(carrier: CarrierDetails): string[] {
  const factors: string[] = [];
  if (carrier.allowedToOperate !== 'Y') factors.push('Authority not active');
  // CANONICAL: only flag if explicitly NO, not if unknown/absent
  if (carrier.bipdInsuranceOnFile === 'N') {
    factors.push('Insurance explicitly not on file');
  } else if (carrier.bipdInsuranceOnFile !== 'Y') {
    factors.push('Insurance status unknown — verify before booking');
  }
  if (carrier.oosDate) factors.push('Out of service');
  if (carrier.safetyRating === 'UNSATISFACTORY') factors.push('Unsatisfactory safety rating');
  else if (carrier.safetyRating === 'CONDITIONAL') factors.push('Conditional safety rating');
  if ((carrier.totalPowerUnits || 0) < 3) factors.push('Small fleet size');
  if (factors.length === 0) factors.push('No significant risk factors identified');
  return factors;
}

function getRecommendation(carrier: CarrierDetails): string {
  if (carrier.oosDate) return 'do_not_book';
  if (carrier.allowedToOperate !== 'Y') return 'do_not_book';
  // Only block if explicitly NO insurance on file - do not infer from missing data
  if (carrier.bipdInsuranceOnFile === 'N') return 'do_not_book';
  // If insurance status unknown, require verification
  if (carrier.bipdInsuranceOnFile !== 'Y') return 'verify_before_booking';
  if (carrier.safetyRating === 'UNSATISFACTORY') return 'proceed_with_caution';
  if (carrier.safetyRating === 'CONDITIONAL') return 'proceed_with_caution';
  return 'ok_to_book';
}

function getVerifiedBadge(fmcsaData: Record<string, unknown>): { status: 'verified' | 'warning' | 'danger'; message: string } {
  const authorityActive = fmcsaData.authority_status === 'ACTIVE';
  const outOfService = fmcsaData.out_of_service === true;
  
  // PRIMARY: Out of Service is the most critical
  if (outOfService) {
    return { status: 'danger', message: 'OUT OF SERVICE' };
  }
  
  // PRIMARY: Authority/USDOT Status is the main indicator
  if (authorityActive) {
    return { status: 'verified', message: 'Active' };
  }
  
  // Authority not active
  return { status: 'danger', message: 'Inactive' };
}
