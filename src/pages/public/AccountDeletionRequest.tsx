import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { usePageMeta } from '@/lib/usePageMeta';
import { Button } from '@/components/ui/button';

const OFFICIAL_EMAIL = 'comercial@smartbuscom.br';
const OFFICIAL_PHONE = '(31) 9 9207-4309';
const LAST_UPDATED = '23 de julho de 2026';

const requestItems = [
  'Nome completo;',
  'CPF ou CNPJ vinculado à conta, quando aplicável;',
  'E-mail utilizado na conta;',
  'Telefone;',
  'Nome da empresa vinculada, quando aplicável;',
  'Motivo ou descrição do pedido;',
  'Informação suficiente para localizar a conta.',
];

const analysisItems = [
  'conta do usuário;',
  'vínculos com empresas;',
  'eventos;',
  'vendas;',
  'pagamentos;',
  'passagens;',
  'registros de embarque;',
  'obrigações fiscais, financeiras e legais;',
  'registros necessários para prevenção de fraude e defesa de direitos.',
];

const retentionItems = [
  'cumprimento de obrigação legal;',
  'registros financeiros e fiscais;',
  'auditoria;',
  'prevenção de fraude;',
  'resolução de disputas;',
  'defesa de direitos;',
  'preservação da integridade das vendas e passagens.',
];

export default function AccountDeletionRequest() {
  usePageMeta({
    title: 'Solicitação de exclusão de conta e dados | SmartBus',
    description:
      'Saiba como solicitar manualmente a exclusão de conta e dados pessoais vinculados ao SmartBus.',
    path: '/exclusao-de-conta',
  });

  return (
    <PublicLayout>
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-10">
        <div className="mb-6">
          <Button asChild variant="ghost" size="sm" className="-ml-2 gap-2 text-muted-foreground">
            <Link to="/eventos">
              <ArrowLeft className="h-4 w-4" />
              Voltar para a página inicial
            </Link>
          </Button>
        </div>

        <article className="space-y-8 rounded-xl border bg-card p-5 shadow-sm sm:p-8">
          <header className="space-y-3 border-b pb-6">
            <p className="text-sm font-medium uppercase tracking-wide text-primary">SmartBus</p>
            <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">Solicitação de exclusão de conta e dados</h1>
            <p className="text-sm text-muted-foreground">Última atualização: {LAST_UPDATED}</p>
            <p className="max-w-3xl text-base leading-relaxed text-muted-foreground">
              Usuários do SmartBus podem solicitar a exclusão da conta e dos dados pessoais vinculados. As solicitações são analisadas individualmente para proteger a conta do usuário e preservar os registros que precisam ser mantidos por obrigações legais, financeiras ou de segurança.
            </p>
          </header>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">Quem pode solicitar</h2>
            <p>A solicitação pode ser feita por:</p>
            <ul className="list-disc space-y-2 pl-5">
              <li>empresas organizadoras;</li>
              <li>representantes;</li>
              <li>usuários administrativos;</li>
              <li>usuários operacionais;</li>
              <li>titulares de dados pessoais cadastrados no sistema.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">Como solicitar</h2>
            <p>Envie sua solicitação por um dos canais oficiais:</p>
            <ul className="list-disc space-y-2 pl-5">
              <li>E-mail: <a href={`mailto:${OFFICIAL_EMAIL}`} className="font-medium text-primary underline-offset-4 hover:underline">{OFFICIAL_EMAIL}</a></li>
              <li>Telefone/WhatsApp: <a href="https://wa.me/5531992074309" target="_blank" rel="noopener noreferrer" className="font-medium text-primary underline-offset-4 hover:underline">{OFFICIAL_PHONE}</a></li>
            </ul>
            <p>A solicitação deve conter:</p>
            <ul className="list-disc space-y-2 pl-5">
              {requestItems.map((item) => <li key={item}>{item}</li>)}
            </ul>
            <p className="text-sm text-muted-foreground">Não envie senha, código de autenticação, dados completos de cartão, chaves de acesso ou documentos adicionais antes de uma solicitação específica da equipe.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">Validação de identidade</h2>
            <p>
              O SmartBus poderá solicitar informações adicionais para confirmar a identidade do solicitante e evitar exclusões indevidas, acessos não autorizados ou impactos em contas e empresas vinculadas.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">O que será analisado</h2>
            <p>Após a validação, a equipe verificará:</p>
            <ul className="list-disc space-y-2 pl-5">
              {analysisItems.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">Dados que podem permanecer</h2>
            <p>Determinados registros poderão ser mantidos quando necessários para:</p>
            <ul className="list-disc space-y-2 pl-5">
              {retentionItems.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">Prazo de atendimento</h2>
            <p>
              A solicitação será analisada e respondida dentro de prazo razoável, considerando a complexidade do pedido e as obrigações legais aplicáveis.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">Confirmação</h2>
            <p>
              O usuário receberá retorno pelo canal informado na solicitação. Quando a exclusão total não for possível, o SmartBus informará, de forma objetiva, quais registros precisam permanecer e por qual motivo geral.
            </p>
          </section>

          <section className="space-y-3 rounded-lg border bg-muted/30 p-4">
            <h2 className="text-base font-semibold">Política de Privacidade</h2>
            <p className="text-sm text-muted-foreground">
              Para entender como os dados são tratados no SmartBus, consulte também a{' '}
              <Link to="/privacidade" className="font-medium text-primary underline-offset-4 hover:underline">
                Política de Privacidade
              </Link>.
            </p>
          </section>

          {/* O fluxo atual registra e orienta a solicitação manual de exclusão. A exclusão automática poderá ser implementada futuramente após definição das regras de retenção, vínculos multiempresa e integridade dos registros financeiros e operacionais. */}
        </article>
      </div>
    </PublicLayout>
  );
}
