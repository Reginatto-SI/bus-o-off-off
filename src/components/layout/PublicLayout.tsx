import { ReactNode, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { Building2, LogOut, Menu, Search, Settings, Ticket, User } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { TrustFooter } from '@/components/public/TrustFooter';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/contexts/AuthContext';

interface PublicLayoutProps {
  children: ReactNode;
}

export function PublicLayout({ children }: PublicLayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navigate = useNavigate();

  // Indicador de login: session check leve para exibir menu de usuário quando autenticado
  const { session, profile, isGerente, isOperador, signOut } = useAuth();
  const isAuthenticated = !!session?.user;
  const userName = profile?.name || session?.user?.email?.split('@')[0] || 'Usuário';

  const desktopNavItemClass =
    'group inline-flex items-center gap-2 rounded-md border border-transparent px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-all hover:text-foreground hover:underline hover:underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';

  // Links para usuários NÃO autenticados
  const mobileLinksAnon = [
    { to: '/eventos', label: 'Comprar Passagens', icon: Ticket },
    { to: '/consultar-passagens', label: 'Minhas Passagens', icon: Search },
    { to: '/cadastro', label: 'Quero vender passagens', icon: Building2 },
    { to: '/login', label: 'Área Administrativa', icon: Settings },
  ];

  // Links para usuários autenticados no mobile
  const mobileLinksAuth = [
    { to: '/eventos', label: 'Comprar Passagens', icon: Ticket },
    { to: '/consultar-passagens', label: 'Minhas Passagens', icon: Search },
    ...(isGerente || isOperador
      ? [{ to: '/admin/eventos', label: 'Área Administrativa', icon: Settings }]
      : []),
  ];

  const desktopLinks = [
    { to: '/consultar-passagens', label: 'Minhas Passagens', icon: Ticket, end: false },
  ];

  const ctaLink = { to: '/cadastro', label: 'Quero vender passagens' };

  const handleSignOut = async () => {
    await signOut();
    navigate('/eventos');
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="bg-card border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14 sm:h-16">
            <Link to="/eventos" className="flex items-center gap-2">
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

              {/* Indicador de login: menu de usuário autenticado ou links padrão */}
              {isAuthenticated ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="gap-2">
                      <User className="h-4 w-4" />
                      <span className="max-w-[120px] truncate">{userName}</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {(isGerente || isOperador) && (
                      <>
                        <DropdownMenuItem onClick={() => navigate('/admin/eventos')}>
                          <Settings className="h-4 w-4 mr-2" />
                          Área Administrativa
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                      </>
                    )}
                    <DropdownMenuItem onClick={handleSignOut}>
                      <LogOut className="h-4 w-4 mr-2" />
                      Sair
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <>
                  <NavLink
                    to="/login"
                    end
                    className={({ isActive }) =>
                      `${desktopNavItemClass} ${
                        isActive
                          ? 'text-foreground underline underline-offset-4 decoration-1 decoration-foreground/60'
                          : ''
                      }`
                    }
                  >
                    <Settings className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>Área Administrativa</span>
                  </NavLink>
                  <Link
                    to={ctaLink.to}
                    className="inline-flex items-center gap-2 rounded-md border border-primary px-3 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
                  >
                    <Building2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{ctaLink.label}</span>
                  </Link>
                </>
              )}
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
                  {(isAuthenticated ? mobileLinksAuth : mobileLinksAnon).map((item) => (
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
                  {isAuthenticated && (
                    <button
                      onClick={() => {
                        setMobileMenuOpen(false);
                        handleSignOut();
                      }}
                      className="flex items-center gap-3 rounded-md px-4 py-3 text-base font-medium text-destructive hover:bg-muted transition-colors"
                    >
                      <LogOut className="h-4 w-4" />
                      Sair
                    </button>
                  )}
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
