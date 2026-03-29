import { Link } from "react-router-dom";

/**
 * Minimal legal footer — dark bar, small centered text. Matches marketing pages (hsl(220,15%,8%)).
 */
export function SiteFooter() {
  return (
    <footer className="border-t border-white/10 bg-[hsl(220,15%,6%)] py-8 px-6">
      <div className="max-w-4xl mx-auto flex flex-col items-center justify-center gap-3 text-center text-xs text-white/70">
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
          <Link to="/privacy" className="text-white/80 hover:text-white transition-colors">
            Privacy Policy
          </Link>
          <span className="text-white/30" aria-hidden>
            ·
          </span>
          <Link to="/terms" className="text-white/80 hover:text-white transition-colors">
            Terms of Service
          </Link>
        </div>
        <p className="text-white/50">© 2026 Business Management Company LLC</p>
      </div>
    </footer>
  );
}
