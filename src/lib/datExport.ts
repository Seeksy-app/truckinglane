import { Tables } from "@/integrations/supabase/types";

type Load = Tables<"loads">;

// DAT template column structure - hardcoded mapping from TruckingLane loads
export const DAT_COLUMNS = [
  "Origin City",
  "Origin State", 
  "Origin Zip",
  "Destination City",
  "Destination State",
  "Destination Zip",
  "Date Available",
  "Equipment Type",
  "Length (ft)",
  "Weight (lbs)",
  "Reference Number",
  "Rate",
  "Commodity",
  "Miles",
  "Comments"
] as const;

// Format date to MM/DD/YYYY for DAT
function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  try {
    const date = new Date(dateStr);
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const year = date.getFullYear();
    return `${month}/${day}/${year}`;
  } catch {
    return "";
  }
}

// Map a load to DAT row format
function mapLoadToDAT(load: Load): Record<string, string> {
  return {
    "Origin City": load.pickup_city || "",
    "Origin State": load.pickup_state || "",
    "Origin Zip": load.pickup_zip || "",
    "Destination City": load.dest_city || "",
    "Destination State": load.dest_state || "",
    "Destination Zip": load.dest_zip || "",
    "Date Available": formatDate(load.ship_date),
    "Equipment Type": load.trailer_type || "",
    "Length (ft)": load.trailer_footage ? String(load.trailer_footage) : "",
    "Weight (lbs)": load.weight_lbs ? String(load.weight_lbs) : "",
    "Reference Number": load.load_number || "",
    "Rate": load.customer_invoice_total ? String(load.customer_invoice_total) : "",
    "Commodity": load.commodity || "",
    "Miles": load.miles || "",
    "Comments": load.tarps ? `Tarps: ${load.tarps}` : ""
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
