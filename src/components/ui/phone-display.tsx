import { cn, formatDisplayPhone } from "@/lib/utils";

/** +3px vs surrounding text; use with `formatDisplayPhone` inside custom `<a href="tel:…">` wrappers */
export const phoneDisplayClassName = "font-mono tabular-nums [font-size:calc(1em+3px)]";

const phoneTextClass = phoneDisplayClassName;

type PhoneDisplayProps = {
  phone: string | null | undefined;
  className?: string;
  /** Render as tel: link (href uses stored number for dialers) */
  asLink?: boolean;
};

export function PhoneDisplay({ phone, className, asLink }: PhoneDisplayProps) {
  const text = formatDisplayPhone(phone);
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
