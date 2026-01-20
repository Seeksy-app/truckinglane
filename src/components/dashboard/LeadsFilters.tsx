import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search } from "lucide-react";

type LeadStatus = "pending" | "claimed" | "booked" | "closed";

interface LeadsFiltersProps {
  statusFilter: LeadStatus | "all";
  onStatusChange: (status: LeadStatus | "all") => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export const LeadsFilters = ({
  statusFilter,
  onStatusChange,
  searchQuery,
  onSearchChange,
}: LeadsFiltersProps) => {
  const statuses: { value: LeadStatus | "all"; label: string }[] = [
    { value: "all", label: "All" },
    { value: "pending", label: "Lead" },
    { value: "claimed", label: "Claimed" },
    { value: "booked", label: "Booked" },
    { value: "closed", label: "Closed" },
  ];

  return (
    <div className="flex flex-col sm:flex-row gap-4 mb-6">
      <div className="relative flex-1 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by name, phone, or company..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-10"
        />
      </div>
      
      <div className="flex gap-2">
        {statuses.map((status) => (
          <Button
            key={status.value}
            variant={statusFilter === status.value ? "default" : "outline"}
            size="sm"
            onClick={() => onStatusChange(status.value)}
          >
            {status.label}
          </Button>
        ))}
      </div>
    </div>
  );
};
