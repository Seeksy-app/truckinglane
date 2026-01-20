import { useState, useMemo, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { DemoDataProvider, useDemoData } from "@/contexts/DemoDataContext";
import { DashboardStats, DashboardMode } from "@/components/dashboard/DashboardStats";
import { LoadsTable } from "@/components/loads/LoadsTable";
import { LeadsTable } from "@/components/dashboard/LeadsTable";
import { DemoAnalytics } from "@/components/demo/DemoAnalytics";
import { DemoIntegrations } from "@/components/demo/DemoIntegrations";
import { DemoWelcomeBanner } from "@/components/demo/DemoWelcomeBanner";
import { DemoIntelligenceRail } from "@/components/demo/DemoIntelligenceRail";
import { DemoInternalChatRail } from "@/components/demo/DemoInternalChatRail";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Search, 
  ArrowLeft, 
  Sparkles, 
  Phone, 
  Package, 
  TrendingUp, 
  BarChart3, 
  Plug,
  Bell,
  User,
} from "lucide-react";
import { Logo } from "@/components/Logo";
import type { Tables } from "@/integrations/supabase/types";

type Lead = Tables<"leads">;
type LeadStatus = "pending" | "claimed" | "booked" | "closed";
type DemoTab = "dashboard" | "analytics" | "integrations";

const modeTitles: Record<DashboardMode, string> = {
  open: "Open Loads",
  claimed: "Claimed Loads",
  pending: "Leads",
  calls: "AI Calls",
  booked: "Booked",
};

