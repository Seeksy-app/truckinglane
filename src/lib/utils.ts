import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** US E.164 (+1…) and 10-digit local: +1 318-372-8933 / 318-372-8933. Other formats returned trimmed. */
export function formatDisplayPhone(raw: string | null | undefined): string {
  if (raw == null || raw === "") return "—";
  const t = raw.trim();
  if (t.toLowerCase() === "unknown") return "unknown";
  const digits = t.replace(/\D/g, "");
  if (!digits) return t;
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+1 ${digits.slice(1, 4)}-${digits.slice(4, 7)}-${digits.slice(7, 11)}`;
  }
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (t.startsWith("+") && digits.length >= 12) {
    return `+${digits.slice(0, 2)} ${digits.slice(2, 5)}-${digits.slice(5, 8)}-${digits.slice(8)}`;
  }
  return t;
}

/** Supabase/PostgREST errors are plain objects, not Error — avoids "[object Object]" in toasts. */
export function getErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "object" && e !== null && "message" in e) {
    const m = (e as { message: unknown }).message;
    if (typeof m === "string") return m;
  }
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}
