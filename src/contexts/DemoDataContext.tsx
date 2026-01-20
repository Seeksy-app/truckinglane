import { createContext, useContext, ReactNode } from "react";
import type { Tables } from "@/integrations/supabase/types";

type Load = Tables<"loads">;
type Lead = Tables<"leads">;
type PhoneCall = Tables<"phone_calls">;

// Demo data generator
const generateDemoLoads = (): Load[] => {
  const trailerTypes = ["Flatbed", "Van", "Reefer", "Step Deck", "Lowboy", "Hopper"];
  const cities = [
    { city: "Dallas", state: "TX" },
    { city: "Houston", state: "TX" },
    { city: "Phoenix", state: "AZ" },
    { city: "Los Angeles", state: "CA" },
    { city: "Denver", state: "CO" },
    { city: "Chicago", state: "IL" },
    { city: "Atlanta", state: "GA" },
    { city: "Miami", state: "FL" },
    { city: "Seattle", state: "WA" },
    { city: "Nashville", state: "TN" },
    { city: "Kansas City", state: "MO" },
    { city: "Omaha", state: "NE" },
  ];
  const commodities = ["Steel Coils", "Lumber", "Machinery", "Building Materials", "Pipe", "Equipment", "Grain", "Fertilizer"];
  
  const loads: Load[] = [];
  const today = new Date();
  
  for (let i = 0; i < 24; i++) {
    const pickup = cities[Math.floor(Math.random() * cities.length)];
    let dest = cities[Math.floor(Math.random() * cities.length)];
    while (dest.city === pickup.city) {
      dest = cities[Math.floor(Math.random() * cities.length)];
    }
    
    const isPerTon = Math.random() > 0.7;
    const rate = isPerTon ? Math.floor(Math.random() * 30) + 15 : Math.floor(Math.random() * 3000) + 2000;
    const weight = Math.floor(Math.random() * 30000) + 20000;
    const customerInvoice = isPerTon ? rate * (weight / 2000) : rate;
    const targetPay = Math.floor(customerInvoice * 0.8);
    const maxPay = Math.floor(customerInvoice * 0.85);
    
    const shipDate = new Date(today);
    shipDate.setDate(shipDate.getDate() + Math.floor(Math.random() * 7));
    
    const status = i < 18 ? "open" : i < 22 ? "booked" : "closed";
    
    loads.push({
      id: `demo-load-${i}`,
      agency_id: "demo-agency",
      template_type: Math.random() > 0.5 ? "aljex_flat" : "adelphia_xlsx",
      load_number: `PRO-${String(10000 + i).padStart(5, "0")}`,
      trailer_type: trailerTypes[Math.floor(Math.random() * trailerTypes.length)],
      dispatch_status: null,
      status,
      ship_date: shipDate.toISOString().split("T")[0],
      delivery_date: null,
      pickup_city: pickup.city,
      pickup_state: pickup.state,
      pickup_zip: null,
      pickup_location_raw: null,
      dest_city: dest.city,
      dest_state: dest.state,
      dest_zip: null,
      dest_location_raw: null,
      trailer_footage: Math.floor(Math.random() * 20) + 30,
      tarps: Math.random() > 0.7 ? "Yes" : null,
      tarp_size: Math.random() > 0.8 ? "8ft" : null,
      tarp_required: Math.random() > 0.7,
      commodity: commodities[Math.floor(Math.random() * commodities.length)],
      miles: String(Math.floor(Math.random() * 1500) + 300),
      weight_lbs: weight,
      rate_raw: rate,
      is_per_ton: isPerTon,
      customer_invoice_total: customerInvoice,
      target_pay: targetPay,
      max_pay: maxPay,
      target_commission: customerInvoice - targetPay,
      max_commission: customerInvoice - maxPay,
      commission_target_pct: 0.2,
      commission_max_pct: 0.15,
      is_active: status !== "closed",
      is_high_intent: Math.random() > 0.8,
      board_date: today.toISOString().split("T")[0],
      archived_at: null,
      claimed_at: null,
      claimed_by: null,
      booked_at: status === "booked" ? new Date().toISOString() : null,
      booked_by: status === "booked" ? "demo-user" : null,
      booked_source: status === "booked" ? (Math.random() > 0.5 ? "ai" : "manual") : null,
      booked_call_id: null,
      booked_lead_id: null,
      closed_at: status === "closed" ? new Date().toISOString() : null,
      close_reason: status === "closed" ? "covered" : null,
      load_call_script: null,
      source_row: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }
  
  return loads;
};

const generateDemoLeads = (): Lead[] => {
  const names = [
    "Mike Rodriguez", "Sarah Johnson", "David Chen", "Lisa Martinez",
    "James Wilson", "Amanda Taylor", "Robert Brown", "Jennifer Garcia",
    "William Davis", "Emily Thompson", "Carlos Hernandez", "Jessica Lee"
  ];
  const companies = [
    "Swift Logistics", "Prime Carriers", "Werner Trucking", "J.B. Hunt",
    "Landstar", "Schneider", "XPO Logistics", "Old Dominion", "Saia LTL",
    "R+L Carriers", "ABF Freight", "Estes Express"
  ];
  
  const leads: Lead[] = [];
  const today = new Date();
  
  for (let i = 0; i < 16; i++) {
    const createdAt = new Date(today);
    createdAt.setHours(createdAt.getHours() - Math.floor(Math.random() * 48));
    
    const status: "pending" | "claimed" | "booked" | "closed" = 
      i < 6 ? "pending" : i < 10 ? "claimed" : i < 14 ? "booked" : "closed";
    
    // Randomly assign Aldelphia tags for demo
    const isAldelphia = Math.random() > 0.6;
    
    leads.push({
      id: `demo-lead-${i}`,
      agency_id: "demo-agency",
      caller_name: names[Math.floor(Math.random() * names.length)],
      caller_phone: `+1${String(Math.floor(Math.random() * 9000000000) + 1000000000)}`,
      caller_company: companies[Math.floor(Math.random() * companies.length)],
      status,
      intent_score: Math.floor(Math.random() * 40) + 60,
      is_high_intent: Math.random() > 0.6,
      claimed_by: status !== "pending" ? "demo-user" : null,
      claimed_at: status !== "pending" ? new Date().toISOString() : null,
      booked_by: status === "booked" ? "demo-user" : null,
      booked_at: status === "booked" ? new Date().toISOString() : null,
      closed_at: status === "closed" ? new Date().toISOString() : null,
      load_id: `demo-load-${i % 10}`,
      conversation_id: `demo-conv-${i}`,
      phone_call_id: `demo-call-${i}`,
      notes: "Caller inquired about availability for the Dallas to Chicago lane. Interested in long-term contract.",
      created_at: createdAt.toISOString(),
      updated_at: new Date().toISOString(),
      close_reason: status === "closed" ? "Rate too low" : null,
      callback_requested_at: null,
      last_contact_attempt_at: null,
      resolved_at: status === "booked" || status === "closed" ? new Date().toISOString() : null,
      carrier_usdot: null,
      carrier_mc: null,
      carrier_name: null,
      carrier_verified_at: null,
      intent_reason_breakdown: [],
      follow_up_status: status === "claimed" ? (i % 2 === 0 ? "contacted_waiting" : null) : null,
      // Aldelphia tags
      shipper: isAldelphia ? "Aldelphia" : null,
      equipment_type: isAldelphia ? "flatbed" : (Math.random() > 0.7 ? "not_flatbed" : null),
    });
  }
  
  return leads;
};

const generateDemoCalls = (): PhoneCall[] => {
  const calls: PhoneCall[] = [];
  const today = new Date();
  
  for (let i = 0; i < 12; i++) {
    const createdAt = new Date(today);
    createdAt.setMinutes(createdAt.getMinutes() - Math.floor(Math.random() * 480));
    
    const duration = Math.floor(Math.random() * 300) + 30;
    const endedAt = new Date(createdAt);
    endedAt.setSeconds(endedAt.getSeconds() + duration);
    
    calls.push({
      id: `demo-call-${i}`,
      agency_id: "demo-agency",
      caller_phone: `+1${String(Math.floor(Math.random() * 9000000000) + 1000000000)}`,
      receiver_phone: "+18005551234",
      call_status: i < 11 ? "completed" : "in_progress",
      duration_seconds: i < 11 ? duration : null,
      call_started_at: createdAt.toISOString(),
      call_ended_at: i < 11 ? endedAt.toISOString() : null,
      twilio_call_sid: `CA${Math.random().toString(36).substring(2, 15)}`,
      elevenlabs_call_id: `el-${Math.random().toString(36).substring(2, 15)}`,
      carrier_usdot: null,
      created_at: createdAt.toISOString(),
      updated_at: new Date().toISOString(),
    });
  }
  
  return calls.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
};

interface DemoDataContextType {
  loads: Load[];
  leads: Lead[];
  calls: PhoneCall[];
  isDemo: true;
}

const DemoDataContext = createContext<DemoDataContextType | null>(null);

export function DemoDataProvider({ children }: { children: ReactNode }) {
  const demoData: DemoDataContextType = {
    loads: generateDemoLoads(),
    leads: generateDemoLeads(),
    calls: generateDemoCalls(),
    isDemo: true,
  };

  return (
    <DemoDataContext.Provider value={demoData}>
      {children}
    </DemoDataContext.Provider>
  );
}

export function useDemoData() {
  const context = useContext(DemoDataContext);
  if (!context) {
    throw new Error("useDemoData must be used within a DemoDataProvider");
  }
  return context;
}
