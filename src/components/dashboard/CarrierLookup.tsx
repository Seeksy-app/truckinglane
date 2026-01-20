import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Search, Truck, AlertCircle, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { CarrierIntelligenceCard } from "./CarrierIntelligenceCard";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface CarrierData {
  ok: boolean;
  carrier: {
    usdot: string;
    mc?: string;
    name: string;
    authority_status: string;
    insurance_status: string;
    safety_rating: string;
    power_units: number;
    drivers: number;
    out_of_service?: boolean;
    location?: {
      city?: string;
      state?: string;
    };
  };
  ai_activity?: {
    total_calls: number;
    completed_calls: number;
    callback_requested: number;
    declined: number;
    avg_call_duration_secs: number;
    sentiment_breakdown: {
      positive: number;
      neutral: number;
      negative: number;
    };
  };
  ai_insights: {
    risk_score: number;
    recommended_action: string;
    conversion_likelihood: number;
  };
  verified_badge?: {
    status: 'verified' | 'warning' | 'danger';
    message: string;
  };
  last_call_outcome?: string;
  last_call_at?: string;
  cached?: boolean;
  multiple_results?: Array<{
    usdot: string;
    name: string;
    dba_name?: string;
    city?: string;
    state?: string;
    mc?: string;
  }>;
}

interface ErrorResponse {
  ok: false;
  code: string;
  message: string;
  debug_id: string;
}

interface CarrierLookupProps {
  agencyId: string | null;
}

