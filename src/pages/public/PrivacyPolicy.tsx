import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { usePageMeta } from '@/lib/usePageMeta';
import { Button } from '@/components/ui/button';

const LAST_UPDATED = '23 de julho de 2026';
const OFFICIAL_EMAIL = 'comercial@smartbuscom.br';
const OFFICIAL_PHONE = '(31) 9 9207-4309';

const summaryItems = [
  { href: '#identificacao', label: '1. Identificação da plataforma' },
  { href: '#abrangencia', label: '2. Abrangência' },
  { href: '#dados-coletados', label: '3. Dados pessoais coletados' },
  { href: '#finalidades', label: '4. Finalidades do tratamento' },
  { href: '#compartilhamento', label: '5. Compartilhamento de dados' },
  { href: '#pagamentos', label: '6. Pagamentos' },
  { href: '#camera', label: '7. Uso da câmera' },
  { href: '#armazenamento-local', label: '8. Armazenamento local' },
  { href: '#seguranca', label: '9. Armazenamento e segurança' },
  { href: '#retencao', label: '10. Prazo de retenção' },
  { href: '#direitos', label: '11. Direitos do titular' },
  { href: '#exclusao', label: '12. Exclusão de dados e conta' },
  { href: '#menores', label: '13. Dados de menores' },
  { href: '#atualizacoes', label: '14. Atualizações' },
  { href: '#contato', label: '15. Canal de contato' },
];

