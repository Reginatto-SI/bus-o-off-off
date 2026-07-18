import { ReactNode } from 'react';
import { Menu } from 'lucide-react';

interface AdminMobileHeaderProps {
  title: string;
  subtitle?: string;
  onMenuClick: () => void;
  rightAction?: ReactNode;
}

export function AdminMobileHeader({ title, subtitle, onMenuClick, rightAction }: AdminMobileHeaderProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/95 px-4 pt-[calc(0.7rem+env(safe-area-inset-top))] backdrop-blur lg:hidden">
      <div className="mx-auto flex max-w-md items-center justify-between gap-3 pb-3">
        <button
          type="button"
          onClick={onMenuClick}
          className="flex h-11 w-11 items-center justify-center rounded-xl text-slate-700 active:bg-slate-100"
          aria-label="Abrir menu administrativo"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1 text-center" aria-label={subtitle ? `${title}: ${subtitle}` : title}>
          <h1 className="truncate text-base font-bold leading-tight text-slate-950">{title}</h1>
          {subtitle && <p className="truncate text-xs text-slate-500">{subtitle}</p>}
        </div>
        <div className="flex h-11 w-11 items-center justify-center">{rightAction}</div>
      </div>
    </header>
  );
}
