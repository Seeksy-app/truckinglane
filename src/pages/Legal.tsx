import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Logo } from "@/components/Logo";
import { supabase } from "@/integrations/supabase/client";

export default function Legal() {
  const { slug } = useParams<{ slug: string }>();
  const [content, setContent] = useState<{ title: string; content: string; updated_at: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPage = async () => {
      const { data } = await supabase
        .from('legal_pages')
        .select('title, content, updated_at')
        .eq('slug', slug || 'terms')
        .single();
      setContent(data);
      setLoading(false);
    };
    fetchPage();
  }, [slug]);

  const renderMarkdown = (text: string) => {
    return text
      .split('\n')
      .map((line, i) => {
        if (line.startsWith('# ')) return <h1 key={i} className="text-3xl font-serif font-medium text-white mb-6">{line.slice(2)}</h1>;
        if (line.startsWith('## ')) return <h2 key={i} className="text-xl font-semibold text-white mt-8 mb-4">{line.slice(3)}</h2>;
        if (line.startsWith('### ')) return <h3 key={i} className="text-lg font-semibold text-white mt-6 mb-3">{line.slice(4)}</h3>;
        if (line.startsWith('- ')) return <li key={i} className="text-white/70 ml-4">{line.slice(2)}</li>;
        if (line.startsWith('**') && line.endsWith('**')) return <p key={i} className="font-semibold text-white/80 my-2">{line.slice(2, -2)}</p>;
        if (line.trim() === '') return <br key={i} />;
        return <p key={i} className="text-white/70 my-2">{line}</p>;
      });
  };

  return (
    <div className="min-h-screen bg-[hsl(220,15%,8%)]">
      <header className="p-6 border-b border-white/10">
        <div className="max-w-4xl mx-auto flex justify-between items-center">
          <Link to="/"><Logo size="sm" /></Link>
          <nav className="flex gap-6 text-sm">
            <Link to="/legal/terms" className={`hover:text-white ${slug === 'terms' ? 'text-white' : 'text-white/50'}`}>Terms</Link>
            <Link to="/legal/privacy" className={`hover:text-white ${slug === 'privacy' ? 'text-white' : 'text-white/50'}`}>Privacy</Link>
            <Link to="/legal/trust" className={`hover:text-white ${slug === 'trust' ? 'text-white' : 'text-white/50'}`}>Trust</Link>
          </nav>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-12">
        {loading ? (
          <p className="text-white/50">Loading...</p>
        ) : content ? (
          <article className="prose prose-invert max-w-none">
            {renderMarkdown(content.content)}
            <p className="text-white/30 text-sm mt-12">Last updated: {new Date(content.updated_at).toLocaleDateString()}</p>
          </article>
        ) : (
          <p className="text-white/50">Page not found</p>
        )}
      </main>
    </div>
  );
}
