import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { 
  Phone, 
  Zap, 
  BarChart3, 
  Shield, 
  Server, 
  TrendingUp,
  CheckCircle,
  ArrowRight,
  Database,
  Mic,
  Truck,
  Clock,
  Mail,
  Loader2,
  Eye,
  Lock
} from "lucide-react";

// Session storage key
const SESSION_KEY = "trust_page_session";

interface TrustSession {
  sessionId: string;
  email: string;
  expiresAt: string;
}

export default function Trust() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [step, setStep] = useState<"email" | "code" | "content">("email");
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const { toast } = useToast();

  // Check for existing session on mount
  useEffect(() => {
    const stored = localStorage.getItem(SESSION_KEY);
    if (stored) {
      try {
        const session: TrustSession = JSON.parse(stored);
        if (new Date(session.expiresAt) > new Date()) {
          setStep("content");
        } else {
          localStorage.removeItem(SESSION_KEY);
        }
      } catch {
        localStorage.removeItem(SESSION_KEY);
      }
    }
    setPageLoading(false);
  }, []);

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-trust-code", {
        body: { email, action: "send" },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      setSessionId(data.sessionId);
      setStep("code");
      toast({
        title: "Code sent",
        description: "Check your email for the access code",
      });
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to send code",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code || !sessionId) return;

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-trust-code", {
        body: { email, action: "verify", code, sessionId },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      // Store session
      const session: TrustSession = {
        sessionId,
        email: data.email,
        expiresAt: data.sessionExpiresAt,
      };
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));

      setStep("content");
      toast({
        title: "Access granted",
        description: "Welcome to Trucking Lane",
      });
    } catch (err) {
      toast({
        title: "Verification failed",
        description: err instanceof Error ? err.message : "Invalid code",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (pageLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Email gate UI
  if (step === "email" || step === "code") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-secondary/30 flex items-center justify-center px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md"
        >
          <div className="bg-card rounded-xl border border-border p-8 shadow-lg">
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
                <Truck className="h-8 w-8 text-primary" />
              </div>
              <h1 className="text-2xl font-bold text-foreground">Trucking Lane</h1>
              <p className="text-muted-foreground mt-1">AI-Driven Dispatch Intelligence</p>
            </div>

            <AnimatePresence mode="wait">
              {step === "email" ? (
                <motion.form
                  key="email"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  onSubmit={handleSendCode}
                  className="space-y-4"
                >
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Enter your email to continue
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        type="email"
                        placeholder="you@company.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="pl-10"
                        required
                      />
                    </div>
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <ArrowRight className="h-4 w-4 mr-2" />
                    )}
                    Continue
                  </Button>
                </motion.form>
              ) : (
                <motion.form
                  key="code"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  onSubmit={handleVerifyCode}
                  className="space-y-4"
                >
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Enter the 6-digit code sent to {email}
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        type="text"
                        placeholder="000000"
                        value={code}
                        onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                        className="pl-10 text-center text-xl tracking-widest font-mono"
                        maxLength={6}
                        required
                      />
                    </div>
                  </div>
                  <Button type="submit" className="w-full" disabled={loading || code.length !== 6}>
                    {loading ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <CheckCircle className="h-4 w-4 mr-2" />
                    )}
                    Verify Code
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full text-muted-foreground"
                    onClick={() => {
                      setStep("email");
                      setCode("");
                    }}
                  >
                    Use a different email
                  </Button>
                </motion.form>
              )}
            </AnimatePresence>

            <p className="text-xs text-muted-foreground text-center mt-6">
              Access is logged and sessions expire after 24 hours.
            </p>
          </div>
        </motion.div>
      </div>
    );
  }

  // Main content
  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-primary/5 via-background to-accent/5 py-24 px-4">
        <div className="max-w-5xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="inline-flex items-center gap-2 bg-accent/10 text-accent rounded-full px-4 py-1.5 text-sm font-medium mb-6">
              <Zap className="h-4 w-4" />
              AI-Powered Dispatch
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-foreground mb-4">
              Trucking Lane
            </h1>
            <p className="text-xl md:text-2xl text-muted-foreground mb-2">
              AI-Driven Dispatch Intelligence
            </p>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Smarter calls. Faster decisions. Measurable ROI.
            </p>
          </motion.div>

          {/* Video placeholder */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2, duration: 0.5 }}
            className="mt-12 max-w-3xl mx-auto"
          >
            <div className="aspect-video bg-muted/50 rounded-xl border border-border flex items-center justify-center">
              <div className="text-center">
                <Eye className="h-12 w-12 text-muted-foreground mx-auto mb-2" />
                <p className="text-muted-foreground">Product Demo Video</p>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* What It Does */}
      <section className="py-20 px-4 bg-card/50">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-foreground text-center mb-4">What It Does</h2>
          <p className="text-lg text-muted-foreground text-center max-w-3xl mx-auto mb-12">
            Trucking Lane uses AI to handle inbound calls, identify high-intent leads, 
            verify carriers, and help dispatchers close faster.
          </p>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              { icon: Phone, title: "AI answers calls", desc: "Captures lead details automatically" },
              { icon: Zap, title: "High-intent prioritization", desc: "Hot leads surface instantly" },
              { icon: BarChart3, title: "Real-time metrics", desc: "Performance visibility for dispatchers" },
            ].map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="bg-card rounded-xl border border-border p-6"
              >
                <div className="w-12 h-12 rounded-lg bg-accent/10 flex items-center justify-center mb-4">
                  <item.icon className="h-6 w-6 text-accent" />
                </div>
                <h3 className="font-semibold text-foreground mb-2">{item.title}</h3>
                <p className="text-muted-foreground text-sm">{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 px-4">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-foreground text-center mb-12">How It Works</h2>

          <div className="grid md:grid-cols-4 gap-6">
            {[
              { step: 1, title: "AI Answers", desc: "Inbound calls handled by AI" },
              { step: 2, title: "Details Extracted", desc: "Lead info captured automatically" },
              { step: 3, title: "Matching", desc: "Loads and carriers matched in real time" },
              { step: 4, title: "Resolution", desc: "Agents resolve leads with one click" },
            ].map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="relative"
              >
                <div className="bg-card rounded-xl border border-border p-6 h-full">
                  <div className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold mb-4">
                    {item.step}
                  </div>
                  <h3 className="font-semibold text-foreground mb-2">{item.title}</h3>
                  <p className="text-muted-foreground text-sm">{item.desc}</p>
                </div>
                {i < 3 && (
                  <ArrowRight className="hidden md:block absolute top-1/2 -right-3 text-border h-6 w-6" />
                )}
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Tech Stack */}
      <section className="py-20 px-4 bg-card/50">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-foreground text-center mb-12">Technology Stack</h2>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {[
              { label: "Frontend", tech: "React", icon: "⚛️" },
              { label: "Backend", tech: "Supabase", icon: "⚡" },
              { label: "AI Voice", tech: "ElevenLabs", icon: "🎙️" },
              { label: "Carrier Data", tech: "FMCSA", icon: "🚛" },
              { label: "Telephony", tech: "Twilio", icon: "📞" },
              { label: "Analytics", tech: "AI Scoring", icon: "📊" },
            ].map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.05 }}
                className="bg-card rounded-lg border border-border p-4 text-center"
              >
                <span className="text-2xl mb-2 block">{item.icon}</span>
                <p className="font-medium text-foreground">{item.tech}</p>
                <p className="text-xs text-muted-foreground">{item.label}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Security */}
      <section className="py-20 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Shield className="h-8 w-8 text-accent" />
            <h2 className="text-3xl font-bold text-foreground">Security & Data Protection</h2>
          </div>

          <div className="grid md:grid-cols-2 gap-4 mt-8 max-w-3xl mx-auto">
            {[
              "Role-based access control",
              "Row-level security enforced",
              "Audit logs for all actions",
              "No sharing of private data",
              "FMCSA used for carrier verification",
            ].map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -10 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.05 }}
                className="flex items-center gap-3 bg-card rounded-lg border border-border p-4"
              >
                <CheckCircle className="h-5 w-5 text-dot-green flex-shrink-0" />
                <span className="text-foreground">{item}</span>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Performance */}
      <section className="py-20 px-4 bg-card/50">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-center gap-3 mb-8">
            <Server className="h-8 w-8 text-accent" />
            <h2 className="text-3xl font-bold text-foreground">Performance & Reliability</h2>
          </div>

          <div className="grid md:grid-cols-4 gap-4">
            {[
              { icon: Clock, label: "24/7 Operations" },
              { icon: Mic, label: "AI Failover" },
              { icon: BarChart3, label: "Real-time Monitoring" },
              { icon: Database, label: "Uptime Metrics" },
            ].map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="bg-card rounded-xl border border-border p-6 text-center"
              >
                <item.icon className="h-8 w-8 text-primary mx-auto mb-3" />
                <p className="font-medium text-foreground">{item.label}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ROI */}
      <section className="py-20 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-center gap-3 mb-8">
            <TrendingUp className="h-8 w-8 text-accent" />
            <h2 className="text-3xl font-bold text-foreground">ROI for Dispatch Agencies</h2>
          </div>

          <div className="grid md:grid-cols-2 gap-4 max-w-3xl mx-auto">
            {[
              "Minutes saved per agent per day",
              "Faster callbacks = higher close rates",
              "AI filters low-intent calls automatically",
              "Agents focus on revenue-generating work",
            ].map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="flex items-start gap-3 bg-accent/5 rounded-lg border border-accent/20 p-4"
              >
                <Zap className="h-5 w-5 text-accent flex-shrink-0 mt-0.5" />
                <span className="text-foreground">{item}</span>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Visuals */}
      <section className="py-20 px-4 bg-card/50">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-foreground text-center mb-8">Platform Preview</h2>

          <div className="grid md:grid-cols-4 gap-4">
            {[
              { label: "Dashboard", desc: "Agent workspace" },
              { label: "AI Calls", desc: "Call transcripts" },
              { label: "Lead Resolution", desc: "One-click booking" },
              { label: "Carrier Lookup", desc: "FMCSA verification" },
            ].map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="bg-muted/50 rounded-xl border border-border aspect-[4/3] flex items-center justify-center"
              >
                <div className="text-center p-4">
                  <p className="font-medium text-foreground">{item.label}</p>
                  <p className="text-xs text-muted-foreground">{item.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-4 border-t border-border">
        <div className="max-w-5xl mx-auto text-center">
          <p className="text-muted-foreground mb-2">
            Questions? Contact us at{" "}
            <a href="mailto:info@truckinglane.com" className="text-accent hover:underline">
              info@truckinglane.com
            </a>
          </p>
          <p className="text-sm text-muted-foreground">
            <a href="#" className="hover:underline">Privacy Policy</a>
            <span className="mx-2">·</span>
            Last updated: {new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })}
          </p>
        </div>
      </footer>
    </div>
  );
}