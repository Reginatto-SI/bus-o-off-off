import logo from "@/assets/logo.jpeg";

interface LogoProps {
  size?: "sm" | "md" | "lg" | "xl";
  showText?: boolean;
  className?: string;
}

export function Logo({ size = "md", showText = false, className = "" }: LogoProps) {
  const sizes = {
    sm: "h-8",
    md: "h-10",
    lg: "h-14",
    xl: "h-24",
  };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <img src={logo} alt="Smartbus BR" className={`${sizes[size]} object-contain`} />
      {showText && <span className="font-bold text-inherit">Smartbus BR</span>}
    </div>
  );
}
