/**
 * AI call outcomes that indicate the carrier agreed to a rate or booking (ElevenLabs analysis).
 * Used for the prominent "Rate Agreed" badge on leads.
 */
export function isRateAgreedCallOutcome(outcome: string | null | undefined): boolean {
  if (!outcome) return false;
  const o = outcome.toLowerCase().trim();
  return o === "booked" || o === "confirmed";
}
