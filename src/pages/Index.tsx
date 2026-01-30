import { useEffect, useRef, useState } from "react";
import { motion, useInView } from "framer-motion";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { 
  ArrowRight, 
  Sparkles, 
  Phone, 
  Target, 
  Zap, 
  Bot, 
  Shield, 
  Clock, 
  TrendingUp,
  Truck,
  Users,
  Headphones,
  BarChart3,
  Globe,
  CheckCircle,
  Star,
  Play,
  ChevronDown,
  Link as LinkIcon
} from "lucide-react";
import { Logo } from "@/components/Logo";
import truckingHero from "@/assets/trucking-hero.jpg";
import dispatcherOffice from "@/assets/dispatcher-office.jpg";
import freightBroker from "@/assets/freight-broker.jpg";
import truckDriver from "@/assets/truck-driver.jpg";
import fleetTrucks from "@/assets/fleet-trucks.jpg";
import aiTechnology from "@/assets/ai-technology.jpg";

const Index = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) {
      navigate("/dashboard", { replace: true });
    }
  }, [user, loading, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-[hsl(220,15%,8%)]">
      {/* Hero Section */}
      <HeroSection />
      
      {/* AI Features Section */}
      <AIFeaturesSection />
      
      {/* Audience Section */}
      <AudienceSection />
      
      {/* How It Works */}
      <HowItWorksSection />
      
      {/* Integrations Section */}
      <IntegrationsSection />
      
      {/* Stats Section */}
      <StatsSection />
      
      {/* CTA Section */}
      <CTASection />
      
      {/* Footer */}
      <Footer />
    </div>
  );
};

