import { Lock, CreditCard, Smartphone } from 'lucide-react';

export function TrustFooter() {
  return (
    <footer className="bg-card border-t">
      {/* Elementos de confiança */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex flex-col items-center gap-4">
          {/* Mensagem de segurança */}
          <div className="flex items-center gap-2 text-muted-foreground">
            <Lock className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">
              Pagamento 100% online e seguro
            </span>
          </div>
          
          {/* Ícones de pagamento */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Smartphone className="h-5 w-5" />
              <span className="text-xs">Pix</span>
            </div>
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <CreditCard className="h-5 w-5" />
              <span className="text-xs">Cartão</span>
            </div>
          </div>
        </div>
      </div>

      {/* Copyright */}
      <div className="border-t py-4">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-center text-xs text-muted-foreground">
            © {new Date().getFullYear()} Smartbus BR. Todos os direitos reservados.
          </p>
        </div>
      </div>
    </footer>
  );
}
