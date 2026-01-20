import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useImpersonation } from "@/contexts/ImpersonationContext";
import { useUserRole } from "@/hooks/useUserRole";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

interface CreateLoadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateLoadModal({ open, onOpenChange }: CreateLoadModalProps) {
  const queryClient = useQueryClient();
  const { impersonatedAgencyId } = useImpersonation();
  const { role } = useUserRole();

  // Form state matching Aljex fields
  const [loadNumber, setLoadNumber] = useState("");
  const [pickupCity, setPickupCity] = useState("");
  const [pickupState, setPickupState] = useState("");
  const [pickupZip, setPickupZip] = useState("");
  const [destCity, setDestCity] = useState("");
  const [destState, setDestState] = useState("");
  const [destZip, setDestZip] = useState("");
  const [shipDate, setShipDate] = useState("");
  const [trailerType, setTrailerType] = useState("");
  const [trailerFootage, setTrailerFootage] = useState("");
  const [tarps, setTarps] = useState("");
  const [tarpSize, setTarpSize] = useState("");
  const [tarpRequired, setTarpRequired] = useState(false);
  const [commodity, setCommodity] = useState("");
  const [miles, setMiles] = useState("");
  const [weightLbs, setWeightLbs] = useState("");
  const [rate, setRate] = useState("");
  const [isPerTon, setIsPerTon] = useState(false);
  const [dispatchStatus, setDispatchStatus] = useState("");

  const resetForm = () => {
    setLoadNumber("");
    setPickupCity("");
    setPickupState("");
    setPickupZip("");
    setDestCity("");
    setDestState("");
    setDestZip("");
    setShipDate("");
    setTrailerType("");
    setTrailerFootage("");
    setTarps("");
    setTarpSize("");
    setTarpRequired(false);
    setCommodity("");
    setMiles("");
    setWeightLbs("");
    setRate("");
    setIsPerTon(false);
    setDispatchStatus("");
  };

