import { useMemo, useState, type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { AppHeader } from "@/components/AppHeader";
import { Input } from "@/components/ui/input";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { BookOpen, Search } from "lucide-react";

type HelpSection = {
  id: string;
  title: string;
  searchText: string;
  body: ReactNode;
};

const SECTIONS: HelpSection[] = [
  {
    id: "s1",
    title: "What am I looking at?",
    searchText:
      "sources old castle adelphia vms spot loads aljex google sheet email spreadsheet dispatch carriers loads morning",
    body: (
      <div className="space-y-4 text-[15px] leading-relaxed text-foreground">
        <p>
          Every morning, loads automatically come in from different sources. Your job is to call the carriers listed on
          those loads and try to book them. Here&apos;s what each load source means:
        </p>
        <ul className="list-disc pl-5 space-y-2 marker:text-primary">
          <li>
            <span className="font-medium">Old Castle</span> — concrete and building materials loads from a Google Sheet
          </li>
          <li>
            <span className="font-medium">Adelphia</span> — flatbed loads from an email spreadsheet
          </li>
          <li>
            <span className="font-medium">VMS</span> — loads that come in through email automatically
          </li>
          <li>
            <span className="font-medium">Spot Loads</span> — available loads pulled from Aljex
          </li>
          <li>
            <span className="font-medium">Aljex</span> — booked loads from our dispatch system
          </li>
        </ul>
      </div>
    ),
  },
  {
    id: "s2",
    title: "The Dashboard Numbers",
    searchText:
      "new open claimed leads ai calls booked dashboard numbers cards stats kpi",
    body: (
      <ul className="list-disc pl-5 space-y-2 text-[15px] leading-relaxed marker:text-primary">
        <li>
          <span className="font-medium">NEW</span> — loads that came in today that nobody has looked at yet
        </li>
        <li>
          <span className="font-medium">OPEN</span> — all loads available to work
        </li>
        <li>
          <span className="font-medium">CLAIMED</span> — loads an agent is actively working
        </li>
        <li>
          <span className="font-medium">LEADS</span> — carriers who called in about a load
        </li>
        <li>
          <span className="font-medium">AI CALLS</span> — calls the AI made automatically
        </li>
        <li>
          <span className="font-medium">BOOKED</span> — loads that have been covered
        </li>
      </ul>
    ),
  },
  {
    id: "s3",
    title: "How to Work a Load",
    searchText:
      "claim close covered carrier phone rate details book step by step",
    body: (
      <ol className="list-decimal pl-5 space-y-2 text-[15px] leading-relaxed marker:font-medium">
        <li>Click on a load to see the details</li>
        <li>Call the carrier phone number shown</li>
        <li>If they want the load, click &quot;Claim&quot; to assign it to yourself</li>
        <li>Once booked, click &quot;Close as Covered&quot;</li>
        <li>Fill in the carrier info and rate</li>
      </ol>
    ),
  },
  {
    id: "s4",
    title: "What the DAT Board Means",
    searchText:
      "dat load board truckers freight posted live pending manager morning",
    body: (
      <div className="space-y-3 text-[15px] leading-relaxed text-foreground">
        <p>
          DAT is a load board where truckers look for freight. When you see something like &quot;285 of 290 live,&quot; it
          means 285 of our loads are currently posted on DAT for carriers to find.
        </p>
        <p>
          <span className="font-medium">Pending</span> means they haven&apos;t been posted yet — your manager handles
          this every morning.
        </p>
      </div>
    ),
  },
  {
    id: "s5",
    title: "Leads",
    searchText:
      "lead carrier called timer follow up interested load phone",
    body: (
      <div className="space-y-3 text-[15px] leading-relaxed text-foreground">
        <p>
          When a carrier calls about a load, the system creates a Lead. Click on a Lead to see which load they&apos;re
          interested in and follow up with them.
        </p>
        <p>
          The timer shows how long ago they called — respond fast, carriers move quick.
        </p>
      </div>
    ),
  },
  {
    id: "s6",
    title: "Filters",
    searchText:
      "client dropdown pickup delivery state search bar filter city load number",
    body: (
      <ul className="list-disc pl-5 space-y-2 text-[15px] leading-relaxed marker:text-primary">
        <li>Use the Client dropdown to filter loads by source</li>
        <li>Use Pickup and Delivery dropdowns to find loads in specific states</li>
        <li>Use the search bar to find a specific load number, city, or phone number</li>
      </ul>
    ),
  },
  {
    id: "s7",
    title: "Tips",
    searchText:
      "high intent claim open timer red tips morning best practices",
    body: (
      <ul className="list-disc pl-5 space-y-2 text-[15px] leading-relaxed marker:text-primary">
        <li>Work the High Intent leads first — they&apos;re most likely to book</li>
        <li>Check the NEW loads first thing in the morning</li>
        <li>If a load shows a timer in red, it&apos;s been waiting too long — call now</li>
        <li>You can only claim loads that are still Open</li>
      </ul>
    ),
  },
];

export default function Help() {
  const { user, loading } = useAuth();
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SECTIONS;
    return SECTIONS.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.searchText.toLowerCase().includes(q),
    );
  }, [query]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-16">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg bg-primary/10">
              <BookOpen className="h-6 w-6 text-primary" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
              How TruckingLane Works
            </h1>
          </div>
          <p className="text-muted-foreground text-sm sm:text-base max-w-2xl">
            Quick answers for agents. Search below or open a section.
          </p>
        </div>

        <div className="relative mb-8">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            type="search"
            placeholder="Search help (e.g. DAT, claim, leads, filters)…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-10 h-11 bg-card border-border"
            aria-label="Search help topics"
          />
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground">
            No sections match &quot;{query}&quot;. Try a shorter word like <span className="text-foreground">DAT</span>{" "}
            or <span className="text-foreground">lead</span>.
          </div>
        ) : (
          <Accordion type="multiple" className="w-full rounded-lg border border-border bg-card px-2 sm:px-4">
            {filtered.map((section) => (
              <AccordionItem key={section.id} value={section.id} className="border-border">
                <AccordionTrigger className="text-left text-base font-semibold hover:no-underline py-4">
                  {section.title}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground border-t border-border/60 pt-4 pb-2">
                  {section.body}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </main>
    </div>
  );
}