// Hero Section
function HeroSection() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <img 
        src={'https://truckinglane.s3.us-east-1.amazonaws.com/trucking-hero.jpg'} 
        alt="Semi truck on highway at sunset" 
        className="absolute inset-0 w-full h-full object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-[hsl(220,15%,8%)]/80 via-[hsl(220,15%,8%)]/60 to-[hsl(220,15%,8%)]" />
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[hsl(25,95%,53%)] via-[hsl(25,95%,53%)] to-transparent" />

      <div className="relative z-10 min-h-screen flex flex-col">
        <motion.header 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="p-6 lg:p-8 flex justify-between items-center"
        >
          <Logo size="md" />
          <div className="flex gap-3">
            <Button asChild variant="ghost" className="text-white/80 hover:text-white hover:bg-white/10">
              <Link to="/demo">Try Demo</Link>
            </Button>
            <Button asChild variant="ghost" className="text-white/80 hover:text-white hover:bg-white/10">
              <Link to="/signup/agency">Agency Signup</Link>
            </Button>
            <Button asChild className="bg-[hsl(25,95%,53%)] hover:bg-[hsl(25,95%,48%)]">
              <Link to="/auth">Sign In</Link>
            </Button>
          </div>
        </motion.header>

        <main className="flex-1 flex items-center justify-center px-6 py-12">
          <div className="max-w-4xl mx-auto text-center space-y-8">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
            >
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[hsl(25,95%,53%)]/20 border border-[hsl(25,95%,53%)]/30 text-[hsl(25,95%,53%)] mb-6">
                <Sparkles className="h-4 w-4" />
                <span className="text-sm font-semibold uppercase tracking-[0.15em]">AI-Powered Dispatch Intelligence</span>
              </div>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.1 }}
              className="font-serif text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-medium text-white leading-[1.05] tracking-tight"
            >
              Your AI Co-Pilot<br />
              <span className="text-[hsl(25,95%,53%)]">Never Sleeps</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="font-sans text-xl sm:text-2xl text-white/70 leading-relaxed max-w-2xl mx-auto"
            >
              The first AI assistant built exclusively for trucking. Answer calls, qualify carriers, and book loads — automatically.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.3 }}
              className="flex flex-wrap justify-center gap-4 pt-4"
            >
              <Button asChild size="lg" className="gap-2 h-16 px-10 text-lg bg-[hsl(25,95%,53%)] hover:bg-[hsl(25,95%,48%)] shadow-2xl shadow-[hsl(25,95%,53%)]/30">
                <Link to="/demo">
                  <Play className="h-5 w-5" />
                  Watch Demo
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="gap-2 h-16 px-10 text-lg bg-white/10 border-white/30 text-white hover:bg-white/20">
                <Link to="/auth">
                  Get Started Free
                  <ArrowRight className="h-5 w-5" />
                </Link>
              </Button>
            </motion.div>

            {/* Trusted by */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 1, delay: 0.6 }}
              className="pt-16"
            >
              <p className="text-white/40 text-sm uppercase tracking-widest mb-6">Trusted by dispatch teams nationwide</p>
              <div className="flex justify-center items-center gap-8 flex-wrap">
                {["24/7 Coverage", "FMCSA Verified", "50+ Languages", "Real-time Intel"].map((item, i) => (
                  <div key={i} className="flex items-center gap-2 text-white/60">
                    <CheckCircle className="h-4 w-4 text-[hsl(25,95%,53%)]" />
                    <span className="text-sm font-medium">{item}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        </main>

        {/* Scroll indicator */}
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2"
        >
          <motion.div
            animate={{ y: [0, 8, 0] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          >
            <ChevronDown className="h-8 w-8 text-white/40" />
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}

// AI Features Section
function AIFeaturesSection() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  const features = [
    {
      icon: Phone,
      title: "Smart Call Handling",
      description: "AI answers every call instantly, qualifies carriers, captures intent, and routes hot leads to your team.",
      stat: "100%",
      statLabel: "Calls Answered"
    },
    {
      icon: Shield,
      title: "FMCSA Verification",
      description: "Real-time carrier authority checks, insurance validation, and safety scoring — before you pick up.",
      stat: "< 2s",
      statLabel: "Verification Time"
    },
    {
      icon: Target,
      title: "Intent Scoring",
      description: "AI detects buying signals and prioritizes your callback queue based on close probability.",
      stat: "3x",
      statLabel: "Higher Close Rate"
    },
    {
      icon: Globe,
      title: "50+ Languages",
      description: "Communicate with carriers in their preferred language. Spanish, Portuguese, Russian, and more.",
      stat: "50+",
      statLabel: "Languages"
    },
    {
      icon: Clock,
      title: "24/7 Availability",
      description: "Never miss an opportunity. Your AI assistant works nights, weekends, and holidays.",
      stat: "24/7",
      statLabel: "Always On"
    },
    {
      icon: BarChart3,
      title: "Real-time Analytics",
      description: "Track call volumes, conversion rates, agent performance, and ROI in one dashboard.",
      stat: "Live",
      statLabel: "Analytics"
    },
  ];

  return (
    <section ref={ref} className="py-24 lg:py-32 px-6 bg-gradient-to-b from-[hsl(220,15%,8%)] to-[hsl(220,15%,12%)]">
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[hsl(25,95%,53%)]/10 border border-[hsl(25,95%,53%)]/20 text-[hsl(25,95%,53%)] mb-6">
            <Bot className="h-4 w-4" />
            <span className="text-sm font-semibold uppercase tracking-wider">AI Intelligence</span>
          </div>
          <h2 className="font-serif text-4xl md:text-5xl lg:text-6xl font-medium text-white mb-6">
            Dispatch Intelligence<br />
            <span className="text-[hsl(25,95%,53%)]">Reimagined</span>
          </h2>
          <p className="text-xl text-white/60 max-w-2xl mx-auto">
            Purpose-built for the trucking industry. Every feature designed to help you move more freight, faster.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, index) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 30 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="group relative p-8 rounded-2xl bg-white/5 border border-white/10 hover:border-[hsl(25,95%,53%)]/50 transition-all duration-300 hover:bg-white/[0.08]"
            >
              <div className="absolute top-8 right-8">
                <div className="text-right">
                  <p className="text-2xl font-bold text-[hsl(25,95%,53%)]">{feature.stat}</p>
                  <p className="text-xs text-white/40 uppercase tracking-wider">{feature.statLabel}</p>
                </div>
              </div>
              
              <div className="h-14 w-14 rounded-xl bg-[hsl(25,95%,53%)]/10 flex items-center justify-center mb-6 group-hover:bg-[hsl(25,95%,53%)]/20 transition-colors">
                <feature.icon className="h-7 w-7 text-[hsl(25,95%,53%)]" />
              </div>
              
              <h3 className="text-xl font-semibold text-white mb-3">{feature.title}</h3>
              <p className="text-white/60 leading-relaxed">{feature.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// Audience Section
function AudienceSection() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  const audiences = [
    {
      image: 'https://truckinglane.s3.us-east-1.amazonaws.com/freight-broker.jpg',
      title: "Freight Brokers",
      description: "Scale your brokerage without scaling your team. Let AI handle carrier qualification while you focus on building shipper relationships.",
      benefits: ["Qualify carriers instantly", "Never miss a load call", "Automated compliance checks"],
      icon: Users
    },
    {
      image: 'https://truckinglane.s3.us-east-1.amazonaws.com/dispatcher-office.jpg',
      title: "Dispatchers",
      description: "Stop juggling phone calls. AI captures every inquiry, prioritizes callbacks, and gives you the intel to close faster.",
      benefits: ["Smart callback queue", "Real-time lead scoring", "One-click carrier verification"],
      icon: Headphones
    },
    {
      image: 'https://truckinglane.s3.us-east-1.amazonaws.com/fleet-trucks.jpg',
      title: "Carriers & Fleets",
      description: "Get your trucks loaded faster. Our AI connects you with the right loads and dispatchers who are ready to book.",
      benefits: ["Faster load matching", "Direct broker connections", "Fair rate transparency"],
      icon: Truck
    },
    {
      image: 'https://truckinglane.s3.us-east-1.amazonaws.com/truck-driver.jpg',
      title: "Owner-Operators",
      description: "Focus on driving while AI handles your dispatch communications. Get notified about the loads that match your lanes.",
      benefits: ["Lane-matched opportunities", "Simple call-back system", "No middleman delays"],
      icon: Star
    },
  ];

  return (
    <section ref={ref} className="py-24 lg:py-32 px-6 bg-[hsl(220,15%,12%)]">
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-white/70 mb-6">
            <Users className="h-4 w-4" />
            <span className="text-sm font-semibold uppercase tracking-wider">Built For You</span>
          </div>
          <h2 className="font-serif text-4xl md:text-5xl lg:text-6xl font-medium text-white mb-6">
            Every Role in the<br />
            <span className="text-[hsl(25,95%,53%)]">Supply Chain</span>
          </h2>
          <p className="text-xl text-white/60 max-w-2xl mx-auto">
            Whether you're moving one truck or managing a fleet of hundreds, Truckinglane adapts to your workflow.
          </p>
        </motion.div>

        <div className="grid lg:grid-cols-2 gap-8">
          {audiences.map((audience, index) => (
            <motion.div
              key={audience.title}
              initial={{ opacity: 0, y: 40 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.6, delay: index * 0.15 }}
              className="group relative overflow-hidden rounded-3xl bg-white/5 border border-white/10 hover:border-[hsl(25,95%,53%)]/40 transition-all duration-500"
            >
              <div className="grid md:grid-cols-2">
                <div className="relative h-64 md:h-auto overflow-hidden">
                  <img 
                    src={audience.image} 
                    alt={audience.title}
                    className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                  />
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent to-[hsl(220,15%,12%)] md:block hidden" />
                  <div className="absolute inset-0 bg-gradient-to-t from-[hsl(220,15%,12%)] to-transparent md:hidden" />
                </div>
                
                <div className="p-8 flex flex-col justify-center">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="h-10 w-10 rounded-lg bg-[hsl(25,95%,53%)]/10 flex items-center justify-center">
                      <audience.icon className="h-5 w-5 text-[hsl(25,95%,53%)]" />
                    </div>
                    <h3 className="text-2xl font-semibold text-white">{audience.title}</h3>
                  </div>
                  
                  <p className="text-white/60 mb-6 leading-relaxed">{audience.description}</p>
                  
                  <ul className="space-y-2">
                    {audience.benefits.map((benefit, i) => (
                      <li key={i} className="flex items-center gap-2 text-white/80">
                        <CheckCircle className="h-4 w-4 text-[hsl(25,95%,53%)]" />
                        <span className="text-sm">{benefit}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// How It Works Section
function HowItWorksSection() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  const steps = [
    {
      step: "01",
      title: "Carrier Calls In",
      description: "A carrier sees your load posting and calls. Your AI assistant answers instantly, in their language."
    },
    {
      step: "02",
      title: "AI Qualifies & Verifies",
      description: "AI captures intent, checks FMCSA authority, validates insurance, and scores the lead in real-time."
    },
    {
      step: "03",
      title: "Hot Leads to Your Queue",
      description: "High-intent leads appear in your dashboard, prioritized by close probability with full context."
    },
    {
      step: "04",
      title: "You Close the Deal",
      description: "Call back the best leads first. One-click to verify, negotiate, and book — all in one place."
    },
  ];

  return (
    <section ref={ref} className="py-24 lg:py-32 px-6 relative overflow-hidden">
      <div className="absolute inset-0">
        <img 
          src={aiTechnology} 
          alt="AI Technology" 
          className="w-full h-full object-cover opacity-10"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[hsl(220,15%,12%)] via-[hsl(220,15%,8%)]/95 to-[hsl(220,15%,8%)]" />
      </div>

      <div className="relative z-10 max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[hsl(25,95%,53%)]/10 border border-[hsl(25,95%,53%)]/20 text-[hsl(25,95%,53%)] mb-6">
            <Zap className="h-4 w-4" />
            <span className="text-sm font-semibold uppercase tracking-wider">How It Works</span>
          </div>
          <h2 className="font-serif text-4xl md:text-5xl lg:text-6xl font-medium text-white mb-6">
            From Call to Booked<br />
            <span className="text-[hsl(25,95%,53%)]">In Minutes</span>
          </h2>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
          {steps.map((step, index) => (
            <motion.div
              key={step.step}
              initial={{ opacity: 0, y: 30 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: index * 0.15 }}
              className="relative"
            >
              {index < steps.length - 1 && (
                <div className="hidden lg:block absolute top-8 left-full w-full h-px bg-gradient-to-r from-[hsl(25,95%,53%)]/50 to-transparent" />
              )}
              
              <div className="text-6xl font-bold text-[hsl(25,95%,53%)] mb-4">{step.step}</div>
              <h3 className="text-xl font-semibold text-white mb-3">{step.title}</h3>
              <p className="text-white/60 leading-relaxed">{step.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// Integrations Section
function IntegrationsSection() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  const integrations = [
    { name: "Twilio", category: "Communications" },
    { name: "Aljex", category: "TMS" },
    { name: "DAT", category: "Loadboards" },
    { name: "Intuit", category: "Financial" },
    { name: "Zoho", category: "CRM" },
    { name: "Go High Level", category: "Marketing" },
    { name: "Freshworks", category: "CRM" },
    { name: "HubSpot", category: "CRM" },
  ];

  return (
    <section ref={ref} className="py-24 lg:py-32 px-6 bg-[hsl(220,15%,10%)]">
      <div className="max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-white/70 mb-6">
            <LinkIcon className="h-4 w-4" />
            <span className="text-sm font-semibold uppercase tracking-wider">Integrations</span>
          </div>
          <h2 className="font-serif text-4xl md:text-5xl lg:text-6xl font-medium text-white mb-6">
            Connect Your<br />
            <span className="text-[hsl(25,95%,53%)]">Entire Stack</span>
          </h2>
          <p className="text-xl text-white/60 max-w-2xl mx-auto">
            Seamlessly integrate with the tools you already use.
          </p>
        </motion.div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {integrations.map((integration, index) => (
            <motion.div
              key={integration.name}
              initial={{ opacity: 0, y: 20 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.4, delay: index * 0.05 }}
              className="group p-6 rounded-2xl bg-white/5 border border-white/10 hover:border-[hsl(25,95%,53%)]/50 transition-all duration-300 text-center"
            >
              <h3 className="text-lg font-semibold text-white mb-1">{integration.name}</h3>
              <p className="text-sm text-white/40">{integration.category}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// Stats Section
function StatsSection() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });
  const [stats, setStats] = useState({
    totalCalls: 0,
    totalMinutes: 0,
    totalLeads: 0,
  });

  useEffect(() => {
    const fetchStats = async () => {
      try {
        // Use edge function to bypass RLS for public stats
        const response = await fetch(
          "https://vjgakkomhphvdbwjjwiv.supabase.co/functions/v1/public-stats"
        );
        
        if (response.ok) {
          const data = await response.json();
          setStats({
            totalCalls: data.ai_calls || 0,
            totalMinutes: data.ai_minutes || 0,
            totalLeads: data.leads || 0,
          });
        }
      } catch (error) {
        console.error("Error fetching stats:", error);
      }
    };

    fetchStats();
  }, []);

  const displayStats = [
    { value: stats.totalCalls.toLocaleString(), label: "AI Calls Handled" },
    { value: `${stats.totalMinutes.toLocaleString()}+`, label: "AI Minutes Logged" },
    { value: stats.totalLeads.toLocaleString(), label: "Leads Generated" },
  ];

  return (
    <section ref={ref} className="py-24 lg:py-32 px-6 bg-[hsl(25,95%,53%)]">
      <div className="max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="font-serif text-4xl md:text-5xl font-medium text-white mb-4">
            The Numbers Don't Lie
          </h2>
          <p className="text-xl text-white/80">
            Real results from real dispatch teams using Truckinglane.
          </p>
        </motion.div>

        <div className="grid grid-cols-3 gap-8">
          {displayStats.map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="text-center"
            >
              <p className="text-5xl lg:text-6xl font-bold text-white drop-shadow-lg mb-2">{stat.value}</p>
              <p className="text-white/90 font-medium">{stat.label}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// CTA Section
function CTASection() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section ref={ref} className="py-24 lg:py-32 px-6 bg-[hsl(220,15%,8%)]">
      <div className="max-w-4xl mx-auto text-center">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[hsl(25,95%,53%)]/10 border border-[hsl(25,95%,53%)]/20 text-[hsl(25,95%,53%)] mb-8">
            <Sparkles className="h-4 w-4" />
            <span className="text-sm font-semibold uppercase tracking-wider">Start Free Today</span>
          </div>
          
          <h2 className="font-serif text-4xl md:text-5xl lg:text-6xl font-medium text-white mb-6">
            Ready to Let AI Handle<br />
            <span className="text-[hsl(25,95%,53%)]">Your Load Calls?</span>
          </h2>
          
          <p className="text-xl text-white/60 mb-10 max-w-2xl mx-auto">
            Join hundreds of dispatch teams who are closing more loads with less effort. No credit card required.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button asChild size="lg" className="gap-2 h-16 px-12 text-lg bg-[hsl(25,95%,53%)] hover:bg-[hsl(25,95%,48%)] shadow-2xl shadow-[hsl(25,95%,53%)]/30">
              <Link to="/auth">
                Get Started Free
                <ArrowRight className="h-5 w-5" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="gap-2 h-16 px-12 text-lg bg-white/5 border-white/20 text-white hover:bg-white/10">
              <Link to="/demo">
                <Play className="h-5 w-5" />
                Watch Demo
              </Link>
            </Button>
          </div>
          
          <p className="mt-8 text-white/40 text-sm">
            No credit card required • Free 14-day trial • Cancel anytime
          </p>
        </motion.div>
      </div>
    </section>
  );
}

// Footer
function Footer() {
  return (
    <footer className="py-12 px-6 border-t border-white/10 bg-[hsl(220,15%,6%)]">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-center gap-6">
          <Logo size="sm" />
          
          <div className="flex items-center gap-8 text-white/50 text-sm">
            <Link to="/trust" className="hover:text-white transition-colors">Trust & Security</Link>
            <span>Privacy Policy</span>
            <span>Terms of Service</span>
          </div>
          
          <p className="text-white/40 text-sm">
            © 2025 TruckingLane.com — a Seeksy Product
          </p>
        </div>
      </div>
    </footer>
  );
}

export default Index;
