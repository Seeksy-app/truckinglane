import { Tables } from "@/integrations/supabase/types";

type Load = Tables<"loads">;

// Official DAT bulk upload template columns
export const DAT_COLUMNS = [
  "Pickup Earliest*",
  "Pickup Latest",
  "Length (ft)*",
  "Weight (lbs)*",
  "Full/Partial*",
  "Equipment*",
  "Use Private Network*",
  "Private Network Rate",
  "Allow Private Network Booking",
  "Allow Private Network Bidding",
  "Use DAT Loadboard*",
  "DAT Loadboard Rate",
  "Allow DAT Loadboard Booking",
  "Use Extended Network",
  "Contact Method*",
  "Origin City*",
  "Origin State*",
  "Origin Postal Code",
  "Destination City*",
  "Destination State*",
  "Destination Postal Code",
  "Comment",
  "Commodity",
  "Reference ID"
] as const;

// Format date to M/D/YYYY for DAT (no leading zeros)
function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  try {
    const date = new Date(dateStr);
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const year = date.getFullYear();
    return `${month}/${day}/${year}`;
  } catch {
    return "";
  }
}

// Map trailer type to DAT equipment code
function mapEquipmentCode(trailerType: string | null | undefined): string {
  if (!trailerType) return "";
  const type = trailerType.toLowerCase();
  
  // Common mappings - V=Van, R=Reefer, F=Flatbed
  if (type.includes("van") || type.includes("dry")) return "V";
  if (type.includes("reefer") || type.includes("refriger")) return "R";
  if (type.includes("flat") || type.includes("step")) return "F";
  if (type.includes("tanker")) return "T";
  if (type.includes("hopper")) return "HB";
  if (type.includes("lowboy")) return "LB";
  if (type.includes("double")) return "DD";
  if (type.includes("container")) return "C";
  
  // Return original if no mapping found
  return trailerType;
}

// Map a load to DAT row format
function mapLoadToDAT(load: Load): Record<string, string> {
  // Length: use trailer_footage if available, otherwise leave blank
  const lengthValue = load.trailer_footage ? String(load.trailer_footage) : "";
  
  // Commodity logic for Adelphia loads:
  // - If trailer_footage has a value → "rebar"
  // - If trailer_footage is blank/null → "COILS"
  // For other templates, use the commodity field directly
  let commodityValue = load.commodity || "";
  
  // Check if this is an Adelphia load (load_number starts with "ADE-")
  const isAdelphiaLoad = load.load_number?.startsWith("ADE-");
  
  if (isAdelphiaLoad && (!commodityValue || commodityValue === "")) {
    // Infer commodity from trailer_footage for legacy Adelphia loads
    commodityValue = load.trailer_footage ? "rebar" : "COILS";
  }
  
  return {
    "Pickup Earliest*": formatDate(load.ship_date),
    "Pickup Latest": formatDate(load.delivery_date),
    "Length (ft)*": lengthValue,
    "Weight (lbs)*": load.weight_lbs ? String(load.weight_lbs) : "",
    "Full/Partial*": "Full",
    "Equipment*": mapEquipmentCode(load.trailer_type),
    "Use Private Network*": "no",
    "Private Network Rate": "",
    "Allow Private Network Booking": "no",
    "Allow Private Network Bidding": "no",
    "Use DAT Loadboard*": "yes",
    "DAT Loadboard Rate": load.customer_invoice_total ? String(load.customer_invoice_total) : "",
    "Allow DAT Loadboard Booking": "no",
    "Use Extended Network": "no",
    "Contact Method*": "primary phone",
    "Origin City*": load.pickup_city || "",
    "Origin State*": load.pickup_state || "",
    "Origin Postal Code": load.pickup_zip || "",
    "Destination City*": load.dest_city || "",
    "Destination State*": load.dest_state || "",
    "Destination Postal Code": load.dest_zip || "",
    "Comment": load.tarps ? `Tarps: ${load.tarps}` : "",
    "Commodity": commodityValue,
    "Reference ID": load.load_number || ""
  };
}

// Escape CSV field if needed
function escapeField(field: string): string {
  if (field.includes(",") || field.includes('"') || field.includes("\n")) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

// Generate CSV string from loads
export function generateDATCsv(loads: Load[]): string {
  const headerLine = DAT_COLUMNS.map(escapeField).join(",");
  
  const dataLines = loads.map(load => {
    const row = mapLoadToDAT(load);
    return DAT_COLUMNS.map(col => escapeField(row[col] || "")).join(",");
  });

  return [headerLine, ...dataLines].join("\n");
}

// Download the CSV file
export function downloadDATExport(loads: Load[], filename?: string): void {
  const csvContent = generateDATCsv(loads);
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  
  const today = new Date().toISOString().split("T")[0];
  link.download = filename || `DAT_Export_${today}.csv`;
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
