import logo from "@/assets/logo.png";

interface LogoProps {
  size?: "sm" | "md" | "lg" | "xl";
  showText?: boolean;
  className?: string;
  /** 'white' renderiza versão SVG branca (para fundos escuros, ex.: passagem virtual). */
  variant?: "default" | "white";
}

export function Logo({ size = "md", showText = false, className = "", variant = "default" }: LogoProps) {
  const sizes = {
    sm: "h-8",
    md: "h-10",
    lg: "h-14",
    xl: "h-24",
  };

  if (variant === "white") {
    // Heights aproximadas para casar com versões raster
    const heights = { sm: 32, md: 40, lg: 56, xl: 96 } as const;
    const h = heights[size];
    return (
      <div className={`flex items-center gap-2 ${className}`} style={{ color: "currentColor" }}>
        {/* Ícone busão simplificado */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 48 48"
          height={h}
          width={h}
          aria-hidden="true"
          fill="none"
        >
          <rect x="6" y="10" width="36" height="24" rx="4" stroke="currentColor" strokeWidth="3" />
          <rect x="10" y="14" width="11" height="8" rx="1.5" fill="currentColor" />
          <rect x="27" y="14" width="11" height="8" rx="1.5" fill="currentColor" />
          <circle cx="14" cy="36" r="4" stroke="currentColor" strokeWidth="3" />
          <circle cx="34" cy="36" r="4" stroke="currentColor" strokeWidth="3" />
        </svg>
        <div className="flex flex-col leading-none">
          <span className="font-extrabold tracking-tight" style={{ fontSize: h * 0.42 }}>
            SmartBus
          </span>
          <span className="font-medium tracking-[0.18em] opacity-80" style={{ fontSize: h * 0.2 }}>
            VIAGENS &amp; PASSEIOS
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <img src={logo} alt="SmartBus" className={`${sizes[size]} object-contain`} />
      {showText && <span className="font-bold text-inherit">SmartBus</span>}
    </div>
  );
}