  const createLoadMutation = useMutation({
    mutationFn: async () => {
      // Get user's agency
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      let agencyId: string;
      
      if (role === 'super_admin' && impersonatedAgencyId) {
        agencyId = impersonatedAgencyId;
      } else {
        const { data: membership } = await supabase
          .from("agency_members")
          .select("agency_id")
          .eq("user_id", user.id)
          .single();
        
        if (!membership) throw new Error("No agency membership found");
        agencyId = membership.agency_id;
      }

      // Calculate rate fields
      const rateNumeric = rate ? parseFloat(rate.replace(/[$,]/g, "")) : null;
      const weight = weightLbs ? parseFloat(weightLbs) : null;
      const weightTons = weight ? weight / 2000 : 0;

      let invoiceTotal = 0;
      if (rateNumeric) {
        if (isPerTon && weightTons > 0) {
          invoiceTotal = Math.round(rateNumeric * weightTons);
        } else if (!isPerTon) {
          invoiceTotal = Math.round(rateNumeric);
        }
      }

      const targetPay = Math.round(invoiceTotal * 0.80);
      const targetCommission = Math.round(invoiceTotal * 0.20);
      const maxPay = Math.round(invoiceTotal * 0.85);
      const maxCommission = Math.round(invoiceTotal * 0.15);

      const pickupLocationRaw = [pickupCity, pickupState, pickupZip].filter(Boolean).join(", ");
      const destLocationRaw = [destCity, destState, destZip].filter(Boolean).join(", ");

      const loadData = {
        agency_id: agencyId,
        template_type: "manual",
        load_number: loadNumber || `MANUAL-${Date.now()}`,
        pickup_city: pickupCity || null,
        pickup_state: pickupState.toUpperCase() || null,
        pickup_zip: pickupZip || null,
        pickup_location_raw: pickupLocationRaw || null,
        dest_city: destCity || null,
        dest_state: destState.toUpperCase() || null,
        dest_zip: destZip || null,
        dest_location_raw: destLocationRaw || null,
        ship_date: shipDate || null,
        delivery_date: shipDate || null,
        trailer_type: trailerType || null,
        trailer_footage: trailerFootage ? parseFloat(trailerFootage) : null,
        tarps: tarps || null,
        tarp_size: tarpSize || null,
        tarp_required: tarpRequired,
        commodity: commodity || null,
        miles: miles || null,
        weight_lbs: weight,
        rate_raw: rateNumeric,
        is_per_ton: isPerTon,
        customer_invoice_total: invoiceTotal,
        target_pay: targetPay,
        target_commission: targetCommission,
        max_pay: maxPay,
        max_commission: maxCommission,
        commission_target_pct: 0.20,
        commission_max_pct: 0.15,
        dispatch_status: dispatchStatus || null,
        status: "open",
        is_active: true,
        board_date: new Date().toISOString().split("T")[0],
      };

      const { error } = await supabase.from("loads").insert(loadData);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Load created successfully");
      queryClient.invalidateQueries({ queryKey: ["loads"] });
      resetForm();
      onOpenChange(false);
    },
    onError: (error) => {
      console.error("Error creating load:", error);
      toast.error("Failed to create load");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!pickupCity || !destCity) {
      toast.error("Pickup city and destination city are required");
      return;
    }
    
    createLoadMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Load</DialogTitle>
          <DialogDescription>
            Add a new load manually. Fields match the Aljex import format.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="loadNumber">Pro # / Load Number</Label>
              <Input
                id="loadNumber"
                value={loadNumber}
                onChange={(e) => setLoadNumber(e.target.value)}
                placeholder="e.g., 12345"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="shipDate">Ship Date</Label>
              <Input
                id="shipDate"
                type="date"
                value={shipDate}
                onChange={(e) => setShipDate(e.target.value)}
              />
            </div>
          </div>

          {/* Pickup Location */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Pickup Location</Label>
            <div className="grid grid-cols-3 gap-2">
              <Input
                placeholder="City *"
                value={pickupCity}
                onChange={(e) => setPickupCity(e.target.value)}
                required
              />
              <Input
                placeholder="State (e.g., TX)"
                value={pickupState}
                onChange={(e) => setPickupState(e.target.value)}
                maxLength={2}
              />
              <Input
                placeholder="ZIP"
                value={pickupZip}
                onChange={(e) => setPickupZip(e.target.value)}
              />
            </div>
          </div>

          {/* Destination Location */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Destination Location</Label>
            <div className="grid grid-cols-3 gap-2">
              <Input
                placeholder="City *"
                value={destCity}
                onChange={(e) => setDestCity(e.target.value)}
                required
              />
              <Input
                placeholder="State (e.g., NY)"
                value={destState}
                onChange={(e) => setDestState(e.target.value)}
                maxLength={2}
              />
              <Input
                placeholder="ZIP"
                value={destZip}
                onChange={(e) => setDestZip(e.target.value)}
              />
            </div>
          </div>

          {/* Trailer & Equipment */}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="trailerType">Trailer Type</Label>
              <Input
                id="trailerType"
                value={trailerType}
                onChange={(e) => setTrailerType(e.target.value)}
                placeholder="e.g., Flatbed"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="trailerFootage">Footage</Label>
              <Input
                id="trailerFootage"
                type="number"
                value={trailerFootage}
                onChange={(e) => setTrailerFootage(e.target.value)}
                placeholder="e.g., 48"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="miles">Miles</Label>
              <Input
                id="miles"
                value={miles}
                onChange={(e) => setMiles(e.target.value)}
                placeholder="e.g., 500"
              />
            </div>
          </div>

          {/* Tarp Info */}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="tarps">Tarps</Label>
              <Input
                id="tarps"
                value={tarps}
                onChange={(e) => setTarps(e.target.value)}
                placeholder="e.g., 2"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tarpSize">Tarp Size</Label>
              <Input
                id="tarpSize"
                value={tarpSize}
                onChange={(e) => setTarpSize(e.target.value)}
                placeholder="e.g., 8x10"
              />
            </div>
            <div className="flex items-center gap-2 pt-6">
              <Switch
                id="tarpRequired"
                checked={tarpRequired}
                onCheckedChange={setTarpRequired}
              />
              <Label htmlFor="tarpRequired">Tarp Required</Label>
            </div>
          </div>

          {/* Weight & Rate */}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="weightLbs">Weight (lbs)</Label>
              <Input
                id="weightLbs"
                type="number"
                value={weightLbs}
                onChange={(e) => setWeightLbs(e.target.value)}
                placeholder="e.g., 45000"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rate">Rate ($)</Label>
              <Input
                id="rate"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                placeholder="e.g., 2500"
              />
            </div>
            <div className="flex items-center gap-2 pt-6">
              <Switch
                id="isPerTon"
                checked={isPerTon}
                onCheckedChange={setIsPerTon}
              />
              <Label htmlFor="isPerTon">Per Ton Rate</Label>
            </div>
          </div>

          {/* Commodity & Status */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="commodity">Commodity / Description</Label>
              <Textarea
                id="commodity"
                value={commodity}
                onChange={(e) => setCommodity(e.target.value)}
                placeholder="e.g., Steel coils"
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dispatchStatus">Dispatch Status</Label>
              <Input
                id="dispatchStatus"
                value={dispatchStatus}
                onChange={(e) => setDispatchStatus(e.target.value)}
                placeholder="e.g., Ready"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createLoadMutation.isPending}>
              {createLoadMutation.isPending ? "Creating..." : "Create Load"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
