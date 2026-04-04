import type { Tables } from "@/integrations/supabase/types";

export type ShipmentStatus = Tables<"shipments">["status"];

export const SHIPMENT_EQUIPMENT_TYPES = [
  "Flatbed",
  "Van",
  "Reefer",
  "Step Deck",
  "RGN",
  "Lowboy",
  "Flatbed/Step Deck",
] as const;

export const RATE_TYPES = ["flat", "per_mile", "per_ton"] as const;
export type RateType = (typeof RATE_TYPES)[number];

export const RATE_TYPE_LABELS: Record<RateType, string> = {
  flat: "Flat Rate",
  per_mile: "Per Mile",
  per_ton: "Per Ton",
};

export const SHIPMENT_STATUS_PILLS: { id: ShipmentStatus | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "new", label: "New" },
  { id: "dispatched", label: "Dispatched" },
  { id: "in_transit", label: "In Transit" },
  { id: "delivered", label: "Delivered" },
  { id: "covered", label: "Covered" },
];

export function shipmentStatusBadgeClass(status: string): string {
  switch (status) {
    case "new":
      return "bg-[#F3F4F6] text-[#374151] border-[#E5E7EB]";
    case "dispatched":
      return "bg-[#EFF6FF] text-[#1D4ED8] border-[#BFDBFE]";
    case "in_transit":
      return "bg-[#FFF7ED] text-[#C2410C] border-[#FDBA74]";
    case "delivered":
      return "bg-[#ECFDF5] text-[#047857] border-[#A7F3D0]";
    case "covered":
      return "bg-[#14532D] text-white border-[#14532D]";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

export function shipmentStatusLabel(status: string): string {
  switch (status) {
    case "new":
      return "New";
    case "dispatched":
      return "Dispatched";
    case "in_transit":
      return "In Transit";
    case "delivered":
      return "Delivered";
    case "covered":
      return "Covered";
    default:
      return status;
  }
}

export const TIMELINE_FIELDS = [
  { label: "Created", key: "created_at", readonly: true },
  { label: "Conf Sent", key: "conf_sent_at", readonly: false },
  { label: "Dispatched", key: "dispatched_at", readonly: false },
  { label: "Loaded", key: "loaded_at", readonly: false },
  { label: "Arrived PU", key: "arrived_pickup_at", readonly: false },
  { label: "In Transit", key: "in_transit_at", readonly: false },
  { label: "Arrived Cons", key: "arrived_consignee_at", readonly: false },
  { label: "Delivered", key: "delivered_at", readonly: false },
] as const;
