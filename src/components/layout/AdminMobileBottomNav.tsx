import { MoreHorizontal } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import {
  adminMobileBottomNavItems,
  type AdminMobileBottomNavActiveItem,
  type AdminMobileBottomNavItem,
} from '@/components/layout/adminMobileBottomNavItems';

interface AdminMobileBottomNavProps {
  activeItem?: AdminMobileBottomNavActiveItem;
  items?: AdminMobileBottomNavItem[];
  onMoreClick: () => void;
}

export function AdminMobileBottomNav({ activeItem, items = adminMobileBottomNavItems, onMoreClick }: AdminMobileBottomNavProps) {
  const columnCount = Math.min(items.length + 1, 4);

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200/70 bg-white/95 px-4 pb-[calc(0.45rem+env(safe-area-inset-bottom))] pt-2 shadow-[0_-6px_18px_rgba(15,23,42,0.06)] backdrop-blur lg:hidden"
      aria-label="Navegação principal mobile"
    >
      <div className="mx-auto grid max-w-md gap-1" style={{ gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))` }}>
        {items.map((item) => {
          const isActive = activeItem === item.key;
          return (
            <Link
              key={item.key}
              to={item.href}
              className={cn(
                'flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl px-1.5 py-1 text-[0.68rem] font-medium transition active:scale-95',
                isActive ? 'text-[hsl(var(--primary))]' : 'text-slate-500'
              )}
            >
              <item.icon className="h-5 w-5" fill={isActive ? 'currentColor' : 'none'} strokeWidth={2} />
              <span>{item.title}</span>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={onMoreClick}
          className="flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl px-1.5 py-1 text-[0.68rem] font-medium text-slate-500 transition active:scale-95"
        >
          <MoreHorizontal className="h-5 w-5" strokeWidth={2} />
          <span>Mais</span>
        </button>
      </div>
    </nav>
  );
}
