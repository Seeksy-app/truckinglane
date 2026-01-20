import * as React from "react";
import { cn } from "@/lib/utils";

interface PhoneInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  value?: string;
  onChange?: (value: string) => void;
}

/**
 * Formats a phone number as +1 (XXX) XXX-XXXX
 */
function formatPhoneNumber(value: string): string {
  // Remove all non-digits
  const digits = value.replace(/\D/g, "");
  
  // Limit to 11 digits (1 + 10 for US)
  const limited = digits.slice(0, 11);
  
  // Build formatted string
  let formatted = "";
  
  if (limited.length === 0) {
    return "";
  }
  
  // Always start with +1 for US numbers
  if (limited.length >= 1) {
    // If first digit is 1, treat it as country code
    if (limited[0] === "1") {
      formatted = "+1";
      const rest = limited.slice(1);
      if (rest.length > 0) {
        formatted += " (" + rest.slice(0, 3);
        if (rest.length >= 3) {
          formatted += ")";
          if (rest.length > 3) {
            formatted += " " + rest.slice(3, 6);
            if (rest.length > 6) {
              formatted += "-" + rest.slice(6, 10);
            }
          }
        }
      }
    } else {
      // Add +1 prefix automatically
      formatted = "+1 (" + limited.slice(0, 3);
      if (limited.length >= 3) {
        formatted += ")";
        if (limited.length > 3) {
          formatted += " " + limited.slice(3, 6);
          if (limited.length > 6) {
            formatted += "-" + limited.slice(6, 10);
          }
        }
      }
    }
  }
  
  return formatted;
}

/**
 * Extracts raw digits from formatted phone number
 */
function extractDigits(formatted: string): string {
  return formatted.replace(/\D/g, "");
}

const PhoneInput = React.forwardRef<HTMLInputElement, PhoneInputProps>(
  ({ className, value = "", onChange, placeholder = "+1 (555) 123-4567", ...props }, ref) => {
    const [displayValue, setDisplayValue] = React.useState(() => formatPhoneNumber(value));
    
    // Sync with external value changes
    React.useEffect(() => {
      setDisplayValue(formatPhoneNumber(value));
    }, [value]);
    
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const input = e.target.value;
      
      // Format the input
      const formatted = formatPhoneNumber(input);
      setDisplayValue(formatted);
      
      // Pass formatted value to parent
      onChange?.(formatted);
    };
    
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      // Allow backspace to work naturally
      if (e.key === "Backspace" && displayValue) {
        const digits = extractDigits(displayValue);
        if (digits.length > 0) {
          const newDigits = digits.slice(0, -1);
          const formatted = formatPhoneNumber(newDigits);
          setDisplayValue(formatted);
          onChange?.(formatted);
          e.preventDefault();
        }
      }
    };

    return (
      <input
        type="tel"
        inputMode="numeric"
        autoComplete="tel"
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className
        )}
        ref={ref}
        value={displayValue}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        {...props}
      />
    );
  }
);
PhoneInput.displayName = "PhoneInput";

export { PhoneInput };
