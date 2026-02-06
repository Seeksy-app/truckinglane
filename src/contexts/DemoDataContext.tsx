import {
  createContext,
  useContext,
  ReactNode,
  useEffect,
  useState,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type Load = Tables<"demo_loads">;
type Lead = Tables<"leads">;
type PhoneCall = Tables<"phone_calls">;

// Demo data generators (unchanged)
const generateDemoLeads = (): Lead[] => {
  const names = [
    "Mike Rodriguez",
    "Sarah Johnson",
    "David Chen",
    "Lisa Martinez",
    "James Wilson",
    "Amanda Taylor",
    "Robert Brown",
    "Jennifer Garcia",
    "William Davis",
    "Emily Thompson",
    "Carlos Hernandez",
    "Jessica Lee",
  ];
  const companies = [
    "Swift Logistics",
    "Prime Carriers",
    "Werner Trucking",
    "J.B. Hunt",
    "Landstar",
    "Schneider",
    "XPO Logistics",
    "Old Dominion",
    "Saia LTL",
    "R+L Carriers",
    "ABF Freight",
    "Estes Express",
  ];

  const leads: Lead[] = [];
  const today = new Date();

  for (let i = 0; i < 16; i++) {
    const createdAt = new Date(today);
    createdAt.setHours(createdAt.getHours() - Math.floor(Math.random() * 48));

    const status: "pending" | "claimed" | "booked" | "closed" =
      i < 6 ? "pending" : i < 10 ? "claimed" : i < 14 ? "booked" : "closed";

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
      notes:
        "Caller inquired about availability for the Dallas to Chicago lane. Interested in long-term contract.",
      created_at: createdAt.toISOString(),
      updated_at: new Date().toISOString(),
      close_reason: status === "closed" ? "Rate too low" : null,
      callback_requested_at: null,
      last_contact_attempt_at: null,
      resolved_at:
        status === "booked" || status === "closed"
          ? new Date().toISOString()
          : null,
      carrier_usdot: null,
      carrier_mc: null,
      carrier_name: null,
      carrier_verified_at: null,
      intent_reason_breakdown: [],
      follow_up_status:
        status === "claimed"
          ? i % 2 === 0
            ? "contacted_waiting"
            : null
          : null,
      shipper: isAldelphia ? "Aldelphia" : null,
      equipment_type: isAldelphia
        ? "flatbed"
        : Math.random() > 0.7
          ? "not_flatbed"
          : null,
    });
  }

  return leads;
};

const generateDemoCalls = (): PhoneCall[] => {
  const calls: PhoneCall[] = [];
  const today = new Date();

  for (let i = 0; i < 12; i++) {
    const createdAt = new Date(today);
    createdAt.setMinutes(
      createdAt.getMinutes() - Math.floor(Math.random() * 480),
    );

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

  return calls.sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
};

// Context type
interface DemoDataContextType {
  loads: Load[];
  leads: Lead[];
  calls: PhoneCall[];
  isDemo: true;
}

const DemoDataContext = createContext<DemoDataContextType | null>(null);

// Provider with real loads
export function DemoDataProvider({ children }: { children: ReactNode }) {
  const [loads, setLoads] = useState<Load[]>([]);

  useEffect(() => {
    const fetchDemoLoads = async () => {
      const { data, error } = await supabase
        .from("demo_loads")
        .select("*")
        .eq("is_active", true)
        .eq("status", "open")
        .order("ship_date", { ascending: true });

      if (error) {
        console.error("[Demo] Failed to fetch demo loads:", error);
        return;
      }

      setLoads(data || []);
    };

    fetchDemoLoads();
  }, []);

  const demoData: DemoDataContextType = {
    loads,
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

// Hook
export function useDemoData() {
  const context = useContext(DemoDataContext);
  if (!context) {
    throw new Error("useDemoData must be used within a DemoDataProvider");
  }
  return context;
}
