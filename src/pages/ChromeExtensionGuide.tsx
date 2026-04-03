import { Navigate, Link } from "react-router-dom";
import { AppHeader } from "@/components/AppHeader";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Chrome, Truck, Clock, Download, Lightbulb, Loader2, ArrowLeft, BookOpen } from "lucide-react";

type Section = {
  title: string;
  icon: typeof Chrome;
  iconBg: string;
  iconColor: string;
  steps: string[];
};

const SECTIONS: Section[] = [
  {
    title: "Getting Started",
    icon: Chrome,
    iconBg: "bg-sky-100 dark:bg-sky-950/50",
    iconColor: "text-sky-600 dark:text-sky-400",
    steps: [
      "You need the TruckingLane Chrome extension added to your browser.",
      "After you add it, you will see the TruckingLane icon in your Chrome toolbar.",
      "The extension works on its own in the background. You only need to keep the right browser tabs open.",
    ],
  },
  {
    title: "Trucker Tools (updates about every 30 minutes)",
    icon: Truck,
    iconBg: "bg-emerald-100 dark:bg-emerald-950/50",
    iconColor: "text-emerald-600 dark:text-emerald-400",
    steps: [
      "Open Chrome and go to oldcastle.truckertools.com/loads",
      "Log in if the site asks you to.",
      "That is all you need to do — try to keep this tab open during the day.",
      "The extension pulls in loads about every 30 minutes on its own.",
      "If you close the tab, loads from Trucker Tools will stop updating until you open it again.",
    ],
  },
  {
    title: "Spot Loads (updates about every 30 minutes)",
    icon: Clock,
    iconBg: "bg-violet-100 dark:bg-violet-950/50",
    iconColor: "text-violet-600 dark:text-violet-400",
    steps: [
      "Make sure you are logged in to dandl.aljex.com.",
      "Keep that tab open during the day.",
      "The extension collects spot loads about every 30 minutes without you clicking anything.",
      "Just leave the tab open — no extra steps.",
    ],
  },
  {
    title: "Big 500 (you download the file once)",
    icon: Download,
    iconBg: "bg-amber-100 dark:bg-amber-950/50",
    iconColor: "text-amber-700 dark:text-amber-400",
    steps: [
      "Go to dandl.aljex.com.",
      "Open Reports.",
      "Download the Big 500 report as a CSV file.",
      "The extension notices the download and sends the file up for you.",
      "Do this once each morning, and again after big changes during the day if needed.",
      "You do not need to open or move the file after it downloads — the extension takes care of it.",
    ],
  },
  {
    title: "Tips",
    icon: Lightbulb,
    iconBg: "bg-slate-100 dark:bg-slate-800/80",
    iconColor: "text-slate-600 dark:text-slate-300",
    steps: [
      "For the best results, keep your Aljex and Trucker Tools tabs open all day.",
      "If loads stop updating, check that those tabs are still open and you are still logged in.",
      "Click the TruckingLane icon in Chrome to open the small popup. It shows when each source last synced.",
    ],
  },
];

export default function ChromeExtensionGuide() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  return (
    <div className="min-h-screen bg-[#F4F6F8] dark:bg-background">
      <AppHeader />
      <main className="mx-auto max-w-2xl tl-page-gutter py-8 pb-16">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <Button variant="ghost" size="sm" className="mb-4 -ml-2 gap-1.5 text-muted-foreground" asChild>
              <Link to="/help">
                <ArrowLeft className="h-4 w-4" />
                Back to Help
              </Link>
            </Button>
            <h1 className="text-2xl font-semibold tracking-tight text-[#1a1a1a] dark:text-foreground sm:text-3xl">
              Chrome Extension Guide
            </h1>
            <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-[#4b5563] dark:text-muted-foreground">
              Simple steps to keep your loads flowing into TruckingLane. No tech background needed.
            </p>
          </div>
        </div>

        <div className="mb-8 rounded-xl border border-[#e5e7eb] bg-white p-4 shadow-sm dark:border-border dark:bg-card sm:p-5">
          <p className="text-[15px] leading-relaxed text-[#374151] dark:text-foreground">
            <span className="font-medium text-[#111827] dark:text-foreground">First time?</span> If you have not
            installed the extension yet,{" "}
            <Link to="/extension" className="font-medium text-primary underline-offset-4 hover:underline">
              open the install page
            </Link>{" "}
            to download it, then come back here for day-to-day use.
          </p>
        </div>

        <div className="flex flex-col gap-6">
          {SECTIONS.map((section, idx) => {
            const Icon = section.icon;
            return (
              <Card
                key={section.title}
                className="overflow-hidden border-[#e5e7eb] bg-white shadow-sm dark:border-border dark:bg-card"
              >
                <CardHeader className="flex flex-row items-start gap-4 space-y-0 border-b border-[#f3f4f6] pb-4 dark:border-border/80">
                  <div
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${section.iconBg}`}
                    aria-hidden
                  >
                    <Icon className={`h-5 w-5 ${section.iconColor}`} strokeWidth={2} />
                  </div>
                  <div className="min-w-0 pt-0.5">
                    <p className="text-xs font-medium uppercase tracking-wide text-[#9ca3af] dark:text-muted-foreground">
                      Part {idx + 1}
                    </p>
                    <h2 className="text-lg font-semibold leading-snug text-[#111827] dark:text-foreground">
                      {section.title}
                    </h2>
                  </div>
                </CardHeader>
                <CardContent className="pt-5">
                  <ol className="list-none space-y-3 pl-0">
                    {section.steps.map((step, i) => (
                      <li key={i} className="flex gap-3 text-[15px] leading-relaxed text-[#374151] dark:text-foreground/90">
                        <span
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#f3f4f6] text-xs font-semibold text-[#6b7280] dark:bg-muted dark:text-muted-foreground"
                          aria-hidden
                        >
                          {i + 1}
                        </span>
                        <span className="pt-0.5">{step}</span>
                      </li>
                    ))}
                  </ol>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="mt-10 flex justify-center">
          <Button variant="outline" className="gap-2 border-[#e5e7eb] bg-white shadow-sm dark:bg-card" asChild>
            <Link to="/help">
              <BookOpen className="h-4 w-4" />
              More help topics
            </Link>
          </Button>
        </div>
      </main>
    </div>
  );
}