export default function PrivacyPolicy() {
  usePageMeta({
    title: 'Política de Privacidade | SmartBus',
    description:
      'Saiba como o SmartBus coleta, utiliza, compartilha e protege dados pessoais nos fluxos de compra, operação e administração da plataforma.',
    path: '/privacidade',
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
            <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">Política de Privacidade</h1>
            <p className="text-sm text-muted-foreground">Última atualização: {LAST_UPDATED}</p>
            <p className="max-w-3xl text-base leading-relaxed text-muted-foreground">
              Esta política explica, em linguagem simples, como o SmartBus trata dados pessoais nos fluxos de compra de passagens, operação de embarque, atendimento, cadastro e administração da plataforma.
            </p>
          </header>

          <nav aria-label="Sumário da política" className="rounded-lg border bg-muted/30 p-4">
            <h2 className="mb-3 text-sm font-semibold text-foreground">Sumário</h2>
            <ul className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
              {summaryItems.map((item) => (
                <li key={item.href}>
                  <a className="underline-offset-4 hover:text-foreground hover:underline" href={item.href}>
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <section id="identificacao" className="scroll-mt-24 space-y-3">
            <h2 className="text-xl font-semibold">1. Identificação da plataforma</h2>
            <p>
              O SmartBus é uma plataforma digital de divulgação, gestão e comercialização de passagens vinculadas a eventos e transportes organizados por empresas parceiras.
            </p>
            <p>
              O SmartBus é operado por <strong>67.871.644 Diego Ricardo Machado</strong>, inscrito no CNPJ nº <strong>67.871.644/0001-26</strong>.
            </p>
          </section>

          <section id="abrangencia" className="scroll-mt-24 space-y-3">
            <h2 className="text-xl font-semibold">2. Abrangência da política</h2>
            <p>Esta política se aplica ao site, ao sistema web, ao aplicativo Android, ao aplicativo iOS, aos fluxos públicos de compra e aos painéis administrativos e operacionais do SmartBus.</p>
          </section>

          <section id="dados-coletados" className="scroll-mt-24 space-y-3">
            <h2 className="text-xl font-semibold">3. Dados pessoais coletados</h2>
            <p>Conforme o uso da plataforma, podem ser tratados os seguintes dados:</p>
            <ul className="list-disc space-y-2 pl-5">
              <li>nome, CPF, telefone e e-mail informados no cadastro, login, compra, consulta ou atendimento;</li>
              <li>dados de passageiros, incluindo nome, CPF, telefone, tipo de passagem, evento, viagem, embarque, assento e histórico da compra;</li>
              <li>dados de empresas organizadoras, responsáveis, documentos de cadastro, contatos, configurações de vitrine, eventos, viagens, veículos, motoristas, auxiliares, vendedores e representantes;</li>
              <li>dados de usuários administrativos e operacionais, incluindo nome, e-mail, perfil de acesso, empresa vinculada e registros de uso necessários para controle operacional;</li>
              <li>informações de venda, pagamento, status da cobrança, ambiente de pagamento, identificadores de transação, confirmação de pagamento, cancelamento, reembolso e registros financeiros necessários para a operação;</li>
              <li>dados técnicos do acesso, como data, horário, navegador, dispositivo, origem da navegação, identificadores técnicos, registros de erro e informações necessárias para segurança, auditoria e prevenção de fraude.</li>
            </ul>
          </section>

          <section id="finalidades" className="scroll-mt-24 space-y-3">
            <h2 className="text-xl font-semibold">4. Finalidades do tratamento</h2>
            <p>Os dados podem ser utilizados para:</p>
            <ul className="list-disc space-y-2 pl-5">
              <li>processar a compra e calcular corretamente valores, benefícios, taxas e disponibilidade de assentos;</li>
              <li>emitir, disponibilizar e consultar passagens;</li>
              <li>identificar o passageiro e permitir validação no embarque por QR Code ou código da passagem;</li>
              <li>confirmar pagamento, acompanhar status de cobrança e disponibilizar comprovantes ou informações relacionadas à compra;</li>
              <li>prestar atendimento e enviar comunicações operacionais relacionadas à compra, evento, embarque ou pagamento;</li>
              <li>permitir a gestão de empresas, eventos, viagens, frota, vendedores, representantes, auxiliares de embarque e usuários administrativos;</li>
              <li>prevenir fraudes, investigar falhas, manter registros de segurança e auditoria e cumprir obrigações legais, regulatórias, fiscais e financeiras.</li>
            </ul>
          </section>

          <section id="compartilhamento" className="scroll-mt-24 space-y-3">
            <h2 className="text-xl font-semibold">5. Compartilhamento dos dados</h2>
            <p>O SmartBus pode compartilhar dados pessoais apenas quando necessário para operar a plataforma ou cumprir obrigações legais, incluindo:</p>
            <ul className="list-disc space-y-2 pl-5">
              <li>a empresa organizadora responsável pelo transporte, para identificação dos passageiros, gestão da operação, atendimento, embarque, cancelamentos e reembolsos;</li>
              <li>o gateway de pagamento Asaas, para criação, processamento, consulta e confirmação de cobranças;</li>
              <li>prestadores de infraestrutura, hospedagem, autenticação, banco de dados e tecnologia necessários para manter o sistema funcionando;</li>
              <li>autoridades públicas, órgãos reguladores ou terceiros quando houver obrigação legal, ordem válida ou necessidade de defesa de direitos.</li>
            </ul>
            <p>O SmartBus não vende dados pessoais.</p>
          </section>

          <section id="pagamentos" className="scroll-mt-24 space-y-3">
            <h2 className="text-xl font-semibold">6. Pagamentos</h2>
            <p>
              Os pagamentos são processados pelo Asaas. O SmartBus envia ao Asaas somente os dados necessários para criar, processar, consultar e confirmar a cobrança, como identificação da venda, valor, forma de pagamento, dados do comprador ou passageiro responsável e informações operacionais do pedido.
            </p>
            <p>
              O SmartBus mantém identificadores, status e registros operacionais do pagamento para controle da venda, emissão da passagem, atendimento, auditoria e cumprimento de obrigações legais. Dados sensíveis completos de cartão não são armazenados pelo SmartBus.
            </p>
          </section>

          <section id="camera" className="scroll-mt-24 space-y-3">
            <h2 className="text-xl font-semibold">7. Uso da câmera</h2>
            <p>
              A câmera é utilizada exclusivamente para leitura de QR Codes durante a validação de passagens e serviços. As imagens captadas para essa leitura não são armazenadas pelo SmartBus.
            </p>
          </section>

          <section id="armazenamento-local" className="scroll-mt-24 space-y-3">
            <h2 className="text-xl font-semibold">8. Armazenamento local e tecnologias semelhantes</h2>
            <p>
              O sistema pode utilizar o armazenamento do navegador ou do aplicativo para manter a sessão autenticada, lembrar a empresa ativa, lembrar o e-mail quando autorizado pelo usuário e preservar preferências necessárias ao funcionamento, como preferências operacionais do validador.
            </p>
            <p>Esses recursos são usados para melhorar a experiência e manter funções essenciais do sistema. O SmartBus não utiliza esses recursos para publicidade comportamental ou rastreamento de marketing.</p>
          </section>

          <section id="seguranca" className="scroll-mt-24 space-y-3">
            <h2 className="text-xl font-semibold">9. Armazenamento e segurança</h2>
            <p>
              O SmartBus adota medidas técnicas e organizacionais adequadas ao funcionamento da plataforma para proteger dados pessoais contra acesso indevido, alteração, perda, uso não autorizado e incidentes de segurança. Essas medidas incluem controle de acesso por perfil, autenticação, isolamento por empresa, registros operacionais e uso de infraestrutura especializada.
            </p>
            <p>Nenhum sistema é totalmente imune a riscos. Por isso, as práticas de segurança são avaliadas e ajustadas conforme a evolução da plataforma.</p>
          </section>

          <section id="retencao" className="scroll-mt-24 space-y-3">
            <h2 className="text-xl font-semibold">10. Prazo de retenção</h2>
            <p>
              Os dados são mantidos pelo período necessário para executar os serviços, disponibilizar passagens, confirmar pagamentos, atender obrigações legais, regulatórias, fiscais e financeiras, resolver disputas, prevenir fraudes e manter registros operacionais e de auditoria.
            </p>
            <p>Quando os dados deixarem de ser necessários, poderão ser eliminados, anonimizados ou mantidos de forma restrita quando houver obrigação legal ou necessidade legítima de conservação.</p>
          </section>

          <section id="direitos" className="scroll-mt-24 space-y-3">
            <h2 className="text-xl font-semibold">11. Direitos do titular</h2>
            <p>Nos termos da LGPD, o titular pode solicitar, quando aplicável:</p>
            <ul className="list-disc space-y-2 pl-5">
              <li>confirmação da existência de tratamento;</li>
              <li>acesso aos dados pessoais;</li>
              <li>correção de dados incompletos, inexatos ou desatualizados;</li>
              <li>anonimização, bloqueio ou eliminação de dados desnecessários, excessivos ou tratados em desconformidade;</li>
              <li>portabilidade dos dados, observadas as regras aplicáveis;</li>
              <li>informação sobre compartilhamento de dados;</li>
              <li>revogação do consentimento, quando o tratamento depender de consentimento;</li>
              <li>revisão de decisões automatizadas, quando aplicável.</li>
            </ul>
          </section>

          <section id="exclusao" className="scroll-mt-24 space-y-3">
            <h2 className="text-xl font-semibold">12. Exclusão de dados e conta</h2>
            <p>
              O sistema permite criação de contas para empresas organizadoras, representantes e usuários operacionais ou administrativos. Para solicitar exclusão de conta ou de dados pessoais, utilize a página pública de <Link to="/exclusao-de-conta" className="font-medium text-primary underline-offset-4 hover:underline">Solicitação de exclusão de conta e dados</Link>.
            </p>
            <p>
              Algumas informações podem precisar ser mantidas mesmo após a solicitação de exclusão, quando forem necessárias para cumprimento de obrigações legais, registros financeiros, prevenção de fraude, auditoria, resolução de disputas ou defesa de direitos.
            </p>
          </section>

          <section id="menores" className="scroll-mt-24 space-y-3">
            <h2 className="text-xl font-semibold">13. Dados de menores</h2>
            <p>
              O SmartBus pode receber dados de passageiros menores de idade quando essas informações forem inseridas por pais, mães ou responsáveis durante a compra ou organização do transporte. Esses dados são utilizados para emissão da passagem, identificação do passageiro e operação do embarque.
            </p>
            <p>Quem informa dados de menor deve possuir autorização ou responsabilidade legal para realizar a compra e fornecer essas informações.</p>
          </section>

          <section id="atualizacoes" className="scroll-mt-24 space-y-3">
            <h2 className="text-xl font-semibold">14. Atualizações da política</h2>
            <p>
              Esta política poderá ser atualizada para refletir mudanças na plataforma, nos serviços, em integrações, na legislação ou em práticas de segurança. A versão vigente sempre apresentará a data da última atualização no início da página.
            </p>
          </section>

          <section id="contato" className="scroll-mt-24 space-y-3">
            <h2 className="text-xl font-semibold">15. Canal de contato</h2>
            <p>Para dúvidas, solicitações sobre dados pessoais ou pedidos relacionados a esta política, entre em contato pelos canais oficiais:</p>
            <ul className="list-disc space-y-2 pl-5">
              <li>E-mail: <a href={`mailto:${OFFICIAL_EMAIL}`} className="font-medium text-primary underline-offset-4 hover:underline">{OFFICIAL_EMAIL}</a></li>
              <li>Telefone/WhatsApp: <a href="https://wa.me/5531992074309" target="_blank" rel="noopener noreferrer" className="font-medium text-primary underline-offset-4 hover:underline">{OFFICIAL_PHONE}</a></li>
            </ul>
          </section>
        </article>
      </div>
    </PublicLayout>
  );
}
