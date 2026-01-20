import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
  iconOnly?: boolean;
  size?: "sm" | "md" | "lg";
}

export const Logo = ({ className, iconOnly = false, size = "md" }: LogoProps) => {
  const sizeClasses = {
    sm: { icon: "w-8 h-8", text: "text-lg" },
    md: { icon: "w-10 h-10", text: "text-xl" },
    lg: { icon: "w-14 h-14", text: "text-2xl" },
  };

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div className={cn("relative", sizeClasses[size].icon)}>
        <svg
          viewBox="0 0 48 48"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full"
        >
          {/* Background rounded square */}
          <rect
            x="2"
            y="2"
            width="44"
            height="44"
            rx="10"
            fill="hsl(25, 95%, 53%)"
          />
          
          {/* Truck trailer (box) - outlined */}
          <rect 
            x="8" 
            y="14" 
            width="18" 
            height="14" 
            rx="2" 
            stroke="white" 
            strokeWidth="2.5" 
            fill="none"
          />
          
          {/* Truck cab */}
          <path
            d="M26 18H32C34 18 36 20 36 22V28H26V18Z"
            stroke="white"
            strokeWidth="2.5"
            fill="none"
            strokeLinejoin="round"
          />
          
          {/* Cab window */}
          <path
            d="M29 18V22H36"
            stroke="white"
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
          />
          
          {/* Wheels */}
          <circle cx="14" cy="32" r="4" stroke="white" strokeWidth="2.5" fill="hsl(25, 95%, 53%)" />
          <circle cx="32" cy="32" r="4" stroke="white" strokeWidth="2.5" fill="hsl(25, 95%, 53%)" />
          
          {/* Wheel centers */}
          <circle cx="14" cy="32" r="1.5" fill="white" />
          <circle cx="32" cy="32" r="1.5" fill="white" />
        </svg>
      </div>

      {!iconOnly && (
        <span className={cn("font-bold tracking-tight text-white", sizeClasses[size].text)}>
          Trucking Lane
        </span>
      )}
    </div>
  );
};

// Standalone icon version for favicon/app icons
export const LogoIcon = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 48 48"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={cn("w-10 h-10", className)}
  >
    <rect x="2" y="2" width="44" height="44" rx="10" fill="#f97316" />
    <rect x="8" y="14" width="18" height="14" rx="2" stroke="white" strokeWidth="2.5" fill="none" />
    <path d="M26 18H32C34 18 36 20 36 22V28H26V18Z" stroke="white" strokeWidth="2.5" fill="none" strokeLinejoin="round" />
    <path d="M29 18V22H36" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round" />
    <circle cx="14" cy="32" r="4" stroke="white" strokeWidth="2.5" fill="#f97316" />
    <circle cx="32" cy="32" r="4" stroke="white" strokeWidth="2.5" fill="#f97316" />
    <circle cx="14" cy="32" r="1.5" fill="white" />
    <circle cx="32" cy="32" r="1.5" fill="white" />
  </svg>
);
