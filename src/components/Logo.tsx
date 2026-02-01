import logo from "@/assets/logo.jpeg";

interface LogoProps {
  size?: "sm" | "md" | "lg" | "xl";
  showText?: boolean;
  className?: string;
}

export function Logo({ size = "md", showText = false, className = "" }: LogoProps) {
  const sizes = {
    sm: "h-8",
    md: "h-12",
    lg: "h-12",
    xl: "h-16",
  };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <img src={logo} alt="Busão Off Off" className={`${sizes[size]} object-contain`} />
      {showText && <span className="font-bold text-inherit">Busão Off Off</span>}
    </div>
  );
}
