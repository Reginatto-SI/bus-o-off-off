import { ReactNode, useState } from 'react';
import { Link } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { TrustFooter } from '@/components/public/TrustFooter';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';

interface PublicLayoutProps {
  children: ReactNode;
}

export function PublicLayout({ children }: PublicLayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const mobileLinks = [
    { to: '/eventos', label: '🎫 Comprar Passagens' },
    { to: '/consultar-passagens', label: '🔎 Minhas Passagens' },
    { to: '/login', label: '🔐 Área Administrativa' },
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

            <div className="hidden sm:flex items-center gap-4">
              <Link
                to="/consultar-passagens"
                className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                Minhas Passagens
              </Link>
              <Link
                to="/login"
                className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                Área Administrativa
              </Link>
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
                      className="rounded-md px-4 py-3 text-base font-medium text-foreground hover:bg-muted transition-colors"
                    >
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