export function CarrierLookup({ agencyId }: CarrierLookupProps) {
  const [searchValue, setSearchValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [carrierData, setCarrierData] = useState<CarrierData | null>(null);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [multipleResults, setMultipleResults] = useState<CarrierData['multiple_results'] | null>(null);

  // Detect search type from input
  const detectSearchType = (value: string): 'dot' | 'mc' | 'name' => {
    const trimmed = value.trim().toUpperCase();
    
    // Check for explicit prefixes
    if (trimmed.startsWith('DOT') || trimmed.startsWith('USDOT')) {
      return 'dot';
    }
    if (trimmed.startsWith('MC')) {
      return 'mc';
    }
    
    // Check if it's a pure number (5-8 digits = likely DOT)
    const digitsOnly = trimmed.replace(/\D/g, '');
    if (digitsOnly.length >= 5 && digitsOnly.length <= 8 && /^\d+$/.test(trimmed)) {
      return 'dot';
    }
    
    // If it has letters, it's a name search
    return 'name';
  };

  // Extract the actual value to search
  const extractSearchValue = (value: string, type: 'dot' | 'mc' | 'name'): string => {
    const trimmed = value.trim();
    
    if (type === 'dot') {
      // Remove DOT/USDOT prefix and get digits
      return trimmed.replace(/^(US)?DOT\s*/i, '').replace(/\D/g, '');
    }
    if (type === 'mc') {
      // Remove MC prefix and get digits
      return trimmed.replace(/^MC\s*/i, '').replace(/\D/g, '');
    }
    return trimmed;
  };

  const handleLookup = async (overrideUsdot?: string) => {
    const valueToSearch = overrideUsdot || searchValue.trim();
    if (!valueToSearch) {
      toast.error("Please enter a DOT #, MC #, or company name");
      return;
    }

    setLoading(true);
    setCarrierData(null);
    setError(null);
    setMultipleResults(null);

    try {
      const body: Record<string, string | null> = { agency_id: agencyId };
      
      if (overrideUsdot) {
        body.usdot = overrideUsdot;
      } else {
        const searchType = detectSearchType(valueToSearch);
        const cleanValue = extractSearchValue(valueToSearch, searchType);
        
        if (searchType === 'dot') {
          body.usdot = cleanValue;
        } else if (searchType === 'mc') {
          body.mc = cleanValue;
        } else {
          body.company_name = cleanValue;
        }
      }

      const { data, error: invokeError } = await supabase.functions.invoke("carrier-lookup", {
        body,
      });

      if (invokeError) throw invokeError;

      // Check for error response
      if (data && !data.ok) {
        const errData = data as ErrorResponse;
        setError({ code: errData.code, message: errData.message });
        
        // Show user-friendly error messages
        const messages: Record<string, string> = {
          'FMCSA_401': 'Invalid FMCSA API key. Please contact support.',
          'FMCSA_404': 'Carrier not found. Check the number and try again.',
          'FMCSA_5XX': 'FMCSA server is temporarily unavailable. Try again later.',
          'FMCSA_TIMEOUT': 'Request timed out. Please try again.',
          'NETWORK': 'Network error. Check your connection.',
        };
        toast.error(messages[errData.code] || errData.message);
        return;
      }

      const result = data as CarrierData;
      setCarrierData(result);
      
      // If name search returned multiple results, show picker
      if (result.multiple_results && result.multiple_results.length > 1) {
        setMultipleResults(result.multiple_results);
      }
      
      if (result.cached) {
        toast.info("Loaded from cache");
      }
    } catch (err) {
      console.error("Carrier lookup error:", err);
      setError({ code: 'UNKNOWN', message: 'Failed to lookup carrier' });
      toast.error("Failed to lookup carrier");
    } finally {
      setLoading(false);
    }
  };

  const handleSelectCarrier = (usdot: string) => {
    setMultipleResults(null);
    handleLookup(usdot);
  };

  // Transform API response to CarrierIntelligence format
  const transformedCarrier = carrierData ? {
    usdot: carrierData.carrier.usdot,
    mc: carrierData.carrier.mc,
    carrier_name: carrierData.carrier.name,
    fmcsa_data: {
      authority_status: carrierData.carrier.authority_status,
      insurance_status: carrierData.carrier.insurance_status,
      safety_rating: carrierData.carrier.safety_rating,
      power_units: carrierData.carrier.power_units,
      drivers: carrierData.carrier.drivers,
      out_of_service: carrierData.carrier.out_of_service,
    },
    ai_activity: carrierData.ai_activity || {
      total_calls: 0,
      completed_calls: 0,
      callback_requested: 0,
      declined: 0,
      avg_call_duration_secs: 0,
      sentiment_breakdown: { positive: 0, neutral: 0, negative: 0 },
    },
    ai_insights: {
      conversion_likelihood: carrierData.ai_insights.conversion_likelihood || 0,
      risk_score: carrierData.ai_insights.risk_score,
      recommended_action: carrierData.ai_insights.recommended_action,
    },
    verified_badge: carrierData.verified_badge,
    last_call_outcome: carrierData.last_call_outcome || null,
    last_call_at: carrierData.last_call_at || null,
  } : null;

  return (
    <div className="space-y-4">
      {/* Unified Search Input */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Truck className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="DOT #, MC #, or company name..."
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleLookup()}
            className="pl-9"
          />
        </div>
        <Button onClick={() => handleLookup()} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
        </Button>
      </div>

      {/* Error Display */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {error.message}
            {error.code && error.code !== 'UNKNOWN' && (
              <span className="text-xs ml-2 opacity-70">({error.code})</span>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* Multiple Results Picker */}
      {multipleResults && multipleResults.length > 1 && (
        <div className="border rounded-lg bg-card overflow-hidden">
          <div className="px-4 py-2 bg-muted/50 border-b">
            <p className="text-sm font-medium">Multiple carriers found - select one:</p>
          </div>
          <div className="divide-y">
            {multipleResults.map((result) => (
              <button
                key={result.usdot}
                onClick={() => handleSelectCarrier(result.usdot)}
                className="w-full px-4 py-3 text-left hover:bg-muted/50 transition-colors flex items-center justify-between group"
              >
                <div>
                  <p className="font-medium">{result.dba_name || result.name}</p>
                  <p className="text-sm text-muted-foreground">
                    DOT: {result.usdot}
                    {result.mc && ` • MC: ${result.mc}`}
                    {result.city && result.state && ` • ${result.city}, ${result.state}`}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Carrier Intelligence Card */}
      {transformedCarrier && !multipleResults && (
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
          <CarrierIntelligenceCard carrier={transformedCarrier} />
        </div>
      )}

      {/* Empty state */}
      {!loading && !carrierData && !error && (
        <div className="text-center py-8 text-muted-foreground">
          <Truck className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Enter DOT, MC, or company name to verify carrier</p>
        </div>
      )}
    </div>
  );
}
