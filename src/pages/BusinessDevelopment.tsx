import { useState } from 'react';
import { AppHeader } from '@/components/AppHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FileText, TrendingUp, Rocket, Target, Users, DollarSign, Calendar, CheckCircle2, ArrowRight, Building2, Truck, Phone } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export default function BusinessDevelopment() {
  const [activeTab, setActiveTab] = useState('business-plan');

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      
      <div className="container mx-auto px-4 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground">Business Development</h1>
          <p className="text-muted-foreground">Strategic planning and growth roadmap for Trucking Lane</p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-3 max-w-xl">
            <TabsTrigger value="business-plan" className="gap-2">
              <FileText className="h-4 w-4" />
              <span className="hidden sm:inline">Business Plan</span>
            </TabsTrigger>
            <TabsTrigger value="projections" className="gap-2">
              <TrendingUp className="h-4 w-4" />
              <span className="hidden sm:inline">3-Year Projections</span>
            </TabsTrigger>
            <TabsTrigger value="gtm" className="gap-2">
              <Rocket className="h-4 w-4" />
              <span className="hidden sm:inline">Go-to-Market</span>
            </TabsTrigger>
          </TabsList>

          {/* Business Plan Tab */}
          <TabsContent value="business-plan" className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Target className="h-5 w-5 text-primary" />
                    Executive Summary
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-muted-foreground">
                    Trucking Lane is an AI-powered freight brokerage platform that revolutionizes carrier-broker 
                    communications through intelligent voice agents. Our platform handles inbound carrier calls 24/7, 
                    qualifies leads in real-time, and enables brokers to focus on high-value activities.
                  </p>
                  <div className="space-y-2">
                    <h4 className="font-semibold">Key Value Propositions:</h4>
                    <ul className="space-y-1 text-sm text-muted-foreground">
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        24/7 AI voice agent for carrier inquiries
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        Automated lead scoring and prioritization
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        Real-time carrier intelligence (FMCSA integration)
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        Team collaboration and chat features
                      </li>
                    </ul>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-primary" />
                    Target Market
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    <div className="p-3 bg-muted rounded-lg">
                      <h4 className="font-semibold flex items-center gap-2">
                        <Building2 className="h-4 w-4" />
                        Primary: Freight Brokerages
                      </h4>
                      <p className="text-sm text-muted-foreground mt-1">
                        Small to mid-size brokerages (5-50 agents) looking to scale operations without 
                        proportional headcount increases.
                      </p>
                    </div>
                    <div className="p-3 bg-muted rounded-lg">
                      <h4 className="font-semibold flex items-center gap-2">
                        <Truck className="h-4 w-4" />
                        Secondary: 3PLs & Logistics Companies
                      </h4>
                      <p className="text-sm text-muted-foreground mt-1">
                        Third-party logistics providers managing high carrier call volumes.
                      </p>
                    </div>
                  </div>
                  <div className="pt-2 border-t">
                    <p className="text-sm text-muted-foreground">
                      <strong>TAM:</strong> $15B freight brokerage software market<br />
                      <strong>SAM:</strong> $2.5B AI/automation segment<br />
                      <strong>SOM:</strong> $150M initial addressable market
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <DollarSign className="h-5 w-5 text-primary" />
                    Revenue Model
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    <div className="flex justify-between items-center p-3 bg-muted rounded-lg">
                      <div>
                        <h4 className="font-semibold">Starter</h4>
                        <p className="text-sm text-muted-foreground">Up to 3 agents</p>
                      </div>
                      <Badge variant="secondary">$299/mo</Badge>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-muted rounded-lg">
                      <div>
                        <h4 className="font-semibold">Professional</h4>
                        <p className="text-sm text-muted-foreground">Up to 15 agents</p>
                      </div>
                      <Badge variant="secondary">$799/mo</Badge>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-primary/10 rounded-lg border border-primary/20">
                      <div>
                        <h4 className="font-semibold">Enterprise</h4>
                        <p className="text-sm text-muted-foreground">Unlimited agents</p>
                      </div>
                      <Badge>Custom</Badge>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    + Usage-based AI minutes ($0.15/min after included allocation)
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Phone className="h-5 w-5 text-primary" />
                    Competitive Advantage
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ul className="space-y-2 text-sm">
                    <li className="flex items-start gap-2">
                      <ArrowRight className="h-4 w-4 text-primary mt-0.5" />
                      <span><strong>Industry-Specific AI:</strong> Trained on freight terminology, carrier negotiations, and load matching</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <ArrowRight className="h-4 w-4 text-primary mt-0.5" />
                      <span><strong>Real-Time FMCSA Integration:</strong> Instant carrier verification and safety scoring</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <ArrowRight className="h-4 w-4 text-primary mt-0.5" />
                      <span><strong>High-Intent Detection:</strong> Proprietary keyword matching for lead prioritization</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <ArrowRight className="h-4 w-4 text-primary mt-0.5" />
                      <span><strong>Seamless Workflow:</strong> Built for broker workflows, not adapted from generic CRM</span>
                    </li>
                  </ul>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* 3-Year Projections Tab */}
          <TabsContent value="projections" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Three-Year Financial Projections</CardTitle>
                <CardDescription>Based on freight brokerage industry growth rates and SaaS benchmarks</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-3 px-4 font-semibold">Metric</th>
                        <th className="text-right py-3 px-4 font-semibold">Year 1</th>
                        <th className="text-right py-3 px-4 font-semibold">Year 2</th>
                        <th className="text-right py-3 px-4 font-semibold">Year 3</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      <tr className="bg-muted/50">
                        <td className="py-3 px-4 font-medium">Agency Customers</td>
                        <td className="text-right py-3 px-4">25</td>
                        <td className="text-right py-3 px-4">85</td>
                        <td className="text-right py-3 px-4">200</td>
                      </tr>
                      <tr>
                        <td className="py-3 px-4 font-medium">Avg. Agents per Agency</td>
                        <td className="text-right py-3 px-4">8</td>
                        <td className="text-right py-3 px-4">12</td>
                        <td className="text-right py-3 px-4">15</td>
                      </tr>
                      <tr className="bg-muted/50">
                        <td className="py-3 px-4 font-medium">Monthly ARPU</td>
                        <td className="text-right py-3 px-4">$650</td>
                        <td className="text-right py-3 px-4">$850</td>
                        <td className="text-right py-3 px-4">$1,100</td>
                      </tr>
                      <tr>
                        <td className="py-3 px-4 font-medium">Annual Recurring Revenue</td>
                        <td className="text-right py-3 px-4 text-primary font-semibold">$195K</td>
                        <td className="text-right py-3 px-4 text-primary font-semibold">$867K</td>
                        <td className="text-right py-3 px-4 text-primary font-semibold">$2.64M</td>
                      </tr>
                      <tr className="bg-muted/50">
                        <td className="py-3 px-4 font-medium">AI Minutes Consumed (Monthly)</td>
                        <td className="text-right py-3 px-4">15,000</td>
                        <td className="text-right py-3 px-4">75,000</td>
                        <td className="text-right py-3 px-4">250,000</td>
                      </tr>
                      <tr>
                        <td className="py-3 px-4 font-medium">Usage Revenue (Annual)</td>
                        <td className="text-right py-3 px-4">$27K</td>
                        <td className="text-right py-3 px-4">$135K</td>
                        <td className="text-right py-3 px-4">$450K</td>
                      </tr>
                      <tr className="bg-primary/10 font-semibold">
                        <td className="py-3 px-4">Total Revenue</td>
                        <td className="text-right py-3 px-4">$222K</td>
                        <td className="text-right py-3 px-4">$1.0M</td>
                        <td className="text-right py-3 px-4">$3.1M</td>
                      </tr>
                      <tr>
                        <td className="py-3 px-4 font-medium">Gross Margin</td>
                        <td className="text-right py-3 px-4">65%</td>
                        <td className="text-right py-3 px-4">72%</td>
                        <td className="text-right py-3 px-4">78%</td>
                      </tr>
                      <tr className="bg-muted/50">
                        <td className="py-3 px-4 font-medium">Customer Churn Rate</td>
                        <td className="text-right py-3 px-4">8%</td>
                        <td className="text-right py-3 px-4">5%</td>
                        <td className="text-right py-3 px-4">3%</td>
                      </tr>
                      <tr>
                        <td className="py-3 px-4 font-medium">Net Revenue Retention</td>
                        <td className="text-right py-3 px-4">105%</td>
                        <td className="text-right py-3 px-4">115%</td>
                        <td className="text-right py-3 px-4">125%</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-6 md:grid-cols-3">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">Industry Tailwinds</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-muted-foreground">
                  <p>• Freight brokerage market growing 4.5% CAGR</p>
                  <p>• AI adoption in logistics accelerating (35% YoY)</p>
                  <p>• Labor costs increasing 8% annually</p>
                  <p>• Digital transformation imperative post-2020</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">Key Assumptions</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-muted-foreground">
                  <p>• 3.5x customer growth Y1→Y2</p>
                  <p>• 2.4x customer growth Y2→Y3</p>
                  <p>• 15% annual price increase capability</p>
                  <p>• AI costs declining 20% annually</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">Investment Needs</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-muted-foreground">
                  <p>• Year 1: $500K (product + initial sales)</p>
                  <p>• Year 2: $1.2M (scale sales team)</p>
                  <p>• Year 3: $2M (market expansion)</p>
                  <p>• Break-even: Month 18</p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Go-to-Market Tab */}
          <TabsContent value="gtm" className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="h-5 w-5 text-primary" />
                    Phase 1: Foundation (Months 1-6)
                  </CardTitle>
                  <CardDescription>Build credibility and early adopters</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-2">
                    <h4 className="font-semibold text-sm">Target: 10-15 pilot customers</h4>
                    <ul className="space-y-1 text-sm text-muted-foreground">
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-3 w-3 text-green-500" />
                        Direct outreach to freight broker networks
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-3 w-3 text-green-500" />
                        Industry conference presence (TIA, TMSA)
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-3 w-3 text-green-500" />
                        Free pilot program (3 months)
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-3 w-3 text-green-500" />
                        Case study development
                      </li>
                    </ul>
                  </div>
                  <div className="pt-2 border-t">
                    <p className="text-xs text-muted-foreground">
                      <strong>Budget:</strong> $75K | <strong>CAC Target:</strong> $5,000
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="h-5 w-5 text-primary" />
                    Phase 2: Scale (Months 7-12)
                  </CardTitle>
                  <CardDescription>Accelerate with proven playbook</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-2">
                    <h4 className="font-semibold text-sm">Target: 25+ paying customers</h4>
                    <ul className="space-y-1 text-sm text-muted-foreground">
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-3 w-3 text-green-500" />
                        LinkedIn/Google Ads campaigns
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-3 w-3 text-green-500" />
                        Content marketing (blog, webinars)
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-3 w-3 text-green-500" />
                        Partner program with TMS vendors
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-3 w-3 text-green-500" />
                        Referral incentive program
                      </li>
                    </ul>
                  </div>
                  <div className="pt-2 border-t">
                    <p className="text-xs text-muted-foreground">
                      <strong>Budget:</strong> $150K | <strong>CAC Target:</strong> $4,000
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="h-5 w-5 text-primary" />
                    Phase 3: Expand (Year 2)
                  </CardTitle>
                  <CardDescription>Multi-channel growth engine</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-2">
                    <h4 className="font-semibold text-sm">Target: 85+ customers, $1M ARR</h4>
                    <ul className="space-y-1 text-sm text-muted-foreground">
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-3 w-3 text-green-500" />
                        Dedicated sales team (3-5 reps)
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-3 w-3 text-green-500" />
                        Enterprise sales motion
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-3 w-3 text-green-500" />
                        Integration marketplace
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-3 w-3 text-green-500" />
                        Geographic expansion
                      </li>
                    </ul>
                  </div>
                  <div className="pt-2 border-t">
                    <p className="text-xs text-muted-foreground">
                      <strong>Budget:</strong> $400K | <strong>CAC Target:</strong> $3,500
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="h-5 w-5 text-primary" />
                    Phase 4: Dominate (Year 3)
                  </CardTitle>
                  <CardDescription>Category leadership</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-2">
                    <h4 className="font-semibold text-sm">Target: 200+ customers, $3M ARR</h4>
                    <ul className="space-y-1 text-sm text-muted-foreground">
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-3 w-3 text-green-500" />
                        Channel partner program
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-3 w-3 text-green-500" />
                        Strategic acquisitions
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-3 w-3 text-green-500" />
                        International expansion (Canada, Mexico)
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-3 w-3 text-green-500" />
                        Product-led growth features
                      </li>
                    </ul>
                  </div>
                  <div className="pt-2 border-t">
                    <p className="text-xs text-muted-foreground">
                      <strong>Budget:</strong> $600K | <strong>CAC Target:</strong> $3,000
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Channel Mix Strategy</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-4">
                  <div className="text-center p-4 bg-muted rounded-lg">
                    <div className="text-2xl font-bold text-primary">40%</div>
                    <div className="text-sm font-medium">Direct Sales</div>
                    <div className="text-xs text-muted-foreground">Outbound + events</div>
                  </div>
                  <div className="text-center p-4 bg-muted rounded-lg">
                    <div className="text-2xl font-bold text-primary">25%</div>
                    <div className="text-sm font-medium">Inbound Marketing</div>
                    <div className="text-xs text-muted-foreground">SEO, content, ads</div>
                  </div>
                  <div className="text-center p-4 bg-muted rounded-lg">
                    <div className="text-2xl font-bold text-primary">20%</div>
                    <div className="text-sm font-medium">Partners</div>
                    <div className="text-xs text-muted-foreground">TMS, load boards</div>
                  </div>
                  <div className="text-center p-4 bg-muted rounded-lg">
                    <div className="text-2xl font-bold text-primary">15%</div>
                    <div className="text-sm font-medium">Referrals</div>
                    <div className="text-xs text-muted-foreground">Customer advocacy</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
