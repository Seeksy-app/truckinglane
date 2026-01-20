import { useState, useRef, useEffect, useMemo } from "react";
import { Search, MapPin, Hash, Map, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { getSearchSuggestions } from "@/lib/stateMapping";
import { cn } from "@/lib/utils";

interface SmartSearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  loads?: Array<{
    load_number?: string;
    pickup_city?: string | null;
    pickup_state?: string | null;
    dest_city?: string | null;
    dest_state?: string | null;
  }>;
}

export function SmartSearchInput({
  value,
  onChange,
  placeholder = "Search load #, city, state...",
  loads = [],
}: SmartSearchInputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const suggestions = useMemo(() => {
    return getSearchSuggestions(value, loads);
  }, [value, loads]);

  const showDropdown = isFocused && suggestions.length > 0;

  useEffect(() => {
    setHighlightedIndex(-1);
  }, [value]);

  const handleSelect = (suggestionValue: string) => {
    onChange(suggestionValue);
    setIsFocused(false);
    inputRef.current?.blur();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showDropdown) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev < suggestions.length - 1 ? prev + 1 : 0
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev > 0 ? prev - 1 : suggestions.length - 1
        );
        break;
      case "Enter":
        e.preventDefault();
        if (highlightedIndex >= 0 && suggestions[highlightedIndex]) {
          handleSelect(suggestions[highlightedIndex].value);
        }
        break;
      case "Escape":
        e.preventDefault();
        setIsFocused(false);
        break;
    }
  };

  const getIcon = (type: "state" | "city" | "load") => {
    switch (type) {
      case "state":
        return <Map className="h-4 w-4 text-blue-500" />;
      case "city":
        return <MapPin className="h-4 w-4 text-emerald-500" />;
      case "load":
        return <Hash className="h-4 w-4 text-amber-500" />;
    }
  };

  return (
    <div className="relative flex-1">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none z-10" />
      <Input
        ref={inputRef}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => {
          // Delay to allow click on suggestion
          setTimeout(() => setIsFocused(false), 150);
        }}
        onKeyDown={handleKeyDown}
        className="pl-10 pr-8 bg-card border-border"
      />
      {value && (
        <button
          onClick={() => onChange("")}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          type="button"
        >
          <X className="h-4 w-4" />
        </button>
      )}

      {/* Suggestions Dropdown */}
      {showDropdown && (
        <div
          ref={dropdownRef}
          className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg z-50 overflow-hidden"
        >
          <div className="py-1">
            <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Suggestions
            </div>
            {suggestions.map((suggestion, index) => (
              <button
                key={`${suggestion.type}-${suggestion.value}`}
                type="button"
                onClick={() => handleSelect(suggestion.value)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2 text-left transition-colors",
                  highlightedIndex === index
                    ? "bg-accent text-accent-foreground"
                    : "hover:bg-muted"
                )}
              >
                {getIcon(suggestion.type)}
                <span className="text-sm">{suggestion.label}</span>
                <span className="ml-auto text-xs text-muted-foreground capitalize">
                  {suggestion.type}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
