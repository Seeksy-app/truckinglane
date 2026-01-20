import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";

type IntegrationCategory = "Financial" | "Loadboards & DFM" | "Rating & Execution" | "Risk Management";

interface Integration {
  name: string;
  category: IntegrationCategory;
  url?: string;
}

const integrations: Integration[] = [
  // Financial
  { name: "1099 Pro", category: "Financial", url: "https://www.1099pro.com/" },
  { name: "ACH Debit", category: "Financial", url: "https://www.fiscal.treasury.gov/ach/" },
  { name: "BAM Financial", category: "Financial", url: "https://www.bamfi.com/" },
  { name: "Bill.com", category: "Financial", url: "https://www.bill.com/" },
  { name: "Breakthrough Fuel", category: "Financial", url: "https://www.breakthroughfuel.com/" },
  { name: "Comdata", category: "Financial", url: "https://www.comdata.com/" },
  { name: "Denim", category: "Financial" },
  { name: "Dynamic Systems", category: "Financial" },
  { name: "EFS", category: "Financial" },
  { name: "EpayManager", category: "Financial" },
  { name: "HaulPay", category: "Financial", url: "https://haulpay.co/" },
  { name: "Microsoft Dynamics GP", category: "Financial", url: "https://dynamics.microsoft.com/en-us/gp/" },
  { name: "Moneiva", category: "Financial" },
  { name: "NetSuite", category: "Financial", url: "https://www.netsuite.com/portal/home.shtml" },
  { name: "QuickBooks", category: "Financial" },
  { name: "Relay Payments", category: "Financial" },
  { name: "RTS Financial", category: "Financial" },
  { name: "Thunder Funding", category: "Financial" },
  { name: "TriumphPay", category: "Financial" },
  
  // Loadboards & DFM
  { name: "123Loadboard", category: "Loadboards & DFM", url: "https://www.123loadboard.com/" },
  { name: "DAT", category: "Loadboards & DFM", url: "https://www.dat.com/" },
  { name: "Macropoint", category: "Loadboards & DFM" },
  { name: "Direct Freight", category: "Loadboards & DFM", url: "https://www.directfreight.com/home/" },
  { name: "FleetOps", category: "Loadboards & DFM", url: "https://www.fleetops.ai/" },
  { name: "Trucker Tools", category: "Loadboards & DFM" },
  { name: "Truckstop.com", category: "Loadboards & DFM" },
  { name: "project44", category: "Loadboards & DFM" },
  { name: "FourKites", category: "Loadboards & DFM" },
  
  // Rating & Execution
  { name: "FreightWaves SONAR", category: "Rating & Execution", url: "https://sonar.freightwaves.com/" },
  { name: "Kleinschmidt", category: "Rating & Execution", url: "https://www.kleinschmidt.com/" },
  { name: "Logistical Labs", category: "Rating & Execution", url: "https://www.logisticallabs.com/" },
  { name: "Greenscreens.ai", category: "Rating & Execution" },
  { name: "SMC³", category: "Rating & Execution" },
  { name: "Uber Freight", category: "Rating & Execution" },
  
  // Risk Management
  { name: "Highway", category: "Risk Management" },
  { name: "MyCarrierPortal", category: "Risk Management" },
  { name: "RMIS", category: "Risk Management" },
  { name: "Carrier411", category: "Risk Management" },
  { name: "SaferWatch", category: "Risk Management" },
];

const categoryColors: Record<IntegrationCategory, string> = {
  "Financial": "bg-[hsl(145,63%,42%)]/15 text-[hsl(145,63%,35%)] border-[hsl(145,63%,42%)]/30",
  "Loadboards & DFM": "bg-[hsl(210,80%,45%)]/15 text-[hsl(210,80%,40%)] border-[hsl(210,80%,45%)]/30",
  "Rating & Execution": "bg-[hsl(25,95%,53%)]/15 text-[hsl(25,95%,45%)] border-[hsl(25,95%,53%)]/30",
  "Risk Management": "bg-[hsl(280,65%,55%)]/15 text-[hsl(280,65%,45%)] border-[hsl(280,65%,55%)]/30",
};

export function DemoIntegrations() {
  const categories: IntegrationCategory[] = ["Financial", "Loadboards & DFM", "Rating & Execution", "Risk Management"];
  
  const groupedIntegrations = categories.reduce((acc, category) => {
    acc[category] = integrations.filter(i => i.category === category);
    return acc;
  }, {} as Record<IntegrationCategory, Integration[]>);

  return (
    <div className="space-y-8">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-serif font-semibold">40+ Integrations</h2>
        <p className="text-muted-foreground max-w-lg mx-auto">
          Connect with leading freight technology providers. Unify your app ecosystem in a single place.
        </p>
      </div>

      <div className="flex flex-wrap justify-center gap-2 mb-6">
        {categories.map((category) => (
          <Badge key={category} variant="outline" className={categoryColors[category]}>
            {category} ({groupedIntegrations[category].length})
          </Badge>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {categories.map((category) => (
          <div key={category} className="rounded-lg border border-border bg-card p-4">
            <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
              <Badge variant="outline" className={categoryColors[category]}>
                {category}
              </Badge>
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {groupedIntegrations[category].map((integration) => (
                <div
                  key={integration.name}
                  className="flex items-center justify-between p-2 rounded-md bg-muted/50 hover:bg-muted transition-colors text-sm"
                >
                  <span className="text-foreground truncate">{integration.name}</span>
                  {integration.url && (
                    <a
                      href={integration.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-foreground shrink-0 ml-2"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <p className="text-center text-xs text-muted-foreground">
        Powered by the Descartes Global Logistics Network™ — EDI and API connections available
      </p>
    </div>
  );
}