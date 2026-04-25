import { useState } from "react";
import { Link } from "react-router-dom";
import { Building2, MapPin, Menu, Settings, Ticket, X } from "lucide-react";

import logo from "@/assets/logo.png";
import { Button } from "@/components/ui/button";

const desktopNavLinkClass =
  "h-10 gap-2 rounded-xl px-3 text-sm font-medium text-white/85 transition-colors hover:bg-white/10 hover:text-white";

export function LandingHeader() {
  const [mobileMenu, setMobileMenu] = useState(false);

  return (
    <header className="relative z-20 border-b border-white/10 bg-[hsl(222_47%_11%)] shadow-[0_18px_48px_-32px_rgba(15,23,42,0.95)]">
      <div className="mx-auto flex min-h-[4.75rem] max-w-7xl items-center justify-between gap-3 px-4 py-2.5 sm:min-h-[5.5rem] sm:px-6 lg:px-8">
        <Link to="/" className="flex items-center gap-2 py-1 pr-2 sm:pr-4">
          <img
            src={logo}
            alt="Smartbus BR"
            className="h-14 w-auto max-w-[185px] object-contain brightness-0 invert sm:h-[3.9rem] sm:max-w-[220px]"
          />
        </Link>

        <nav className="hidden items-center gap-4 md:flex">
          <div className="flex items-center gap-1.5">
            <Button asChild variant="ghost" className={desktopNavLinkClass}>
              <Link to="/eventos">
                <MapPin className="h-4 w-4" aria-hidden="true" />
                <span>Viagens</span>
              </Link>
            </Button>
            <Button asChild variant="ghost" className={desktopNavLinkClass}>
              <Link to="/consultar-passagens">
                <Ticket className="h-4 w-4" aria-hidden="true" />
                <span>Minhas Passagens</span>
              </Link>
            </Button>
            <Button asChild variant="ghost" className={desktopNavLinkClass}>
              <Link to="/sobre-smartbus-br">
                <Building2 className="h-4 w-4" aria-hidden="true" />
                <span>Sobre a Smartbus BR</span>
              </Link>
            </Button>
          </div>
          <Button
            asChild
            variant="outline"
            className="h-10 gap-2 border-white/20 bg-white text-slate-900 shadow-sm transition-colors duration-200 hover:bg-slate-100 hover:text-slate-900"
          >
            <Link to="/login">
              <Settings className="h-4 w-4" aria-hidden="true" />
              <span>Área Administrativa</span>
            </Link>
          </Button>
          <Button asChild className="h-10 gap-2 px-5">
            <Link to="/cadastro">
              <Building2 className="h-4 w-4" aria-hidden="true" />
              <span>Quero vender passagens</span>
            </Link>
          </Button>
        </nav>

        <button
          className="rounded-xl border border-white/10 bg-white/5 p-2.5 text-white shadow-sm transition-colors hover:bg-white/10 md:hidden"
          onClick={() => setMobileMenu(!mobileMenu)}
          aria-label="Menu"
        >
          {mobileMenu ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {mobileMenu && (
        <div className="animate-fade-in space-y-1 border-b border-white/10 bg-[hsl(222_47%_11%)] px-4 pb-5 text-white shadow-[0_20px_40px_-30px_rgba(15,23,42,0.95)] md:hidden">
          <Link
            to="/eventos"
            className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium text-white/90 transition-colors hover:bg-white/10"
            onClick={() => setMobileMenu(false)}
          >
            <MapPin className="h-4 w-4 shrink-0 text-primary" />
            Viagens
          </Link>
          <Link
            to="/consultar-passagens"
            className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium text-white/90 transition-colors hover:bg-white/10"
            onClick={() => setMobileMenu(false)}
          >
            <Ticket className="h-4 w-4 shrink-0 text-primary" />
            Minhas Passagens
          </Link>
          <Link
            to="/sobre-smartbus-br"
            className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium text-white/90 transition-colors hover:bg-white/10"
            onClick={() => setMobileMenu(false)}
          >
            <Building2 className="h-4 w-4 shrink-0 text-primary" />
            Sobre a Smartbus BR
          </Link>
          <div className="mt-2 space-y-2">
            <Link
              to="/login"
              className="flex items-center justify-center gap-2 rounded-lg border border-white/20 bg-white px-4 py-2.5 text-center text-sm font-medium text-slate-900 transition-colors duration-200 hover:bg-slate-100"
              onClick={() => setMobileMenu(false)}
            >
              <Settings className="h-4 w-4 shrink-0" />
              Área Administrativa
            </Link>
            <Link
              to="/cadastro"
              className="flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-center text-sm font-medium text-primary-foreground"
              onClick={() => setMobileMenu(false)}
            >
              <Building2 className="h-4 w-4 shrink-0" />
              Quero vender passagens
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
