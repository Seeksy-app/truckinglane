import { cn, formatPhone } from "@/lib/utils";

/** Monospace phone digits; body text size comes from global root (see index.css). */
export const phoneDisplayClassName = "font-mono tabular-nums";

const phoneTextClass = phoneDisplayClassName;

type PhoneDisplayProps = {
  phone: string | null | undefined;
  className?: string;
  /** Render as tel: link (href uses stored number for dialers) */
  asLink?: boolean;
};

export function PhoneDisplay({ phone, className, asLink }: PhoneDisplayProps) {
  const text = formatPhone(phone);
  if (asLink && phone && phone.trim() && phone.toLowerCase() !== "unknown") {
    return (
      <a
        href={`tel:${phone.replace(/\s/g, "")}`}
        className={cn(phoneTextClass, "text-primary hover:underline", className)}
      >
        {text}
      </a>
    );
  }
  return <span className={cn(phoneTextClass, className)}>{text}</span>;
}
