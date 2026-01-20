import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DiscoveryRequest {
  query?: string;
  urls?: string[];
  agency_id: string;
}

interface ExtractedAccount {
  name: string;
  website: string;
  type: 'broker' | 'shipper' | 'carrier' | 'unknown';
  commodities: string[];
  equipment_types: string[];
  regions: string[];
  contact_email?: string;
  contact_phone?: string;
  mc_number?: string;
  dot_number?: string;
}

// Freight/logistics indicators to detect relevant businesses
const FREIGHT_INDICATORS = [
  'freight', 'trucking', 'logistics', 'transportation', 'shipping',
  'carrier', 'broker', 'dispatch', 'haul', 'load', 'ltl', 'ftl',
  'flatbed', 'reefer', 'dry van', 'tanker', 'intermodal',
  'drayage', 'warehouse', '3pl', 'supply chain', 'motor carrier'
];

// Words that indicate non-freight business
const REJECT_INDICATORS = [
  'staffing agency', 'recruitment', 'temp agency', 'job board',
  'news site', 'blog only', 'directory listing'
];

// Common commodities
const COMMODITY_KEYWORDS: Record<string, string[]> = {
  'agricultural': ['hay', 'grain', 'corn', 'wheat', 'livestock', 'produce', 'farm', 'agriculture'],
  'construction': ['rebar', 'steel', 'lumber', 'concrete', 'building materials', 'construction'],
  'automotive': ['autos', 'vehicles', 'cars', 'automotive', 'auto parts'],
  'general': ['general freight', 'mixed freight', 'general cargo'],
  'refrigerated': ['frozen', 'perishable', 'cold chain', 'temperature controlled'],
  'hazmat': ['hazmat', 'hazardous', 'chemical', 'flammable']
};

// Equipment types
const EQUIPMENT_KEYWORDS: Record<string, string[]> = {
  'flatbed': ['flatbed', 'step deck', 'lowboy', 'rgn'],
  'van': ['dry van', 'van trailer', 'enclosed'],
  'reefer': ['reefer', 'refrigerated', 'temperature controlled'],
  'tanker': ['tanker', 'liquid', 'bulk liquid'],
  'bulk': ['hopper', 'pneumatic', 'bulk', 'grain trailer'],
  'specialized': ['oversized', 'heavy haul', 'specialized']
};

// US state abbreviations for region detection
const US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'
];

