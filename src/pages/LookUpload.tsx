import { useMemo, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { useLoads } from "@/hooks/useLoads";
import { LookUploadTable } from "@/components/loads/LookUploadTable";
import { SmartSearchInput } from "@/components/dashboard/SmartSearchInput";
import { normalizeStateSearch } from "@/lib/stateMapping";
import { useAuth } from "@/hooks/useAuth";

const LookUpload = () => {
  const { user } = useAuth();
  const { loads, loading, refetch } = useLoads();
  const [searchQuery, setSearchQuery] = useState("");

  // Same filtering logic as Dashboard's filteredOpenLoads
  const filteredOpenLoads = useMemo(() => {
    let result = loads.filter((l) => l.status === "open" && l.is_active);

    if (searchQuery.trim()) {
      const searchTerms = normalizeStateSearch(searchQuery);
      const isStateAbbr = searchQuery.trim().length === 2 && /^[a-zA-Z]{2}$/.test(searchQuery.trim());
      result = result.filter((l) => {
        const loadNumber = l.load_number?.toLowerCase() || "";
        const pickupCity = l.pickup_city?.toLowerCase().trim() || "";
        const pickupState = l.pickup_state?.toLowerCase().trim() || "";
        const destCity = l.dest_city?.toLowerCase().trim() || "";
        const destState = l.dest_state?.toLowerCase().trim() || "";
        return searchTerms.some((term) => {
          if (isStateAbbr && term.length === 2) {
            return pickupState === term || destState === term;
          }
          return (
            loadNumber.includes(term) ||
            pickupCity.includes(term) ||
            pickupState.includes(term) ||
            destCity.includes(term) ||
            destState.includes(term)
          );
        });
      });
    }
    return result;
  }, [loads, searchQuery]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <AppHeader />
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-serif font-semibold">Open Loads</h1>
        </div>

        {/* Search bar - same as Dashboard */}
        <div className="mb-4">
          <SmartSearchInput
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search load #, city, state..."
            loads={loads}
          />
        </div>

        {/* Open Loads Table */}
        <LookUploadTable loads={filteredOpenLoads} loading={loading} onRefresh={refetch} />
      </main>
    </div>
  );
};

export default LookUpload;
