import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Use for Postgres `timestamptz` — always a string, never `new Date()` or `Date.now()`. */
export function isoTimestampNow(): string {
  return new Date().toISOString();
}

/**
 * National US display: strips leading +1 / country digit, formats as XXX-XXX-XXXX.
 * Does not add +1 to output.
 */
export function formatPhone(raw: string | null | undefined): string {
  if (raw == null || raw === "") return "—";
  const t = raw.trim();
  if (t.toLowerCase() === "unknown") return "unknown";
  const digits = t.replace(/\D/g, "");
  if (!digits) return t;

  const national10 =
    digits.length === 11 && digits.startsWith("1")
      ? digits.slice(1)
      : digits.length === 10
        ? digits
        : null;

  if (national10 && national10.length === 10) {
    return `${national10.slice(0, 3)}-${national10.slice(3, 6)}-${national10.slice(6)}`;
  }

  if (digits.length > 10) {
    const last10 = digits.slice(-10);
    return `${last10.slice(0, 3)}-${last10.slice(3, 6)}-${last10.slice(6)}`;
  }

  return t;
}

/** @deprecated Use formatPhone */
export const formatDisplayPhone = formatPhone;

/** Supabase/PostgREST errors are plain objects, not Error — avoids "[object Object]" in toasts. */
export function getErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "object" && e !== null) {
    const o = e as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown };
    if (typeof o.message === "string" && o.message.trim()) {
      const parts = [o.message.trim()];
      if (typeof o.details === "string" && o.details.trim()) parts.push(o.details.trim());
      if (typeof o.hint === "string" && o.hint.trim()) parts.push(o.hint.trim());
      if (typeof o.code === "string" && o.code.trim()) parts.push(`[${o.code.trim()}]`);
      return parts.join(" — ");
    }
  }
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}
