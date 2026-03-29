import { Link } from "react-router-dom";
import { Logo } from "@/components/Logo";
import { SiteFooter } from "@/components/SiteFooter";

export default function Privacy() {
  return (
    <div className="min-h-screen flex flex-col bg-[hsl(220,15%,8%)]">
      <header className="p-6 border-b border-white/10 shrink-0">
        <div className="max-w-3xl mx-auto flex justify-between items-center">
          <Link to="/">
            <Logo size="sm" />
          </Link>
          <Link to="/terms" className="text-sm text-white/60 hover:text-white transition-colors">
            Terms of Service
          </Link>
        </div>
      </header>

      <main className="flex-1 max-w-3xl mx-auto w-full px-6 py-10">
        <article className="text-white/80 space-y-6 text-sm leading-relaxed">
          <h1 className="font-serif text-3xl font-medium text-white">Privacy Policy</h1>
          <p className="text-white/50 text-sm">Last updated: March 29, 2026</p>

          <p>
            TruckingLanes.com is operated by Business Management Company LLC (&quot;we,&quot; &quot;us,&quot; or
            &quot;our&quot;). This policy explains how we collect, use, and protect your information.
          </p>

          <section>
            <h2 className="text-lg font-semibold text-white mt-8 mb-3">INFORMATION WE COLLECT</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>Phone numbers provided verbally or via form</li>
              <li>Load and route preferences</li>
              <li>Call recordings for quality purposes</li>
              <li>Device and usage data</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mt-8 mb-3">HOW WE USE YOUR INFORMATION</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>To match you with available freight loads</li>
              <li>To send SMS load notifications you have opted into</li>
              <li>To improve our platform and dispatcher performance</li>
              <li>We never sell your information to third parties</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mt-8 mb-3">SMS COMMUNICATIONS</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>You will only receive SMS if you have explicitly opted in</li>
              <li>Message frequency varies based on load availability (1-5/day)</li>
              <li>Standard message and data rates may apply</li>
              <li>Reply STOP to opt out at any time</li>
              <li>Reply HELP for assistance</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mt-8 mb-3">SMS DATA &amp; THIRD PARTIES</h2>
            <p>
              No mobile information will be shared with third parties or affiliates for marketing or promotional
              purposes. All the above categories exclude text messaging originator opt-in data and consent; this
              information will not be shared with any third parties.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mt-8 mb-3">DATA SECURITY</h2>
            <p>
              Your information is stored securely and only accessible to authorized D&amp;L Transport and TruckingLanes
              staff.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mt-8 mb-3">CONTACT</h2>
            <p>
              For privacy questions:{" "}
              <a href="mailto:privacy@truckinglane.com" className="text-[hsl(25,95%,53%)] hover:underline">
                privacy@truckinglane.com
              </a>
            </p>
            <p className="mt-4 text-white/60">
              Business Management Company LLC
              <br />
              Washington, DC
            </p>
          </section>
        </article>
      </main>

      <SiteFooter />
    </div>
  );
}
