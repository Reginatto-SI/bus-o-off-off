import * as React from "react";

const MOBILE_BREAKPOINT = 768;

// Hook responsivo compartilhado: permite reaproveitar o mesmo listener do padrão mobile com outros breakpoints Tailwind.
export function useIsBelowBreakpoint(breakpoint: number) {
  const [isBelowBreakpoint, setIsBelowBreakpoint] = React.useState<boolean | undefined>(undefined);

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const onChange = () => {
      setIsBelowBreakpoint(window.innerWidth < breakpoint);
    };
    mql.addEventListener("change", onChange);
    setIsBelowBreakpoint(window.innerWidth < breakpoint);
    return () => mql.removeEventListener("change", onChange);
  }, [breakpoint]);

  return !!isBelowBreakpoint;
}

export function useIsMobile() {
  return useIsBelowBreakpoint(MOBILE_BREAKPOINT);
}