function DemoDashboardContent() {
  const { loads, leads, calls } = useDemoData();
  const [activeTab, setActiveTab] = useState<DemoTab>("dashboard");
  const [mode, setMode] = useState<DashboardMode>("open");
  const [searchQuery, setSearchQuery] = useState("");
  const [ownerFilter, setOwnerFilter] = useState<"all" | "my">("all");
  
  // Rails state
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);
  const [leftWidth, setLeftWidth] = useState(360);
  const [rightWidth, setRightWidth] = useState(380);

  // Compute today for filtering
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  // Stats for KPIs - daily counts
  const stats = useMemo(() => ({
    openToday: loads.filter((l) => l.status === "open" && l.is_active).length,
    claimedToday: leads.filter((l) => l.status === "claimed").length,
    pendingToday: leads.filter((l) => l.status === "pending").length,
    aiCallsToday: calls.filter((c) => new Date(c.created_at) >= today).length,
    bookedToday: leads.filter((l) => l.booked_at && new Date(l.booked_at) >= today).length,
  }), [loads, leads, calls, today]);

  // Apply filters
  const filteredLoads = useMemo(() => {
    let result = loads.filter((l) => l.status === "open" && l.is_active);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((l) =>
        l.load_number?.toLowerCase().includes(q) ||
        l.pickup_city?.toLowerCase().includes(q) ||
        l.pickup_state?.toLowerCase().includes(q) ||
        l.dest_city?.toLowerCase().includes(q) ||
        l.dest_state?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [loads, searchQuery]);

  const filteredClaimedLeads = useMemo(() => {
    let result = leads.filter((l) => l.status === "claimed");
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((l) =>
        l.caller_name?.toLowerCase().includes(q) ||
        l.caller_phone?.toLowerCase().includes(q) ||
        l.caller_company?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [leads, searchQuery]);

  const filteredPendingLeads = useMemo(() => {
    let result = leads.filter((l) => l.status === "pending");
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((l) =>
        l.caller_name?.toLowerCase().includes(q) ||
        l.caller_phone?.toLowerCase().includes(q) ||
        l.caller_company?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [leads, searchQuery]);

  const filteredCalls = useMemo(() => {
    let result = calls.filter((c) => new Date(c.created_at) >= today);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((c) =>
        c.caller_phone?.toLowerCase().includes(q) ||
        c.receiver_phone?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [calls, today, searchQuery]);

  const filteredBookedLeads = useMemo(() => {
    let result = leads.filter((l) => l.booked_at && new Date(l.booked_at) >= today);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((l) =>
        l.caller_name?.toLowerCase().includes(q) ||
        l.caller_phone?.toLowerCase().includes(q) ||
        l.caller_company?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [leads, today, searchQuery]);

  // Get current filtered data
  const getCurrentData = () => {
    switch (mode) {
      case "open": return filteredLoads;
      case "claimed": return filteredClaimedLeads;
      case "pending": return filteredPendingLeads;
      case "calls": return filteredCalls;
      case "booked": return filteredBookedLeads;
    }
  };

  // Demo action handlers (no-ops with feedback)
  const handleClaimLead = (leadId: string) => {
    console.log("[Demo] Claim lead:", leadId);
  };

  const handleUpdateStatus = (leadId: string, status: LeadStatus, action?: 'release' | 'reopen') => {
    console.log("[Demo] Update status:", leadId, status, action);
  };

  const handleRefresh = () => {
    console.log("[Demo] Refresh triggered");
  };

  // Owner filter labels
  const ownerLabels: Record<DashboardMode, { all: string; my: string }> = {
    open: { all: "All Loads", my: "My Loads" },
    claimed: { all: "All Claimed", my: "My Claimed" },
    pending: { all: "All Leads", my: "My Leads" },
    calls: { all: "All Calls", my: "My Calls" },
    booked: { all: "All Booked", my: "My Booked" },
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Demo Header - matches AppHeader style */}
      <header className="border-b border-border bg-card/95 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-4">
              <Link to="/" className="flex items-center gap-2">
                <Logo size="sm" />
              </Link>
              <Badge variant="outline" className="bg-[hsl(25,95%,53%)]/10 text-[hsl(25,95%,53%)] border-[hsl(25,95%,53%)]/30">
                <Sparkles className="h-3 w-3 mr-1" />
                Demo Mode
              </Badge>
            </div>
            
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" className="relative">
                <Bell className="h-5 w-5" />
                <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-destructive" />
              </Button>
              <Button variant="ghost" size="icon">
                <User className="h-5 w-5" />
              </Button>
              <Link to="/auth">
                <Button variant="default" className="bg-[hsl(25,95%,53%)] hover:bg-[hsl(25,95%,45%)] text-white">
                  Get Started
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Feature Highlights Banner */}
      <div className="bg-gradient-to-r from-[hsl(220,15%,15%)] to-[hsl(220,15%,20%)] border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-wrap items-center justify-center gap-6 text-sm">
            <div className="flex items-center gap-2 text-white/90">
              <Phone className="h-4 w-4 text-[hsl(25,95%,53%)]" />
              <span>AI Voice Agents 24/7</span>
            </div>
            <div className="h-4 w-px bg-white/20 hidden sm:block" />
            <div className="flex items-center gap-2 text-white/90">
              <Package className="h-4 w-4 text-[hsl(145,63%,50%)]" />
              <span>Smart Load Matching</span>
            </div>
            <div className="h-4 w-px bg-white/20 hidden sm:block" />
            <div className="flex items-center gap-2 text-white/90">
              <TrendingUp className="h-4 w-4 text-[hsl(38,92%,50%)]" />
              <span>Real-time Analytics</span>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Main Tabs Navigation */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as DemoTab)} className="space-y-6">
          <TabsList className="bg-card border border-border">
            <TabsTrigger value="dashboard" className="flex items-center gap-2">
              <Package className="h-4 w-4" />
              Dashboard
            </TabsTrigger>
            <TabsTrigger value="analytics" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Analytics
            </TabsTrigger>
            <TabsTrigger value="integrations" className="flex items-center gap-2">
              <Plug className="h-4 w-4" />
              Integrations
            </TabsTrigger>
          </TabsList>

          {/* Dashboard Tab */}
          <TabsContent value="dashboard" className="space-y-4">
            {/* Welcome Banner with name + weather */}
            <DemoWelcomeBanner />
            
            {/* KPI Cards as view toggles */}
            <DashboardStats stats={stats} activeMode={mode} onModeChange={setMode} />

            {/* Controls bar */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold text-foreground">{modeTitles[mode]}</h2>
                <span className="text-sm text-muted-foreground">
                  ({getCurrentData().length} items)
                </span>
              </div>
            </div>

            {/* Global search + owner toggle */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search load #, city, state, phone..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 bg-card border-border"
                />
              </div>
              <ToggleGroup
                type="single"
                value={ownerFilter}
                onValueChange={(v) => v && setOwnerFilter(v as "all" | "my")}
                className="border border-border rounded-md bg-card"
              >
                <ToggleGroupItem value="all" className="px-4 text-sm data-[state=on]:bg-muted">
                  {ownerLabels[mode].all}
                </ToggleGroupItem>
                <ToggleGroupItem value="my" className="px-4 text-sm data-[state=on]:bg-muted">
                  {ownerLabels[mode].my}
                </ToggleGroupItem>
              </ToggleGroup>
            </div>

            {/* Content based on mode */}
            {mode === "open" && (
              <LoadsTable loads={filteredLoads} loading={false} onRefresh={handleRefresh} />
            )}

            {(mode === "claimed" || mode === "pending") && (
              <LeadsTable
                leads={mode === "claimed" ? filteredClaimedLeads : filteredPendingLeads}
                isLoading={false}
                currentUserId="demo-user"
                onClaimLead={handleClaimLead}
                onUpdateStatus={handleUpdateStatus}
              />
            )}

            {mode === "calls" && (
              <div className="rounded-lg border border-border bg-card overflow-hidden">
                {filteredCalls.length === 0 ? (
                  <div className="p-12 text-center">
                    <p className="text-lg font-medium text-foreground">No calls today</p>
                    <p className="text-sm text-muted-foreground mt-1">AI calls will appear here as they come in</p>
                  </div>
                ) : (
                  <table className="w-full">
                    <thead className="bg-muted/50 border-b border-border">
                      <tr className="text-left text-xs uppercase tracking-wide">
                        <th className="px-4 py-3 font-medium text-muted-foreground">Caller</th>
                        <th className="px-4 py-3 font-medium text-muted-foreground">Receiver</th>
                        <th className="px-4 py-3 font-medium text-muted-foreground">Status</th>
                        <th className="px-4 py-3 font-medium text-muted-foreground">Duration</th>
                        <th className="px-4 py-3 font-medium text-muted-foreground">Time</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filteredCalls.map((call) => (
                        <tr key={call.id} className="hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-3 font-mono text-sm">{call.caller_phone}</td>
                          <td className="px-4 py-3 font-mono text-sm">{call.receiver_phone}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-1 text-xs font-medium rounded ${
                              call.call_status === "completed" 
                                ? "bg-[hsl(145,63%,42%)]/15 text-[hsl(145,63%,35%)]" 
                                : call.call_status === "in_progress" 
                                ? "bg-[hsl(210,80%,45%)]/15 text-[hsl(210,80%,40%)]" 
                                : "bg-destructive/15 text-destructive"
                            }`}>
                              {call.call_status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-muted-foreground">
                            {call.duration_seconds ? `${Math.floor(call.duration_seconds / 60)}m ${call.duration_seconds % 60}s` : "—"}
                          </td>
                          <td className="px-4 py-3 text-sm text-muted-foreground">
                            {new Date(call.created_at).toLocaleTimeString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {mode === "booked" && (
              <LeadsTable
                leads={filteredBookedLeads}
                isLoading={false}
                currentUserId="demo-user"
                onClaimLead={handleClaimLead}
                onUpdateStatus={handleUpdateStatus}
              />
            )}
          </TabsContent>

          {/* Analytics Tab */}
          <TabsContent value="analytics">
            <DemoAnalytics />
          </TabsContent>

          {/* Integrations Tab */}
          <TabsContent value="integrations">
            <DemoIntegrations />
          </TabsContent>
        </Tabs>
      </div>

      {/* Demo CTA Footer */}
      <div className="border-t border-border bg-gradient-to-r from-[hsl(220,15%,15%)] to-[hsl(220,15%,20%)] mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 text-center">
          <h3 className="text-2xl font-bold text-white mb-2">Ready to transform your brokerage?</h3>
          <p className="text-white/70 mb-6 max-w-xl mx-auto">
            Let AI handle your calls 24/7, qualify leads automatically, and book more loads.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/auth">
              <Button size="lg" className="bg-[hsl(25,95%,53%)] hover:bg-[hsl(25,95%,45%)] text-white px-8">
                Start Free Trial
              </Button>
            </Link>
            <Button size="lg" variant="outline" className="border-white/30 text-white hover:bg-white/10">
              Schedule a Demo
            </Button>
          </div>
        </div>
      </div>

      {/* Sidebars - matching Dashboard layout */}
      <DemoInternalChatRail
        open={leftOpen}
        onOpenChange={setLeftOpen}
        width={leftWidth}
        onWidthChange={setLeftWidth}
      />

      <DemoIntelligenceRail
        open={rightOpen}
        onOpenChange={setRightOpen}
        width={rightWidth}
        onWidthChange={setRightWidth}
      />
    </div>
  );
}

export default function Demo() {
  return (
    <DemoDataProvider>
      <DemoDashboardContent />
    </DemoDataProvider>
  );
}
