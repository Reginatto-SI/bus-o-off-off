import { Link } from 'react-router-dom';
import { Lock, CreditCard, Smartphone } from 'lucide-react';
import { FooterVersionInfo } from '@/components/system/FooterVersionInfo';

interface TrustFooterProps {
  companyName?: string | null;
}

export function TrustFooter({ companyName }: TrustFooterProps) {
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
          {companyName ? (
            <div className="flex flex-col items-center justify-center gap-2 text-center text-xs text-muted-foreground">
              {/* Informação institucional exclusiva da vitrine /empresa: mantém as demais páginas com o rodapé legado. */}
              <p className="max-w-3xl leading-relaxed">
                Esta vitrine é operada por <strong className="font-semibold text-foreground">{companyName}</strong>, responsável pela oferta e organização das viagens apresentadas nesta vitrine.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-x-1">
                <span>Venda intermediada pela SmartBus — CNPJ 67.871.644/0001-26.</span>
                <Link to="/privacidade" className="underline-offset-4 hover:text-foreground hover:underline">Política de Privacidade</Link>
                <span>•</span>
                <Link to="/exclusao-de-conta" className="underline-offset-4 hover:text-foreground hover:underline">Exclusão de conta</Link>
                <span>•</span>
                <FooterVersionInfo />
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-center gap-x-1 text-center text-xs text-muted-foreground">
              {/* Rodapé legado: não alterar páginas públicas sem empresa da vitrine. */}
              <span>© {new Date().getFullYear()} SmartBus. Todos os direitos reservados • CNPJ 67.871.644/0001-26</span>
              <Link to="/privacidade" className="underline-offset-4 hover:text-foreground hover:underline">Política de Privacidade</Link>
              <span>•</span>
              <Link to="/exclusao-de-conta" className="underline-offset-4 hover:text-foreground hover:underline">Exclusão de conta</Link>
              <span>•</span>
              <FooterVersionInfo />
            </div>
          )}
        </div>
      </div>
    </footer>
  );
}
