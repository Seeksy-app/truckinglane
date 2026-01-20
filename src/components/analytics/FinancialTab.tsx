import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AnalyticsKPICards } from "./AnalyticsKPICards";
import { DollarSign, TrendingUp, Target, PiggyBank, Calculator, Percent, Phone, Truck } from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend,
} from "recharts";
import { format, parseISO } from "date-fns";

interface ElevenLabsCall {
  id: string;
  created_at: string;
  call_duration_secs: number | null;
}

interface FinancialTabProps {
  loads: Array<{
    id: string;
    status: string;
    booked_at: string | null;
    booked_source: string | null;
    customer_invoice_total: number;
    target_pay: number;
    max_pay: number;
    target_commission: number | null;
    max_commission: number | null;
  }>;
  aiBookings: Array<{
    id: string;
    booked_at: string | null;
    customer_invoice_total: number;
    target_pay: number;
    target_commission: number | null;
  }>;
  elevenLabsCalls?: ElevenLabsCall[];
}

// ElevenLabs pricing constants (approximate)
const ELEVENLABS_COST_PER_MINUTE = 0.10; // ~$0.10/minute for conversational AI
const BOOKING_FEE_PER_LOAD = 5; // $5 per booked load

export const FinancialTab = ({ loads, aiBookings, elevenLabsCalls = [] }: FinancialTabProps) => {
  const stats = useMemo(() => {
    // ElevenLabs cost calculation
    const totalCallMinutes = elevenLabsCalls.reduce((sum, call) => {
      return sum + (call.call_duration_secs || 0) / 60;
    }, 0);
    const elevenLabsCost = totalCallMinutes * ELEVENLABS_COST_PER_MINUTE;
    
    // Booked loads tally ($5 per load)
    const bookedLoads = loads.filter((l) => l.status === "booked" || l.booked_at);
    const bookingFeeTally = bookedLoads.length * BOOKING_FEE_PER_LOAD;
    
    // Total platform cost
    const totalPlatformCost = elevenLabsCost + bookingFeeTally;
    
    // AI Revenue
    const aiRevenue = aiBookings.reduce((sum, l) => sum + (l.customer_invoice_total || 0), 0);
    const aiCommission = aiBookings.reduce((sum, l) => sum + (l.target_commission || 0), 0);
    
    // All booked loads revenue
    const totalRevenue = bookedLoads.reduce((sum, l) => sum + (l.customer_invoice_total || 0), 0);
    const totalCommission = bookedLoads.reduce((sum, l) => sum + (l.target_commission || 0), 0);
    
    // Averages
    const avgDealSize = bookedLoads.length > 0 ? totalRevenue / bookedLoads.length : 0;
    const avgCommission = bookedLoads.length > 0 ? totalCommission / bookedLoads.length : 0;
    
    // AI attribution percentage
    const aiAttributionPct = bookedLoads.length > 0 ? (aiBookings.length / bookedLoads.length) * 100 : 0;
    
    // ROI calculation
    const netProfit = totalCommission - totalPlatformCost;

    return {
      elevenLabsCost,
      bookingFeeTally,
      totalPlatformCost,
      totalCallMinutes,
      callCount: elevenLabsCalls.length,
      aiRevenue,
      aiCommission,
      totalRevenue,
      totalCommission,
      avgDealSize,
      avgCommission,
      aiAttributionPct,
      aiBookingsCount: aiBookings.length,
      totalBookings: bookedLoads.length,
      netProfit,
    };
  }, [loads, aiBookings, elevenLabsCalls]);

  // Cost over time for chart
  const costOverTime = useMemo(() => {
    const dateMap = new Map<string, { date: string; elevenLabs: number; bookingFees: number }>();
    
    // Add ElevenLabs costs by date
    elevenLabsCalls.forEach((call) => {
      const date = format(parseISO(call.created_at), "MMM d");
      const existing = dateMap.get(date) || { date, elevenLabs: 0, bookingFees: 0 };
      existing.elevenLabs += ((call.call_duration_secs || 0) / 60) * ELEVENLABS_COST_PER_MINUTE;
      dateMap.set(date, existing);
    });
    
    // Add booking fees by date
    loads
      .filter((l) => l.booked_at)
      .forEach((load) => {
        const date = format(parseISO(load.booked_at!), "MMM d");
        const existing = dateMap.get(date) || { date, elevenLabs: 0, bookingFees: 0 };
        existing.bookingFees += BOOKING_FEE_PER_LOAD;
        dateMap.set(date, existing);
      });

    return Array.from(dateMap.values()).sort((a, b) => a.date.localeCompare(b.date)).slice(-14);
  }, [elevenLabsCalls, loads]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  // Cost KPIs (top section)
  const costKpiCards = [
    {
      label: "ElevenLabs Cost",
      value: formatCurrency(stats.elevenLabsCost),
      subtext: `${stats.callCount} calls · ${stats.totalCallMinutes.toFixed(1)} min`,
      icon: Phone,
      color: "amber" as const,
    },
    {
      label: "Booking Fees ($5/load)",
      value: formatCurrency(stats.bookingFeeTally),
      subtext: `${stats.totalBookings} booked loads`,
      icon: Truck,
      color: "blue" as const,
    },
    {
      label: "Total Platform Cost",
      value: formatCurrency(stats.totalPlatformCost),
      subtext: "ElevenLabs + Booking Fees",
      icon: DollarSign,
      color: "red" as const,
    },
    {
      label: "Net Profit",
      value: formatCurrency(stats.netProfit),
      subtext: `Commission - Costs`,
      icon: stats.netProfit >= 0 ? TrendingUp : DollarSign,
      color: stats.netProfit >= 0 ? "emerald" as const : "red" as const,
    },
  ];

  // Revenue KPIs
  const revenueKpiCards = [
    {
      label: "AI-Attributed Revenue",
      value: formatCurrency(stats.aiRevenue),
      subtext: `${stats.aiBookingsCount} bookings`,
      icon: DollarSign,
      color: "emerald" as const,
    },
    {
      label: "AI Commission Earned",
      value: formatCurrency(stats.aiCommission),
      subtext: `${stats.aiAttributionPct.toFixed(0)}% of bookings from AI`,
      icon: PiggyBank,
      color: "blue" as const,
    },
    {
      label: "Avg Deal Size",
      value: formatCurrency(stats.avgDealSize),
      subtext: `${stats.totalBookings} total bookings`,
      icon: Calculator,
      color: "purple" as const,
    },
    {
      label: "Avg Commission/Load",
      value: formatCurrency(stats.avgCommission),
      subtext: "per booked load",
      icon: Percent,
      color: "amber" as const,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Platform Costs Section */}
      <div>
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-amber-500" />
          Platform Costs
        </h3>
        <AnalyticsKPICards cards={costKpiCards} />
      </div>

      {/* Cost Breakdown Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-serif flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Cost Breakdown Over Time
          </CardTitle>
        </CardHeader>
        <CardContent>
          {costOverTime.length === 0 ? (
            <div className="h-[250px] flex items-center justify-center text-muted-foreground">
              No cost data available for this period
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={costOverTime}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="date" className="text-xs fill-muted-foreground" />
                <YAxis
                  className="text-xs fill-muted-foreground"
                  tickFormatter={(v) => `$${v.toFixed(0)}`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                  }}
                  formatter={(value: number) => formatCurrency(value)}
                />
                <Legend />
                <Bar dataKey="elevenLabs" name="ElevenLabs" fill="hsl(38, 92%, 50%)" stackId="costs" />
                <Bar dataKey="bookingFees" name="Booking Fees" fill="hsl(217, 91%, 60%)" stackId="costs" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Revenue Section */}
      <div>
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <PiggyBank className="h-5 w-5 text-emerald-500" />
          Revenue & Commission
        </h3>
        <AnalyticsKPICards cards={revenueKpiCards} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Cost Summary */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-serif flex items-center gap-2">
              <Phone className="h-5 w-5" />
              Cost Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between py-3 border-b">
                <span className="text-sm text-muted-foreground">ElevenLabs Cost</span>
                <span className="text-lg font-bold text-amber-600">{formatCurrency(stats.elevenLabsCost)}</span>
              </div>
              <div className="flex items-center justify-between py-3 border-b">
                <span className="text-sm text-muted-foreground">AI Calls Made</span>
                <span className="text-lg font-bold">{stats.callCount}</span>
              </div>
              <div className="flex items-center justify-between py-3 border-b">
                <span className="text-sm text-muted-foreground">Total Call Minutes</span>
                <span className="text-lg font-bold">{stats.totalCallMinutes.toFixed(1)} min</span>
              </div>
              <div className="flex items-center justify-between py-3 border-b">
                <span className="text-sm text-muted-foreground">Booking Fees ($5 × {stats.totalBookings})</span>
                <span className="text-lg font-bold text-blue-600">{formatCurrency(stats.bookingFeeTally)}</span>
              </div>
              <div className="flex items-center justify-between py-3 bg-muted/50 -mx-4 px-4 rounded">
                <span className="text-sm font-medium">Total Platform Cost</span>
                <span className="text-xl font-bold">{formatCurrency(stats.totalPlatformCost)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Revenue Summary */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-serif flex items-center gap-2">
              <Target className="h-5 w-5" />
              Revenue Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between py-3 border-b">
                <span className="text-sm text-muted-foreground">Total Revenue (Booked)</span>
                <span className="text-lg font-bold">{formatCurrency(stats.totalRevenue)}</span>
              </div>
              <div className="flex items-center justify-between py-3 border-b">
                <span className="text-sm text-muted-foreground">AI-Attributed Revenue</span>
                <span className="text-lg font-bold text-emerald-600">{formatCurrency(stats.aiRevenue)}</span>
              </div>
              <div className="flex items-center justify-between py-3 border-b">
                <span className="text-sm text-muted-foreground">Total Commission</span>
                <span className="text-lg font-bold">{formatCurrency(stats.totalCommission)}</span>
              </div>
              <div className="flex items-center justify-between py-3 border-b">
                <span className="text-sm text-muted-foreground">AI Commission</span>
                <span className="text-lg font-bold text-blue-600">{formatCurrency(stats.aiCommission)}</span>
              </div>
              <div className={`flex items-center justify-between py-3 -mx-4 px-4 rounded ${stats.netProfit >= 0 ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}>
                <span className="text-sm font-medium">Net Profit</span>
                <span className={`text-xl font-bold ${stats.netProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {formatCurrency(stats.netProfit)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
