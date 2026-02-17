import { ReactNode, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { Building2, Menu, Search, Settings, Ticket } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { TrustFooter } from '@/components/public/TrustFooter';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';

interface PublicLayoutProps {
  children: ReactNode;
}

export function PublicLayout({ children }: PublicLayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Comentário: centralizamos classes do link desktop para manter estilo consistente e facilitar suporte futuro.
  const desktopNavItemClass =
    'group inline-flex items-center gap-2 rounded-md border border-transparent px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-all hover:text-foreground hover:underline hover:underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';

  // Comentário: reutilizamos os ícones Lucide já adotados no projeto para manter padrão visual moderno no mobile.
  const mobileLinks = [
    { to: '/eventos', label: 'Comprar Passagens', icon: Ticket },
    { to: '/consultar-passagens', label: 'Minhas Passagens', icon: Search },
    { to: '/login', label: 'Área Administrativa', icon: Building2 },
  ];

  // Comentário: usamos `end` apenas quando necessário para evitar múltiplos itens ativos em rotas aninhadas.
  // Comentário: removemos o atalho direto de vendedor no header para centralizar o acesso via Área Administrativa.
  const desktopLinks = [
    { to: '/consultar-passagens', label: 'Minhas Passagens', icon: Ticket, end: false },
    { to: '/login', label: 'Área Administrativa', icon: Settings, end: true },
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="bg-card border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14 sm:h-16">
            <Link to="/eventos" className="flex items-center gap-2">
              {/* Comentário: reduzimos o logo no mobile para preservar espaço no topo sem perder identificação. */}
              <Logo size="md" className="sm:[&>img]:h-14" />
            </Link>

            <div className="hidden sm:flex items-center gap-5">
              {desktopLinks.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `${desktopNavItemClass} ${
                      isActive
                        ? 'text-foreground underline underline-offset-4 decoration-1 decoration-foreground/60'
                        : ''
                    }`
                  }
                >
                  <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </div>

            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="sm:hidden"
                  aria-label="Abrir menu de navegação"
                >
                  <Menu className="h-6 w-6" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[85vw] max-w-xs">
                <SheetHeader>
                  <SheetTitle>Navegação</SheetTitle>
                </SheetHeader>
                <nav className="mt-6 flex flex-col gap-2">
                  {mobileLinks.map((item) => (
                    <Link
                      key={item.to}
                      to={item.to}
                      onClick={() => setMobileMenuOpen(false)}
                      className="flex items-center gap-3 rounded-md px-4 py-3 text-base font-medium text-foreground hover:bg-muted transition-colors"
                    >
                      <item.icon className="h-4 w-4 text-muted-foreground" />
                      {item.label}
                    </Link>
                  ))}
                </nav>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {children}
      </main>

      <TrustFooter />
    </div>
  );
}