function extractAccountInfo(markdown: string, url: string): ExtractedAccount | null {
  const textLower = markdown.toLowerCase();
  
  // Check for rejection indicators
  for (const indicator of REJECT_INDICATORS) {
    if (textLower.includes(indicator)) {
      console.log(`Rejected: ${url} - contains "${indicator}"`);
      return null;
    }
  }
  
  // Check for freight indicators
  const hasFreightIndicator = FREIGHT_INDICATORS.some(ind => textLower.includes(ind));
  if (!hasFreightIndicator) {
    console.log(`Rejected: ${url} - no freight indicators found`);
    return null;
  }
  
  // Extract company name (first h1 or title-like content)
  const nameMatch = markdown.match(/^#\s+(.+)$/m) || markdown.match(/^##\s+(.+)$/m);
  const name = nameMatch ? nameMatch[1].trim() : new URL(url).hostname.replace('www.', '');
  
  // Detect account type
  let type: 'broker' | 'shipper' | 'carrier' | 'unknown' = 'unknown';
  if (textLower.includes('freight broker') || textLower.includes('brokerage')) {
    type = 'broker';
  } else if (textLower.includes('carrier') || textLower.includes('trucking company') || textLower.includes('motor carrier')) {
    type = 'carrier';
  } else if (textLower.includes('shipper') || textLower.includes('manufacturer') || textLower.includes('distribution')) {
    type = 'shipper';
  }
  
  // Extract commodities
  const commodities: string[] = [];
  for (const [commodity, keywords] of Object.entries(COMMODITY_KEYWORDS)) {
    if (keywords.some(kw => textLower.includes(kw))) {
      commodities.push(commodity);
    }
  }
  
  // Extract equipment types
  const equipmentTypes: string[] = [];
  for (const [equipment, keywords] of Object.entries(EQUIPMENT_KEYWORDS)) {
    if (keywords.some(kw => textLower.includes(kw))) {
      equipmentTypes.push(equipment);
    }
  }
  
  // Extract regions
  const regions: string[] = [];
  for (const state of US_STATES) {
    const stateRegex = new RegExp(`\\b${state}\\b`, 'g');
    if (stateRegex.test(markdown)) {
      regions.push(state);
    }
  }
  
  // Extract contact info
  const emailMatch = markdown.match(/[\w.-]+@[\w.-]+\.\w+/);
  const phoneMatch = markdown.match(/(?:\+1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}/);
  
  // Extract MC/DOT numbers
  const mcMatch = markdown.match(/MC[#\s-]*(\d{5,7})/i);
  const dotMatch = markdown.match(/(?:USDOT|DOT)[#\s-]*(\d{5,8})/i);
  
  return {
    name: name.substring(0, 255),
    website: url,
    type,
    commodities: [...new Set(commodities)],
    equipment_types: [...new Set(equipmentTypes)],
    regions: [...new Set(regions)].slice(0, 10), // Limit to 10 regions
    contact_email: emailMatch?.[0],
    contact_phone: phoneMatch?.[0],
    mc_number: mcMatch?.[1],
    dot_number: dotMatch?.[1]
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query, urls, agency_id } = await req.json() as DiscoveryRequest;
    
    if (!agency_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'agency_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!firecrawlApiKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'Firecrawl not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const discoveredAccounts: ExtractedAccount[] = [];
    const errors: string[] = [];

    // If search query provided, use Firecrawl search
    if (query) {
      console.log(`Searching for: ${query}`);
      
      const searchResponse = await fetch('https://api.firecrawl.dev/v1/search', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${firecrawlApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: `${query} freight trucking logistics`,
          limit: 10,
          scrapeOptions: { formats: ['markdown'] }
        }),
      });

      if (searchResponse.ok) {
        const searchData = await searchResponse.json();
        
        for (const result of searchData.data || []) {
          if (result.markdown) {
            const extracted = extractAccountInfo(result.markdown, result.url);
            if (extracted) {
              discoveredAccounts.push(extracted);
            }
          }
        }
      } else {
        const errText = await searchResponse.text();
        console.error('Firecrawl search error:', errText);
        errors.push(`Search failed: ${searchResponse.status}`);
      }
    }

    // If URLs provided, scrape each
    if (urls && urls.length > 0) {
      for (const url of urls.slice(0, 10)) { // Limit to 10 URLs
        try {
          let formattedUrl = url.trim();
          if (!formattedUrl.startsWith('http')) {
            formattedUrl = `https://${formattedUrl}`;
          }

          console.log(`Scraping: ${formattedUrl}`);
          
          const scrapeResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${firecrawlApiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              url: formattedUrl,
              formats: ['markdown'],
              onlyMainContent: true,
            }),
          });

          if (scrapeResponse.ok) {
            const scrapeData = await scrapeResponse.json();
            const markdown = scrapeData.data?.markdown || scrapeData.markdown;
            
            if (markdown) {
              const extracted = extractAccountInfo(markdown, formattedUrl);
              if (extracted) {
                discoveredAccounts.push(extracted);
              }
            }
          } else {
            console.error(`Scrape failed for ${formattedUrl}:`, scrapeResponse.status);
            errors.push(`Failed to scrape ${formattedUrl}`);
          }
        } catch (e) {
          console.error(`Error scraping ${url}:`, e);
          errors.push(`Error scraping ${url}`);
        }
      }
    }

    // Save discovered accounts to database
    const savedAccounts = [];
    for (const account of discoveredAccounts) {
      // Check if account already exists by website
      const { data: existing } = await supabase
        .from('accounts')
        .select('id')
        .eq('agency_id', agency_id)
        .eq('website', account.website)
        .single();

      if (existing) {
        console.log(`Account already exists: ${account.website}`);
        continue;
      }

      // Insert new account
      const { data: newAccount, error: insertError } = await supabase
        .from('accounts')
        .insert({
          agency_id,
          name: account.name,
          website: account.website,
          type: account.type,
          source: 'firecrawl',
          commodities: account.commodities,
          equipment_types: account.equipment_types,
          regions: account.regions,
          contact_email: account.contact_email,
          contact_phone: account.contact_phone,
          mc_number: account.mc_number,
          dot_number: account.dot_number,
        })
        .select()
        .single();

      if (insertError) {
        console.error('Insert error:', insertError);
        errors.push(`Failed to save ${account.name}`);
        continue;
      }

      // Log discovery event
      await supabase.from('account_events').insert({
        account_id: newAccount.id,
        event_type: 'discovered',
        meta: {
          source: 'firecrawl',
          query: query || null,
          commodities_found: account.commodities.length,
          equipment_found: account.equipment_types.length
        }
      });

      savedAccounts.push(newAccount);
    }

    return new Response(
      JSON.stringify({
        success: true,
        discovered: discoveredAccounts.length,
        saved: savedAccounts.length,
        accounts: savedAccounts,
        errors: errors.length > 0 ? errors : undefined
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Discovery error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});