import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Phone, TrendingUp, Users, DollarSign } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

// Demo data for analytics visualization
const generateDemoTimeSeriesData = () => {
  const data = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    data.push({
      date: date.toLocaleDateString('en-US', { weekday: 'short' }),
      calls: Math.floor(Math.random() * 30) + 15,
      leads: Math.floor(Math.random() * 20) + 8,
      booked: Math.floor(Math.random() * 10) + 3,
    });
  }
  return data;
};

const sentimentData = [
  { name: "Positive", value: 62, color: "hsl(145, 63%, 42%)" },
  { name: "Neutral", value: 28, color: "hsl(38, 92%, 50%)" },
  { name: "Negative", value: 10, color: "hsl(0, 72%, 51%)" },
];

export function DemoAnalytics() {
  const timeSeriesData = useMemo(() => generateDemoTimeSeriesData(), []);
  
  const stats = useMemo(() => {
    const totalCalls = timeSeriesData.reduce((acc, d) => acc + d.calls, 0);
    const totalLeads = timeSeriesData.reduce((acc, d) => acc + d.leads, 0);
    const totalBooked = timeSeriesData.reduce((acc, d) => acc + d.booked, 0);
    const conversionRate = totalLeads > 0 ? ((totalBooked / totalLeads) * 100).toFixed(1) : "0";
    return { totalCalls, totalLeads, totalBooked, conversionRate };
  }, [timeSeriesData]);

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Phone className="h-4 w-4 text-[hsl(210,80%,45%)]" />
              AI Calls (7d)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.totalCalls}</p>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Users className="h-4 w-4 text-[hsl(38,92%,50%)]" />
              Pending Leads
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.totalLeads}</p>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-[hsl(145,63%,42%)]" />
              Booked
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.totalBooked}</p>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-[hsl(25,95%,53%)]" />
              Conversion Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.conversionRate}%</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Time Series Chart */}
        <Card className="border-border bg-card lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">AI Calls vs Leads vs Booked</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={timeSeriesData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorCalls" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(210, 80%, 45%)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(210, 80%, 45%)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorLeads" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(38, 92%, 50%)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(38, 92%, 50%)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorBooked" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(145, 63%, 42%)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(145, 63%, 42%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                  />
                  <Area type="monotone" dataKey="calls" stroke="hsl(210, 80%, 45%)" fillOpacity={1} fill="url(#colorCalls)" name="AI Calls" />
                  <Area type="monotone" dataKey="leads" stroke="hsl(38, 92%, 50%)" fillOpacity={1} fill="url(#colorLeads)" name="Leads" />
                  <Area type="monotone" dataKey="booked" stroke="hsl(145, 63%, 42%)" fillOpacity={1} fill="url(#colorBooked)" name="Booked" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Sentiment Pie Chart */}
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-base">Call Sentiment</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={sentimentData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {sentimentData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                    formatter={(value: number) => [`${value}%`, ""]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex justify-center gap-4 mt-2">
              {sentimentData.map((item) => (
                <div key={item.name} className="flex items-center gap-1.5 text-xs">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="text-muted-foreground">{item.name}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}