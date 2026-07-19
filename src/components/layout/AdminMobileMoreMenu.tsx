import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  buildAdminPublicShowcaseUrl,
  canViewAdminNavigationItem,
  getAdminNavigationGroupsWithDynamicItems,
  type NavigationItem,
} from '@/components/layout/adminNavigation';

interface AdminMobileMoreMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AdminMobileMoreMenu({ open, onOpenChange }: AdminMobileMoreMenuProps) {
  const { userRole, isDeveloper, canAccessTemplatesLayout, activeCompany } = useAuth();
  const navigate = useNavigate();

  const publicShowcaseUrl = useMemo(() => buildAdminPublicShowcaseUrl(activeCompany?.public_slug), [activeCompany?.public_slug]);

  const visibleGroups = useMemo(() => {
    // Comentário: usa a mesma montagem dinâmica da sidebar para não duplicar regra/destino da Vitrine Pública.
    return getAdminNavigationGroupsWithDynamicItems(publicShowcaseUrl)
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => canViewAdminNavigationItem({
          item,
          userRole,
          isDeveloper,
          canAccessTemplatesLayout,
        })),
      }))
      .filter((group) => group.items.length > 0);
  }, [canAccessTemplatesLayout, isDeveloper, publicShowcaseUrl, userRole]);

  const handleItemClick = (item: NavigationItem) => {
    // Comentário: mantém a mesma regra dinâmica da sidebar sem abrir o drawer desktop no mobile.
    if (item.id === 'public-showcase' && !publicShowcaseUrl) {
      toast.warning('Configure o link da sua vitrine em /admin/empresa antes de acessar.');
      navigate('/admin/empresa');
    }
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="flex max-h-[min(82vh,calc(100dvh-1rem))] flex-col overflow-hidden rounded-t-3xl border-slate-200 bg-[#fbfaf8] px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4 lg:hidden">
        <SheetHeader className="mx-auto max-w-md text-left">
          <SheetTitle className="text-base font-bold text-slate-950">Mais opções</SheetTitle>
          <SheetDescription>Escolha uma funcionalidade disponível para o seu perfil.</SheetDescription>
        </SheetHeader>

        <div className="sidebar-scroll-hidden mx-auto mt-4 w-full max-w-md flex-1 space-y-4 overflow-y-auto overscroll-contain pb-3 pr-1">
          {visibleGroups.map((group) => (
            <section key={group.id} className="space-y-2" aria-labelledby={`mobile-more-${group.id}`}>
              {!group.standalone && (
                <h3 id={`mobile-more-${group.id}`} className="px-1 text-xs font-bold uppercase tracking-wide text-slate-500">
                  {group.label}
                </h3>
              )}
              <div className="grid grid-cols-2 gap-2.5">
                {group.items.map((item) => {
                  const itemContent = (
                    <>
                      <span className="mb-2 flex h-9 w-9 items-center justify-center rounded-xl bg-orange-50 text-[hsl(var(--primary))]">
                        <item.icon className="h-5 w-5" strokeWidth={2} />
                      </span>
                      <span className="line-clamp-2 break-words text-sm font-semibold leading-tight text-slate-950">{item.name}</span>
                      {item.statusLabel && <span className="mt-auto pt-1 text-[0.68rem] leading-tight text-slate-500">{item.statusLabel}</span>}
                    </>
                  );
                  const className = cn('flex min-h-[6.25rem] flex-col items-start rounded-2xl border border-slate-200/70 bg-white p-3 text-left shadow-[0_6px_16px_rgba(15,23,42,0.05)] transition active:scale-[0.98]', item.disabled && 'opacity-60');

                  if (!item.href || item.disabled) {
                    return <button key={`${group.id}-${item.name}`} type="button" disabled className={className}>{itemContent}</button>;
                  }

                  if (item.openInNewTab) {
                    return <a key={`${group.id}-${item.href}`} href={item.href} target="_blank" rel="noreferrer" onClick={() => handleItemClick(item)} className={className}>{itemContent}</a>;
                  }

                  return <Link key={`${group.id}-${item.href}`} to={item.href} onClick={() => handleItemClick(item)} className={className}>{itemContent}</Link>;
                })}
              </div>
            </section>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
