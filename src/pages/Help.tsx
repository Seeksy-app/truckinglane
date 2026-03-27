import { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { AppHeader } from "@/components/AppHeader";
import { Input } from "@/components/ui/input";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { BookOpen, Loader2, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type KbMediaRow = {
  id: string;
  article_id: string;
  url: string;
  caption: string | null;
  media_order: number;
};

type KbArticleRow = {
  id: string;
  title: string;
  content: string | null;
  section_order: number;
  kb_media: KbMediaRow[] | null;
};

function sortedMedia(media: KbMediaRow[] | null | undefined) {
  if (!media?.length) return [];
  return [...media].sort((a, b) => a.media_order - b.media_order);
}

export default function Help() {
  const { user, loading } = useAuth();
  const [query, setQuery] = useState("");

  const articlesQuery = useQuery({
    queryKey: ["kb_articles_help"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("kb_articles")
        .select("id, title, content, section_order, kb_media (*)")
        .eq("is_published", true)
        .order("section_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as KbArticleRow[];
    },
    enabled: !!user,
  });

  const articles = articlesQuery.data ?? [];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return articles;
    return articles.filter((a) => {
      const title = (a.title ?? "").toLowerCase();
      const content = (a.content ?? "").toLowerCase();
      return title.includes(q) || content.includes(q);
    });
  }, [articles, query]);

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
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-4 py-8 pb-16 sm:px-6 lg:px-8">
        <div className="mb-8">
          <div className="mb-2 flex items-center gap-3">
            <div className="rounded-lg bg-primary/10 p-2">
              <BookOpen className="h-6 w-6 text-primary" />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">How TruckingLane Works</h1>
          </div>
          <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">
            Quick answers for agents. Search below or open a section.
          </p>
        </div>

        <div className="relative mb-8">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search help…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-11 border-border bg-card pl-10"
            aria-label="Search help topics"
          />
        </div>

        {articlesQuery.isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : articlesQuery.isError ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-8 text-center text-destructive">
            Could not load help articles. Try again later.
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground">
            {articles.length === 0
              ? "No help articles are published yet."
              : `No sections match "${query}". Try a different search.`}
          </div>
        ) : (
          <Accordion type="multiple" className="w-full rounded-lg border border-border bg-card px-2 sm:px-4">
            {filtered.map((section) => (
              <AccordionItem key={section.id} value={section.id} className="border-border">
                <AccordionTrigger className="py-4 text-left text-base font-semibold hover:no-underline">
                  {section.title}
                </AccordionTrigger>
                <AccordionContent className="border-t border-border/60 pb-2 pt-4 text-muted-foreground">
                  <div className="space-y-4 text-[15px] leading-relaxed text-foreground">
                    <div className="whitespace-pre-wrap">{section.content ?? ""}</div>
                    {sortedMedia(section.kb_media).map((m) => (
                      <figure key={m.id} className="space-y-2">
                        <img
                          src={m.url}
                          alt={m.caption || ""}
                          className="h-auto max-w-full rounded-lg border border-border"
                        />
                        {m.caption ? (
                          <figcaption className="text-sm text-muted-foreground">{m.caption}</figcaption>
                        ) : null}
                      </figure>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </main>
    </div>
  );
}
