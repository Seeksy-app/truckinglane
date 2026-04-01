import { Link } from "react-router-dom";
import { Logo } from "@/components/Logo";
import { SiteFooter } from "@/components/SiteFooter";

export default function Terms() {
  return (
    <div className="min-h-screen flex flex-col bg-[hsl(220,15%,8%)]">
      <header className="py-6 px-2 border-b border-white/10 shrink-0">
        <div className="max-w-3xl mx-auto flex justify-between items-center">
          <Link to="/">
            <Logo size="sm" />
          </Link>
          <Link to="/privacy" className="text-sm text-white/60 hover:text-white transition-colors">
            Privacy Policy
          </Link>
        </div>
      </header>

      <main className="flex-1 max-w-3xl mx-auto w-full px-2 py-10">
        <article className="text-white/80 space-y-6 text-sm leading-relaxed">
          <h1 className="font-serif text-3xl font-medium text-white">Terms of Service</h1>
          <p className="text-white/50 text-sm">Last updated: March 29, 2026</p>

          <p>
            By using TruckingLanes.com and our SMS load notification service, you agree to the following terms.
          </p>

          <section>
            <h2 className="text-lg font-semibold text-white mt-8 mb-3">USE OF SERVICE</h2>
            <p>
              TruckingLanes.com is a freight load matching platform connecting carriers with available loads. Use of
              this platform is for professional freight carriers only.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mt-8 mb-3">SMS NOTIFICATIONS</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>SMS messages are sent via autodialer</li>
              <li>Opting in to SMS is never a condition of booking a load</li>
              <li>You may opt out at any time by replying STOP</li>
              <li>Reply HELP for support</li>
              <li>Standard message and data rates may apply</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mt-8 mb-3">LOAD INFORMATION</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                Load details including rates, routes, and dates are provided in good faith but subject to change
              </li>
              <li>TruckingLanes.com is not responsible for load cancellations or modifications made by shippers</li>
              <li>All rates are negotiated between carriers and D&amp;L Transport</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mt-8 mb-3">LIMITATION OF LIABILITY</h2>
            <p>
              TruckingLanes.com and Business Management Company LLC are not liable for any indirect, incidental, or
              consequential damages arising from use of this platform.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mt-8 mb-3">CHANGES TO TERMS</h2>
            <p>
              We reserve the right to update these terms at any time. Continued use of the platform constitutes
              acceptance.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mt-8 mb-3">CONTACT</h2>
            <p>
              For terms questions:{" "}
              <a href="mailto:legal@truckinglane.com" className="text-[hsl(25,95%,53%)] hover:underline">
                legal@truckinglane.com
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
