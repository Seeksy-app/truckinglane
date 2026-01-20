// US State name to abbreviation mapping
export const STATE_NAMES_TO_ABBR: Record<string, string> = {
  alabama: "AL",
  alaska: "AK",
  arizona: "AZ",
  arkansas: "AR",
  california: "CA",
  colorado: "CO",
  connecticut: "CT",
  delaware: "DE",
  florida: "FL",
  georgia: "GA",
  hawaii: "HI",
  idaho: "ID",
  illinois: "IL",
  indiana: "IN",
  iowa: "IA",
  kansas: "KS",
  kentucky: "KY",
  louisiana: "LA",
  maine: "ME",
  maryland: "MD",
  massachusetts: "MA",
  michigan: "MI",
  minnesota: "MN",
  mississippi: "MS",
  missouri: "MO",
  montana: "MT",
  nebraska: "NE",
  nevada: "NV",
  "new hampshire": "NH",
  "new jersey": "NJ",
  "new mexico": "NM",
  "new york": "NY",
  "north carolina": "NC",
  "north dakota": "ND",
  ohio: "OH",
  oklahoma: "OK",
  oregon: "OR",
  pennsylvania: "PA",
  "rhode island": "RI",
  "south carolina": "SC",
  "south dakota": "SD",
  tennessee: "TN",
  texas: "TX",
  utah: "UT",
  vermont: "VT",
  virginia: "VA",
  washington: "WA",
  "west virginia": "WV",
  wisconsin: "WI",
  wyoming: "WY",
  "district of columbia": "DC",
};

export const STATE_ABBR_TO_NAME: Record<string, string> = Object.fromEntries(
  Object.entries(STATE_NAMES_TO_ABBR).map(([name, abbr]) => [abbr.toLowerCase(), name])
);

// Get state abbreviation from name or return the input if already an abbreviation
export function normalizeStateSearch(input: string): string[] {
  const lower = input.toLowerCase().trim();
  
  // Check if it's a full state name
  if (STATE_NAMES_TO_ABBR[lower]) {
    return [lower, STATE_NAMES_TO_ABBR[lower].toLowerCase()];
  }
  
  // Check if it's a state abbreviation (2 letters) - return both the abbr and full name for matching
  if (lower.length === 2 && STATE_ABBR_TO_NAME[lower]) {
    return [lower, STATE_ABBR_TO_NAME[lower]];
  }
  
  // Check for partial state name matches
  const partialMatches: string[] = [];
  for (const [name, abbr] of Object.entries(STATE_NAMES_TO_ABBR)) {
    if (name.includes(lower)) {
      partialMatches.push(abbr.toLowerCase());
    }
  }
  
  if (partialMatches.length > 0) {
    return [lower, ...partialMatches];
  }
  
  return [lower];
}

// Get suggestions for search input
export function getSearchSuggestions(
  input: string,
  loads: Array<{
    load_number?: string;
    pickup_city?: string | null;
    pickup_state?: string | null;
    dest_city?: string | null;
    dest_state?: string | null;
  }>,
  maxResults = 8
): Array<{ type: "state" | "city" | "load"; value: string; label: string }> {
  if (!input.trim()) return [];
  
  const lower = input.toLowerCase().trim();
  const suggestions: Array<{ type: "state" | "city" | "load"; value: string; label: string }> = [];
  const seen = new Set<string>();
  
  // Check for state name matches
  for (const [name, abbr] of Object.entries(STATE_NAMES_TO_ABBR)) {
    if (name.startsWith(lower) || abbr.toLowerCase() === lower) {
      const key = `state:${abbr}`;
      if (!seen.has(key)) {
        seen.add(key);
        suggestions.push({
          type: "state",
          value: abbr,
          label: `${name.charAt(0).toUpperCase() + name.slice(1)} (${abbr})`,
        });
      }
    }
  }
  
  // Check for city matches from loads
  for (const load of loads) {
    // Pickup city
    if (load.pickup_city?.toLowerCase().includes(lower)) {
      const key = `city:${load.pickup_city}, ${load.pickup_state}`;
      if (!seen.has(key)) {
        seen.add(key);
        suggestions.push({
          type: "city",
          value: load.pickup_city,
          label: `${load.pickup_city}, ${load.pickup_state}`,
        });
      }
    }
    
    // Dest city
    if (load.dest_city?.toLowerCase().includes(lower)) {
      const key = `city:${load.dest_city}, ${load.dest_state}`;
      if (!seen.has(key)) {
        seen.add(key);
        suggestions.push({
          type: "city",
          value: load.dest_city,
          label: `${load.dest_city}, ${load.dest_state}`,
        });
      }
    }
    
    // Load number
    if (load.load_number?.toLowerCase().includes(lower)) {
      const key = `load:${load.load_number}`;
      if (!seen.has(key)) {
        seen.add(key);
        suggestions.push({
          type: "load",
          value: load.load_number,
          label: `Load #${load.load_number}`,
        });
      }
    }
  }
  
  return suggestions.slice(0, maxResults);
}
