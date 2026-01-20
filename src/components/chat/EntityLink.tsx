import { cn } from "@/lib/utils";
import { Package, User, Truck } from "lucide-react";

export type EntityType = "load" | "lead" | "carrier";

export interface EntityLinkData {
  type: EntityType;
  id: string;
  label: string;
  params?: Record<string, string>;
}

interface EntityLinkProps {
  entity: EntityLinkData;
  onClick?: (entity: EntityLinkData) => void;
  className?: string;
}

const iconMap: Record<EntityType, typeof Package> = {
  load: Package,
  lead: User,
  carrier: Truck,
};

const styleMap: Record<EntityType, string> = {
  load: "bg-blue-500/10 text-blue-700 hover:bg-blue-500/20 border-blue-500/30",
  lead: "bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 border-amber-500/30",
  carrier: "bg-purple-500/10 text-purple-700 hover:bg-purple-500/20 border-purple-500/30",
};

export function EntityLink({ entity, onClick, className }: EntityLinkProps) {
  const Icon = iconMap[entity.type];

  return (
    <button
      onClick={() => onClick?.(entity)}
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-sm font-medium transition-colors cursor-pointer",
        styleMap[entity.type],
        className
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      <span>{entity.label}</span>
    </button>
  );
}

// Regex patterns for detecting entities in text
const LOAD_PATTERN = /Load\s*#?(\d+)/gi;
const DOT_PATTERN = /(?:US)?DOT\s*#?\s*(\d{5,8})/gi;
const MC_PATTERN = /MC\s*#?\s*(\d{5,8})/gi;
const CARRIER_PATTERN = /Carrier:\s*([A-Za-z0-9\s&'.,-]+?)(?=\s*[-–—]|\s*\(|\s*DOT|\s*MC|$)/gi;
// Phone number pattern: +1XXXXXXXXXX or (XXX) XXX-XXXX format at start of line
const PHONE_LEAD_PATTERN = /(\+1\d{10}|\(\d{3}\)\s*\d{3}[- ]?\d{4}|\d{3}[- ]\d{3}[- ]\d{4})(?=:\s*[A-Za-z])/gi;

export interface ParsedTextSegment {
  type: "text" | "entity";
  content: string;
  entity?: EntityLinkData;
}

export function parseTextForEntities(text: string): ParsedTextSegment[] {
  if (!text) return [];
  
  const segments: ParsedTextSegment[] = [];
  let lastIndex = 0;
  
  // Collect all matches with their positions
  const matches: { start: number; end: number; entity: EntityLinkData }[] = [];
  
  // Find loads
  let match;
  while ((match = LOAD_PATTERN.exec(text)) !== null) {
    matches.push({
      start: match.index,
      end: match.index + match[0].length,
      entity: {
        type: "load",
        id: match[1],
        label: `Load #${match[1]}`,
      },
    });
  }
  
  // Find DOT numbers
  while ((match = DOT_PATTERN.exec(text)) !== null) {
    matches.push({
      start: match.index,
      end: match.index + match[0].length,
      entity: {
        type: "carrier",
        id: match[1],
        label: `DOT #${match[1]}`,
        params: { usdot: match[1] },
      },
    });
  }
  
  // Find MC numbers
  while ((match = MC_PATTERN.exec(text)) !== null) {
    matches.push({
      start: match.index,
      end: match.index + match[0].length,
      entity: {
        type: "carrier",
        id: match[1],
        label: `MC #${match[1]}`,
        params: { mc: match[1] },
      },
    });
  }
  
  // Find carrier names
  while ((match = CARRIER_PATTERN.exec(text)) !== null) {
    const carrierName = match[1].trim();
    if (carrierName.length > 2) {
      matches.push({
        start: match.index,
        end: match.index + match[0].length,
        entity: {
          type: "carrier",
          id: carrierName,
          label: `Carrier: ${carrierName}`,
          params: { name: carrierName },
        },
      });
    }
  }
  
  // Find phone leads (phone: description format)
  while ((match = PHONE_LEAD_PATTERN.exec(text)) !== null) {
    const phone = match[1];
    matches.push({
      start: match.index,
      end: match.index + match[0].length,
      entity: {
        type: "lead",
        id: phone.replace(/\D/g, ""), // Store normalized phone
        label: phone,
        params: { phone },
      },
    });
  }
  
  // Sort by position and remove overlaps
  matches.sort((a, b) => a.start - b.start);
  const filteredMatches = matches.filter((m, i) => {
    if (i === 0) return true;
    return m.start >= matches[i - 1].end;
  });
  
  // Build segments
  for (const m of filteredMatches) {
    if (m.start > lastIndex) {
      segments.push({ type: "text", content: text.slice(lastIndex, m.start) });
    }
    segments.push({ type: "entity", content: text.slice(m.start, m.end), entity: m.entity });
    lastIndex = m.end;
  }
  
  if (lastIndex < text.length) {
    segments.push({ type: "text", content: text.slice(lastIndex) });
  }
  
  return segments.length > 0 ? segments : [{ type: "text", content: text }];
}
