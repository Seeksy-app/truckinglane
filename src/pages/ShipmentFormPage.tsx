import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { useNavigate, useParams, Navigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { useImpersonation } from "@/contexts/ImpersonationContext";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  SHIPMENT_EQUIPMENT_TYPES,
  RATE_TYPES,
  RATE_TYPE_LABELS,
  TIMELINE_FIELDS,
  shipmentStatusBadgeClass,
  shipmentStatusLabel,
  type ShipmentStatus,
} from "@/lib/shipmentConstants";
import type { Tables } from "@/integrations/supabase/types";
import { ArrowLeft, Check, ChevronsUpDown, Loader2, Search, ShieldCheck } from "lucide-react";

type StopDraft = {
  facility_name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  contact_name: string;
  contact_phone: string;
  ready_at: string;
  appointment_at: string;
  appointment_note: string;
  must_deliver_at: string;
};

const emptyStop = (): StopDraft => ({
  facility_name: "",
  address: "",
  city: "",
  state: "",
  zip: "",
  contact_name: "",
  contact_phone: "",
  ready_at: "",
  appointment_at: "",
  appointment_note: "",
  must_deliver_at: "",
});

function isoToLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localToIso(local: string): string | null {
  if (!local?.trim()) return null;
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function parseNum(s: string): number | null {
  const n = parseFloat(s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function parseIntSafe(s: string): number | null {
  const n = parseInt(s.replace(/\D/g, ""), 10);
  return Number.isFinite(n) ? n : null;
}

const cardClass =
  "rounded-[12px] bg-white dark:bg-card border border-[#E5E7EB] dark:border-border shadow-[0_2px_12px_rgba(0,0,0,0.08)] p-5";

export default function ShipmentFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, loading: authLoading } = useAuth();
  const { role, agencyId, loading: roleLoading } = useUserRole();
  const { impersonatedAgencyId, isImpersonating } = useImpersonation();
  const effectiveAgencyId = isImpersonating ? impersonatedAgencyId : agencyId;

  const isNew = id === "new";

  const [saving, setSaving] = useState(false);
  const [verifyingMc, setVerifyingMc] = useState(false);

  const [proNumber, setProNumber] = useState(() =>
    isNew ? `TL-${crypto.randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase()}` : "",
  );
  const [status, setStatus] = useState<ShipmentStatus>("new");
  const [equipmentType, setEquipmentType] = useState("");
  const [footage, setFootage] = useState("");
  const [weightLbs, setWeightLbs] = useState("");
  const [commodity, setCommodity] = useState("");
  const [pieces, setPieces] = useState("");

  const [customerId, setCustomerId] = useState<string | null>(null);
  const [customerRef, setCustomerRef] = useState("");
  const [billSame, setBillSame] = useState(true);
  const [billCompany, setBillCompany] = useState("");
  const [billAddress, setBillAddress] = useState("");
  const [billCity, setBillCity] = useState("");
  const [billState, setBillState] = useState("");
  const [billZip, setBillZip] = useState("");

  const [pickup, setPickup] = useState<StopDraft>(emptyStop);
  const [delivery, setDelivery] = useState<StopDraft>(emptyStop);

  const [custRateType, setCustRateType] = useState<string>("flat");
  const [custLh, setCustLh] = useState("");
  const [custFscPct, setCustFscPct] = useState("");
  const [custFscMi, setCustFscMi] = useState("");
  const [carrRateType, setCarrRateType] = useState<string>("flat");
  const [carrLh, setCarrLh] = useState("");
  const [carrMax, setCarrMax] = useState("");

  const [carrierId, setCarrierId] = useState<string | null>(null);
  const [carrierMc, setCarrierMc] = useState("");
  const [carrierDot, setCarrierDot] = useState("");
  const [dispatcherName, setDispatcherName] = useState("");
  const [dispatcherPhone, setDispatcherPhone] = useState("");
  const [driverName, setDriverName] = useState("");
  const [driverPhone, setDriverPhone] = useState("");
  const [driverCell, setDriverCell] = useState("");
  const [truckNum, setTruckNum] = useState("");
  const [trailerNum, setTrailerNum] = useState("");
  const [scac, setScac] = useState("");

  const [noteRateConf, setNoteRateConf] = useState("");
  const [noteBol, setNoteBol] = useState("");
  const [noteSpecial, setNoteSpecial] = useState("");
  const [noteUpdates, setNoteUpdates] = useState("");

  const [timeline, setTimeline] = useState<Record<string, string>>({});

  const [customerOpen, setCustomerOpen] = useState(false);
  const [carrierOpen, setCarrierOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [carrierSearch, setCarrierSearch] = useState("");

  const { data: shipmentRow, isLoading: loadingShipment } = useQuery({
    queryKey: ["shipment", id],
    queryFn: async () => {
      if (!id || isNew) return null;
      const { data: s, error } = await supabase
        .from("shipments")
        .select(
          `
          *,
          customers ( company_name ),
          carriers ( legal_name )
        `,
        )
        .eq("id", id)
        .single();
      if (error) throw error;
      const { data: stops, error: e2 } = await supabase
        .from("shipment_stops")
        .select("*")
        .eq("shipment_id", id)
        .order("sort_order", { ascending: true });
      if (e2) throw e2;
      const row = s as Tables<"shipments"> & {
        customers?: { company_name: string } | null;
        carriers?: { legal_name: string } | null;
      };
      return {
        shipment: row,
        stops: (stops ?? []) as Tables<"shipment_stops">[],
        customerName: row.customers?.company_name ?? null,
        carrierName: row.carriers?.legal_name ?? null,
      };
    },
    enabled: !!user && !!id && !isNew,
  });

  const [customerPickLabel, setCustomerPickLabel] = useState<string | null>(null);
  const [carrierPickLabel, setCarrierPickLabel] = useState<string | null>(null);

  useEffect(() => {
    if (!shipmentRow) return;
    const s = shipmentRow.shipment;
    setCustomerPickLabel(shipmentRow.customerName);
    setCarrierPickLabel(shipmentRow.carrierName);
    const stops = shipmentRow.stops;
    const pu = stops.find((x) => x.stop_type === "pickup") ?? null;
    const del = stops.find((x) => x.stop_type === "delivery") ?? null;

    setProNumber(s.pro_number);
    setStatus(s.status as ShipmentStatus);
    setEquipmentType(s.equipment_type ?? "");
    setFootage(s.equipment_footage != null ? String(s.equipment_footage) : "");
    setWeightLbs(s.weight_lbs != null ? String(s.weight_lbs) : "");
    setCommodity(s.commodity ?? "");
    setPieces(s.pieces != null ? String(s.pieces) : "");
    setCustomerId(s.customer_id);
    setCustomerRef(s.customer_ref ?? "");
    setBillSame(s.bill_to_same_as_customer);
    setBillCompany(s.bill_to_company ?? "");
    setBillAddress(s.bill_to_address ?? "");
    setBillCity(s.bill_to_city ?? "");
    setBillState(s.bill_to_state ?? "");
    setBillZip(s.bill_to_zip ?? "");
    setCustRateType(s.customer_rate_type || "flat");
    setCustLh(s.customer_lh_rate != null ? String(s.customer_lh_rate) : "");
    setCustFscPct(s.customer_fsc_pct != null ? String(s.customer_fsc_pct) : "");
    setCustFscMi(s.customer_fsc_per_mile != null ? String(s.customer_fsc_per_mile) : "");
    setCarrRateType(s.carrier_rate_type || "flat");
    setCarrLh(s.carrier_lh_rate != null ? String(s.carrier_lh_rate) : "");
    setCarrMax(s.carrier_max_rate != null ? String(s.carrier_max_rate) : "");
    setCarrierId(s.carrier_id);
    setCarrierMc(s.carrier_mc ?? "");
    setCarrierDot(s.carrier_dot ?? "");
    setDispatcherName(s.dispatcher_name ?? "");
    setDispatcherPhone(s.dispatcher_phone ?? "");
    setDriverName(s.driver_name ?? "");
    setDriverPhone(s.driver_phone ?? "");
    setDriverCell(s.driver_cell ?? "");
    setTruckNum(s.truck_number ?? "");
    setTrailerNum(s.trailer_number ?? "");
    setScac(s.scac ?? "");
    setNoteRateConf(s.note_rate_conf ?? "");
    setNoteBol(s.note_bol ?? "");
    setNoteSpecial(s.note_special_instructions ?? "");
    setNoteUpdates(s.note_updates ?? "");

    setTimeline({
      conf_sent_at: isoToLocal(s.conf_sent_at),
      dispatched_at: isoToLocal(s.dispatched_at),
      loaded_at: isoToLocal(s.loaded_at),
      arrived_pickup_at: isoToLocal(s.arrived_pickup_at),
      in_transit_at: isoToLocal(s.in_transit_at),
      arrived_consignee_at: isoToLocal(s.arrived_consignee_at),
      delivered_at: isoToLocal(s.delivered_at),
    });

    setPickup({
      facility_name: pu?.facility_name ?? "",
      address: pu?.address ?? "",
      city: pu?.city ?? "",
      state: pu?.state ?? "",
      zip: pu?.zip ?? "",
      contact_name: pu?.contact_name ?? "",
      contact_phone: pu?.contact_phone ?? "",
      ready_at: isoToLocal(pu?.ready_at),
      appointment_at: isoToLocal(pu?.appointment_at),
      appointment_note: pu?.appointment_note ?? "",
      must_deliver_at: "",
    });
    setDelivery({
      facility_name: del?.facility_name ?? "",
      address: del?.address ?? "",
      city: del?.city ?? "",
      state: del?.state ?? "",
      zip: del?.zip ?? "",
      contact_name: del?.contact_name ?? "",
      contact_phone: del?.contact_phone ?? "",
      ready_at: "",
      appointment_at: isoToLocal(del?.appointment_at),
      appointment_note: del?.appointment_note ?? "",
      must_deliver_at: isoToLocal(del?.must_deliver_at),
    });
  }, [shipmentRow, isNew]);

  const { data: customerHits = [] } = useQuery({
    queryKey: ["customers-search", effectiveAgencyId, customerSearch],
    queryFn: async () => {
      if (!effectiveAgencyId) return [];
      let q = supabase
        .from("customers")
        .select("id, company_name, address, city, state, zip, contact_name, phone")
        .eq("agency_id", effectiveAgencyId)
        .order("company_name", { ascending: true })
        .limit(40);
      const t = customerSearch.trim();
      if (t) q = q.ilike("company_name", `%${t}%`);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!effectiveAgencyId && customerOpen,
  });

  const { data: carrierHits = [] } = useQuery({
    queryKey: ["carriers-search", effectiveAgencyId, carrierSearch],
    queryFn: async () => {
      if (!effectiveAgencyId) return [];
      const t = carrierSearch.trim();
      let q = supabase
        .from("carriers")
        .select("id, legal_name, mc_number, dot_number, phone")
        .eq("agency_id", effectiveAgencyId)
        .order("legal_name", { ascending: true })
        .limit(40);
      if (t) {
        const digits = t.replace(/\D/g, "");
        if (digits.length >= 2) {
          q = q.or(`legal_name.ilike.%${t}%,mc_number.ilike.%${digits}%`);
        } else {
          q = q.ilike("legal_name", `%${t}%`);
        }
      }
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!effectiveAgencyId && carrierOpen,
  });

  const netUsd = useMemo(() => {
    const c = parseNum(custLh) ?? 0;
    const ca = parseNum(carrLh) ?? 0;
    return c - ca;
  }, [custLh, carrLh]);

  const profitPct = useMemo(() => {
    const c = parseNum(custLh) ?? 0;
    if (c <= 0) return null;
    return (netUsd / c) * 100;
  }, [custLh, netUsd]);

  const carrExceedsMax = useMemo(() => {
    const max = parseNum(carrMax);
    const carr = parseNum(carrLh);
    if (max == null || carr == null) return false;
    return carr > max;
  }, [carrMax, carrLh]);

  const buildShipmentPayload = useCallback((): Tables<"shipments">["Insert"] => {
    if (!effectiveAgencyId) throw new Error("No agency");
    return {
      agency_id: effectiveAgencyId,
      pro_number: proNumber.trim(),
      status,
      equipment_type: equipmentType || null,
      equipment_footage: parseNum(footage),
      weight_lbs: parseNum(weightLbs),
      commodity: commodity || null,
      pieces: parseIntSafe(pieces),
      customer_id: customerId,
      customer_ref: customerRef || null,
      bill_to_same_as_customer: billSame,
      bill_to_company: billSame ? null : billCompany || null,
      bill_to_address: billSame ? null : billAddress || null,
      bill_to_city: billSame ? null : billCity || null,
      bill_to_state: billSame ? null : billState || null,
      bill_to_zip: billSame ? null : billZip || null,
      customer_rate_type: custRateType,
      customer_lh_rate: parseNum(custLh),
      customer_fsc_pct: parseNum(custFscPct),
      customer_fsc_per_mile: parseNum(custFscMi),
      carrier_rate_type: carrRateType,
      carrier_lh_rate: parseNum(carrLh),
      carrier_max_rate: parseNum(carrMax),
      carrier_id: carrierId,
      carrier_mc: carrierMc || null,
      carrier_dot: carrierDot || null,
      dispatcher_name: dispatcherName || null,
      dispatcher_phone: dispatcherPhone || null,
      driver_name: driverName || null,
      driver_phone: driverPhone || null,
      driver_cell: driverCell || null,
      truck_number: truckNum || null,
      trailer_number: trailerNum || null,
      scac: scac || null,
      note_rate_conf: noteRateConf || null,
      note_bol: noteBol || null,
      note_special_instructions: noteSpecial || null,
      note_updates: noteUpdates || null,
      conf_sent_at: localToIso(timeline.conf_sent_at ?? ""),
      dispatched_at: localToIso(timeline.dispatched_at ?? ""),
      loaded_at: localToIso(timeline.loaded_at ?? ""),
      arrived_pickup_at: localToIso(timeline.arrived_pickup_at ?? ""),
      in_transit_at: localToIso(timeline.in_transit_at ?? ""),
      arrived_consignee_at: localToIso(timeline.arrived_consignee_at ?? ""),
      delivered_at: localToIso(timeline.delivered_at ?? ""),
      updated_at: new Date().toISOString(),
    };
  }, [
    effectiveAgencyId,
    proNumber,
    status,
    equipmentType,
    footage,
    weightLbs,
    commodity,
    pieces,
    customerId,
    customerRef,
    billSame,
    billCompany,
    billAddress,
    billCity,
    billState,
    billZip,
    custRateType,
    custLh,
    custFscPct,
    custFscMi,
    carrRateType,
    carrLh,
    carrMax,
    carrierId,
    carrierMc,
    carrierDot,
    dispatcherName,
    dispatcherPhone,
    driverName,
    driverPhone,
    driverCell,
    truckNum,
    trailerNum,
    scac,
    noteRateConf,
    noteBol,
    noteSpecial,
    noteUpdates,
    timeline,
  ]);

  const buildStops = useCallback(
    (shipmentId: string): Tables<"shipment_stops">["Insert"][] => {
      const now = new Date().toISOString();
      return [
        {
          shipment_id: shipmentId,
          stop_type: "pickup",
          sort_order: 0,
          facility_name: pickup.facility_name || null,
          address: pickup.address || null,
          city: pickup.city || null,
          state: pickup.state || null,
          zip: pickup.zip || null,
          contact_name: pickup.contact_name || null,
          contact_phone: pickup.contact_phone || null,
          ready_at: localToIso(pickup.ready_at),
          appointment_at: localToIso(pickup.appointment_at),
          appointment_note: pickup.appointment_note || null,
          must_deliver_at: null,
          updated_at: now,
        },
        {
          shipment_id: shipmentId,
          stop_type: "delivery",
          sort_order: 1,
          facility_name: delivery.facility_name || null,
          address: delivery.address || null,
          city: delivery.city || null,
          state: delivery.state || null,
          zip: delivery.zip || null,
          contact_name: delivery.contact_name || null,
          contact_phone: delivery.contact_phone || null,
          ready_at: null,
          appointment_at: localToIso(delivery.appointment_at),
          appointment_note: delivery.appointment_note || null,
          must_deliver_at: localToIso(delivery.must_deliver_at),
          updated_at: now,
        },
      ];
    },
    [pickup, delivery],
  );

  const saveShipment = async (withRateCon: boolean) => {
    if (!effectiveAgencyId) {
      toast.error("No agency context");
      return;
    }
    if (!proNumber.trim()) {
      toast.error("Pro# is required");
      return;
    }
    setSaving(true);
    try {
      const payload = buildShipmentPayload();
      let shipmentId = id;

      if (isNew) {
        const { data: inserted, error } = await supabase
          .from("shipments")
          .insert({ ...payload, created_at: new Date().toISOString() })
          .select("id")
          .single();
        if (error) throw error;
        shipmentId = inserted!.id;
        const stops = buildStops(shipmentId);
        const { error: e2 } = await supabase.from("shipment_stops").insert(stops);
        if (e2) throw e2;
        toast.success("Shipment created");
        queryClient.invalidateQueries({ queryKey: ["shipments"] });
        if (withRateCon) toast.message("Rate confirmation export will be available in a future update.");
        navigate(`/shipments/${shipmentId}`, { replace: true });
      } else {
        const { error } = await supabase.from("shipments").update(payload).eq("id", id!);
        if (error) throw error;
        await supabase.from("shipment_stops").delete().eq("shipment_id", id!);
        const { error: e2 } = await supabase.from("shipment_stops").insert(buildStops(id!));
        if (e2) throw e2;
        toast.success("Shipment saved");
        queryClient.invalidateQueries({ queryKey: ["shipments"] });
        queryClient.invalidateQueries({ queryKey: ["shipment", id] });
        if (withRateCon) toast.message("Rate confirmation export will be available in a future update.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const verifyMc = async () => {
    const mc = carrierMc.replace(/\D/g, "").replace(/^0+/, "");
    if (!mc || !effectiveAgencyId) {
      toast.error("Enter an MC number");
      return;
    }
    setVerifyingMc(true);
    try {
      const { data, error } = await supabase.functions.invoke("carrier-lookup", {
        body: { mc, agency_id: effectiveAgencyId },
      });
      if (error) throw new Error(error.message);
      const d = data as { ok?: boolean; carrier?: { dotNumber?: string; legalName?: string; mc?: string } };
      if (!d?.ok || !d.carrier) {
        toast.error("Carrier not found in FMCSA");
        return;
      }
      if (d.carrier.dotNumber) setCarrierDot(String(d.carrier.dotNumber));
      toast.success("MC verified with FMCSA");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Verification failed");
    } finally {
      setVerifyingMc(false);
    }
  };

  if (authLoading || roleLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;
  if (!role) return <Navigate to="/access-denied" replace />;
  if (!effectiveAgencyId) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <div className="tl-page-gutter py-12 text-center text-muted-foreground">Agency required.</div>
      </div>
    );
  }

  if (!isNew && loadingShipment) {
    return (
      <div className="min-h-screen bg-[#F9FAFB] dark:bg-background">
        <AppHeader />
        <div className="flex justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (!isNew && !loadingShipment && !shipmentRow) {
    return <Navigate to="/shipments" replace />;
  }

  const createdAtIso = shipmentRow?.shipment.created_at ?? new Date().toISOString();

  const fieldCls =
    "h-9 bg-white border-[#E5E7EB] text-[#111827] text-sm shadow-sm dark:bg-background dark:border-border";

  return (
    <div className="min-h-screen bg-[#F9FAFB] dark:bg-background pb-28">
      <AppHeader />
      <div className="max-w-screen-2xl mx-auto tl-page-gutter py-6 space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="ghost" size="sm" onClick={() => navigate("/shipments")} className="gap-1">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <h1 className="text-xl font-bold text-[#111827] dark:text-foreground">
            {isNew ? "Create shipment" : "Edit shipment"}
          </h1>
          <span
            className={cn(
              "inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold",
              shipmentStatusBadgeClass(status),
            )}
          >
            {shipmentStatusLabel(status)}
          </span>
        </div>

        {/* Section 1 — Load details */}
        <div className={cardClass}>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[#6B7280] mb-4">Load details</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3 items-end">
            <div className="space-y-1.5">
              <Label className="text-xs text-[#6B7280]">Pro#</Label>
              <Input className={fieldCls} value={proNumber} onChange={(e) => setProNumber(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-[#6B7280]">Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as ShipmentStatus)}>
                <SelectTrigger className={fieldCls}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["new", "dispatched", "in_transit", "delivered", "covered"] as ShipmentStatus[]).map((s) => (
                    <SelectItem key={s} value={s}>
                      {shipmentStatusLabel(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-[#6B7280]">Equipment</Label>
              <Select value={equipmentType || "__none"} onValueChange={(v) => setEquipmentType(v === "__none" ? "" : v)}>
                <SelectTrigger className={fieldCls}>
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">—</SelectItem>
                  {SHIPMENT_EQUIPMENT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-[#6B7280]">Footage</Label>
              <Input className={fieldCls} inputMode="decimal" value={footage} onChange={(e) => setFootage(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-[#6B7280]">Weight (lbs)</Label>
              <Input className={fieldCls} inputMode="numeric" value={weightLbs} onChange={(e) => setWeightLbs(e.target.value)} />
            </div>
            <div className="space-y-1.5 lg:col-span-2">
              <Label className="text-xs text-[#6B7280]">Commodity</Label>
              <Input className={fieldCls} value={commodity} onChange={(e) => setCommodity(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-[#6B7280]">Pieces</Label>
              <Input className={fieldCls} inputMode="numeric" value={pieces} onChange={(e) => setPieces(e.target.value)} />
            </div>
          </div>
        </div>

        {/* Section 2 — Customer | Pickup | Delivery */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className={cardClass}>
            <h2 className="text-sm font-semibold text-[#111827] dark:text-foreground mb-4 border-b border-[#F3F4F6] pb-2">
              Customer
            </h2>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-[#6B7280]">Customer</Label>
                <Popover open={customerOpen} onOpenChange={setCustomerOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-between font-normal", fieldCls)} type="button">
                      {customerId ? customerPickLabel ?? "Customer" : "Search customers…"}
                      <ChevronsUpDown className="h-4 w-4 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[320px] p-0" align="start">
                    <Command shouldFilter={false}>
                      <CommandInput placeholder="Search…" value={customerSearch} onValueChange={setCustomerSearch} />
                      <CommandList>
                        <CommandEmpty>No customer found.</CommandEmpty>
                        <CommandGroup>
                          {customerHits.map((c) => (
                            <CommandItem
                              key={c.id}
                              value={c.id}
                              onSelect={() => {
                                setCustomerId(c.id);
                                setCustomerPickLabel(c.company_name);
                                setCustomerOpen(false);
                              }}
                            >
                              <Check className={cn("mr-2 h-4 w-4", customerId === c.id ? "opacity-100" : "opacity-0")} />
                              {c.company_name}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-[#6B7280]">Ref#</Label>
                <Input className={fieldCls} value={customerRef} onChange={(e) => setCustomerRef(e.target.value)} />
              </div>
              <div className="flex items-center gap-2 pt-1">
                <Checkbox id="billSame" checked={billSame} onCheckedChange={(v) => setBillSame(v === true)} />
                <Label htmlFor="billSame" className="text-sm font-normal cursor-pointer">
                  Bill-to same as customer
                </Label>
              </div>
              {!billSame && (
                <div className="space-y-2 border border-dashed border-[#E5E7EB] rounded-lg p-3">
                  <Input className={fieldCls} placeholder="Bill company" value={billCompany} onChange={(e) => setBillCompany(e.target.value)} />
                  <Input className={fieldCls} placeholder="Address" value={billAddress} onChange={(e) => setBillAddress(e.target.value)} />
                  <div className="grid grid-cols-3 gap-2">
                    <Input className={fieldCls} placeholder="City" value={billCity} onChange={(e) => setBillCity(e.target.value)} />
                    <Input className={fieldCls} placeholder="ST" value={billState} onChange={(e) => setBillState(e.target.value)} />
                    <Input className={fieldCls} placeholder="Zip" value={billZip} onChange={(e) => setBillZip(e.target.value)} />
                  </div>
                </div>
              )}
            </div>
          </div>

          <StopColumn
            title="Pickup"
            s={pickup}
            setS={setPickup}
            showReady
            showMustDeliver={false}
            fieldCls={fieldCls}
          />

          <StopColumn
            title="Delivery (Consignee)"
            s={delivery}
            setS={setDelivery}
            showReady={false}
            showMustDeliver
            fieldCls={fieldCls}
          />
        </div>

        {/* Section 3 — Rates */}
        <div className={cardClass}>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[#6B7280] mb-4">Rates</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-[#6B7280]">Customer rate type</Label>
                <Select value={custRateType} onValueChange={setCustRateType}>
                  <SelectTrigger className={fieldCls}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RATE_TYPES.map((rt) => (
                      <SelectItem key={rt} value={rt}>
                        {RATE_TYPE_LABELS[rt]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-[#6B7280]">Customer LH rate ($)</Label>
                <Input className={fieldCls} inputMode="decimal" value={custLh} onChange={(e) => setCustLh(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-xs text-[#6B7280]">FSC %</Label>
                  <Input className={fieldCls} value={custFscPct} onChange={(e) => setCustFscPct(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-[#6B7280]">FSC / mile</Label>
                  <Input className={fieldCls} value={custFscMi} onChange={(e) => setCustFscMi(e.target.value)} />
                </div>
              </div>
            </div>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-[#6B7280]">Carrier rate type</Label>
                <Select value={carrRateType} onValueChange={setCarrRateType}>
                  <SelectTrigger className={fieldCls}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RATE_TYPES.map((rt) => (
                      <SelectItem key={rt} value={rt}>
                        {RATE_TYPE_LABELS[rt]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-[#6B7280]">Carrier LH rate ($)</Label>
                <Input
                  className={cn(fieldCls, carrExceedsMax && "border-red-500 ring-1 ring-red-500/30")}
                  inputMode="decimal"
                  value={carrLh}
                  onChange={(e) => setCarrLh(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-[#6B7280]">Max rate ($)</Label>
                <Input className={fieldCls} inputMode="decimal" value={carrMax} onChange={(e) => setCarrMax(e.target.value)} />
              </div>
              <div className="rounded-lg bg-[#F9FAFB] dark:bg-muted/40 border border-[#E5E7EB] dark:border-border p-4 space-y-1">
                <p className="text-sm text-[#6B7280]">
                  Net USD:{" "}
                  <span className={cn("font-bold tabular-nums text-[#111827] dark:text-foreground", netUsd < 0 && "text-destructive")}>
                    {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(netUsd)}
                  </span>
                </p>
                <p className="text-sm text-[#6B7280]">
                  Profit %:{" "}
                  <span className="font-semibold tabular-nums text-[#047857]">
                    {profitPct != null ? `${profitPct.toFixed(1)}%` : "—"}
                  </span>
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Section 4 — Carrier */}
        <div className={cardClass}>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[#6B7280] mb-4">Carrier assignment</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-[#6B7280]">Carrier</Label>
              <Popover open={carrierOpen} onOpenChange={setCarrierOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-between font-normal", fieldCls)} type="button">
                    {carrierId ? carrierPickLabel ?? "Carrier" : "Search carriers…"}
                    <ChevronsUpDown className="h-4 w-4 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[320px] p-0" align="start">
                  <Command shouldFilter={false}>
                    <CommandInput placeholder="Name or MC…" value={carrierSearch} onValueChange={setCarrierSearch} />
                    <CommandList>
                      <CommandEmpty>No carrier found.</CommandEmpty>
                      <CommandGroup>
                        {carrierHits.map((c) => (
                          <CommandItem
                            key={c.id}
                            value={c.id}
                            onSelect={() => {
                              setCarrierId(c.id);
                              setCarrierPickLabel(c.legal_name);
                              setCarrierMc(c.mc_number ?? "");
                              setCarrierDot(c.dot_number ?? "");
                              setCarrierOpen(false);
                            }}
                          >
                            <Check className={cn("mr-2 h-4 w-4", carrierId === c.id ? "opacity-100" : "opacity-0")} />
                            <span className="truncate">{c.legal_name}</span>
                            {c.mc_number ? (
                              <span className="ml-2 text-xs text-muted-foreground">MC {c.mc_number}</span>
                            ) : null}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-[#6B7280]">MC#</Label>
              <div className="flex gap-2">
                <Input className={fieldCls} value={carrierMc} onChange={(e) => setCarrierMc(e.target.value)} />
                <Button type="button" variant="outline" className="shrink-0" disabled={verifyingMc} onClick={() => void verifyMc()}>
                  {verifyingMc ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                  Verify
                </Button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-[#6B7280]">DOT#</Label>
              <Input className={fieldCls} value={carrierDot} onChange={(e) => setCarrierDot(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-[#6B7280]">Dispatcher</Label>
              <Input className={fieldCls} value={dispatcherName} onChange={(e) => setDispatcherName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-[#6B7280]">Dispatcher phone</Label>
              <Input className={fieldCls} value={dispatcherPhone} onChange={(e) => setDispatcherPhone(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-[#6B7280]">Driver name</Label>
              <Input className={fieldCls} value={driverName} onChange={(e) => setDriverName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-[#6B7280]">Driver phone</Label>
              <Input className={fieldCls} value={driverPhone} onChange={(e) => setDriverPhone(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-[#6B7280]">Driver cell</Label>
              <Input className={fieldCls} value={driverCell} onChange={(e) => setDriverCell(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-[#6B7280]">Truck#</Label>
              <Input className={fieldCls} value={truckNum} onChange={(e) => setTruckNum(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-[#6B7280]">Trailer#</Label>
              <Input className={fieldCls} value={trailerNum} onChange={(e) => setTrailerNum(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-[#6B7280]">SCAC</Label>
              <Input className={fieldCls} value={scac} onChange={(e) => setScac(e.target.value)} />
            </div>
          </div>
        </div>

        {/* Section 5 — Notes */}
        <div className={cardClass}>
          <Tabs defaultValue="rate" className="w-full">
            <TabsList className="w-full flex flex-wrap h-auto gap-1 bg-[#F9FAFB] dark:bg-muted/50 p-1">
              <TabsTrigger value="rate" className="text-xs sm:text-sm">
                Rate Conf Notes
              </TabsTrigger>
              <TabsTrigger value="bol" className="text-xs sm:text-sm">
                BOL Notes
              </TabsTrigger>
              <TabsTrigger value="special" className="text-xs sm:text-sm">
                Special Instructions
              </TabsTrigger>
              <TabsTrigger value="updates" className="text-xs sm:text-sm">
                Updates
              </TabsTrigger>
            </TabsList>
            <TabsContent value="rate" className="mt-4">
              <Textarea className="min-h-[120px] border-[#E5E7EB]" value={noteRateConf} onChange={(e) => setNoteRateConf(e.target.value)} />
            </TabsContent>
            <TabsContent value="bol" className="mt-4">
              <Textarea className="min-h-[120px] border-[#E5E7EB]" value={noteBol} onChange={(e) => setNoteBol(e.target.value)} />
            </TabsContent>
            <TabsContent value="special" className="mt-4">
              <Textarea className="min-h-[120px] border-[#E5E7EB]" value={noteSpecial} onChange={(e) => setNoteSpecial(e.target.value)} />
            </TabsContent>
            <TabsContent value="updates" className="mt-4">
              <Textarea className="min-h-[120px] border-[#E5E7EB]" value={noteUpdates} onChange={(e) => setNoteUpdates(e.target.value)} />
            </TabsContent>
          </Tabs>
        </div>

        {/* Section 6 — Timeline */}
        <div className={cardClass}>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[#6B7280] mb-4">Status timeline</h2>
          <div className="overflow-x-auto pb-2">
            <div className="flex gap-4 min-w-max">
              {TIMELINE_FIELDS.map((step) => {
                const isCreated = step.key === "created_at";
                const val = isCreated ? isoToLocal(createdAtIso) : timeline[step.key] ?? "";
                const completed = isCreated ? true : !!val;
                return (
                  <div
                    key={step.key}
                    className={cn(
                      "flex flex-col gap-1.5 min-w-[140px] rounded-lg border p-3",
                      completed ? "border-[#A7F3D0] bg-[#ECFDF5]/80" : "border-[#E5E7EB] bg-white dark:bg-card",
                    )}
                  >
                    <span className={cn("text-xs font-semibold", completed ? "text-[#047857]" : "text-[#6B7280]")}>
                      {step.label}
                    </span>
                    {isCreated ? (
                      <p className="text-xs text-[#374151] tabular-nums">{new Date(createdAtIso).toLocaleString()}</p>
                    ) : (
                      <Input
                        type="datetime-local"
                        className={cn(fieldCls, "h-8 text-xs")}
                        value={val}
                        onChange={(e) => setTimeline((t) => ({ ...t, [step.key]: e.target.value }))}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Sticky actions */}
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-[#E5E7EB] dark:border-border bg-white/95 dark:bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-white/80 shadow-[0_-4px_20px_rgba(0,0,0,0.06)]">
        <div className="max-w-screen-2xl mx-auto tl-page-gutter py-3 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            className="bg-[#F97316] hover:bg-[#ea580c] text-white"
            disabled={saving}
            onClick={() => void saveShipment(false)}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Save
          </Button>
          <Button type="button" variant="outline" disabled={saving} onClick={() => void saveShipment(true)}>
            Save + Generate Rate Con
          </Button>
          <Button
            type="button"
            variant="outline"
            className="gap-1"
            onClick={() => toast.message("Smart carrier search will connect to your carrier network in a future update.")}
          >
            <Search className="h-4 w-4" />
            Smart Search
          </Button>
          <Button type="button" variant="ghost" className="ml-auto" onClick={() => navigate("/shipments")}>
            Back to list
          </Button>
        </div>
      </div>
    </div>
  );
}

function StopColumn({
  title,
  s,
  setS,
  showReady,
  showMustDeliver,
  fieldCls,
}: {
  title: string;
  s: StopDraft;
  setS: Dispatch<SetStateAction<StopDraft>>;
  showReady: boolean;
  showMustDeliver: boolean;
  fieldCls: string;
}) {
  const patch = (p: Partial<StopDraft>) => setS((prev) => ({ ...prev, ...p }));
  return (
    <div className={cardClass}>
      <h2 className="text-sm font-semibold text-[#111827] dark:text-foreground mb-4 border-b border-[#F3F4F6] pb-2">{title}</h2>
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label className="text-xs text-[#6B7280]">Facility name</Label>
          <Input className={fieldCls} value={s.facility_name} onChange={(e) => patch({ facility_name: e.target.value })} />
        </div>
        <Input className={fieldCls} placeholder="Address" value={s.address} onChange={(e) => patch({ address: e.target.value })} />
        <div className="grid grid-cols-3 gap-2">
          <Input className={fieldCls} placeholder="City" value={s.city} onChange={(e) => patch({ city: e.target.value })} />
          <Input className={fieldCls} placeholder="ST" value={s.state} onChange={(e) => patch({ state: e.target.value })} />
          <Input className={fieldCls} placeholder="Zip" value={s.zip} onChange={(e) => patch({ zip: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label className="text-xs text-[#6B7280]">Contact</Label>
            <Input className={fieldCls} value={s.contact_name} onChange={(e) => patch({ contact_name: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-[#6B7280]">Phone</Label>
            <Input className={fieldCls} value={s.contact_phone} onChange={(e) => patch({ contact_phone: e.target.value })} />
          </div>
        </div>
        {showReady && (
          <div className="space-y-1.5">
            <Label className="text-xs text-[#6B7280]">Ready date & time</Label>
            <Input type="datetime-local" className={fieldCls} value={s.ready_at} onChange={(e) => patch({ ready_at: e.target.value })} />
          </div>
        )}
        {showMustDeliver && (
          <div className="space-y-1.5">
            <Label className="text-xs text-[#6B7280]">Must deliver</Label>
            <Input
              type="datetime-local"
              className={fieldCls}
              value={s.must_deliver_at}
              onChange={(e) => patch({ must_deliver_at: e.target.value })}
            />
          </div>
        )}
        <div className="space-y-1.5">
          <Label className="text-xs text-[#6B7280]">Appointment date & time</Label>
          <Input
            type="datetime-local"
            className={fieldCls}
            value={s.appointment_at}
            onChange={(e) => patch({ appointment_at: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-[#6B7280]">Appointment note</Label>
          <Textarea className="min-h-[72px] border-[#E5E7EB]" value={s.appointment_note} onChange={(e) => patch({ appointment_note: e.target.value })} />
        </div>
      </div>
    </div>
  );
}
