import { Link } from 'react-router-dom';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { Button } from '@/components/ui/button';

export default function IntermediationPolicy() {
  return (
    <PublicLayout>
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        <div className="space-y-2">
          <Link to="/eventos" className="text-sm text-primary underline underline-offset-2">Voltar para eventos</Link>
          <h1 className="text-2xl font-bold">Política de Intermediação e Responsabilidade</h1>
          <p className="text-sm text-muted-foreground">
            A Smartbus BR é uma plataforma digital de divulgação, gestão e venda de passagens para transportes vinculados a eventos. Nosso papel é intermediar a disponibilização das ofertas ao passageiro, conectando clientes às empresas organizadoras responsáveis por cada transporte anunciado na plataforma.
          </p>
        </div>

        {/* Conteúdo institucional público para transparência jurídica no fluxo de compra mobile-first. */}
        <section className="space-y-4 rounded-lg border bg-card p-4 text-sm leading-relaxed">
          <div className="space-y-1">
            <h2 className="font-semibold">1. Papel da Smartbus BR</h2>
            <p>A Smartbus BR atua exclusivamente como intermediadora tecnológica e comercial da venda de passagens. A plataforma não realiza o transporte, não opera veículos, não define rotas, não executa embarques e não presta diretamente o serviço de transporte ao passageiro.</p>
          </div>

          <div className="space-y-1">
            <h2 className="font-semibold">2. Responsabilidade da empresa organizadora</h2>
            <p>Cada transporte anunciado na plataforma é de responsabilidade exclusiva da empresa organizadora vinculada ao evento. Cabe à empresa organizadora responder integralmente pela execução do transporte, disponibilidade operacional, horários, pontos de embarque, alterações, atrasos, cancelamentos, reembolsos, atendimento ao passageiro e demais obrigações relacionadas ao serviço ofertado.</p>
          </div>

          <div className="space-y-1">
            <h2 className="font-semibold">3. Cancelamentos, alterações e reembolsos</h2>
            <p>Pedidos de cancelamento, reembolso, remarcação, alteração de horário, mudança de local de embarque ou qualquer demanda relacionada à execução do transporte devem ser tratados conforme as regras e políticas da empresa organizadora responsável pelo evento e pelo transporte.</p>
          </div>

          <div className="space-y-1">
            <h2 className="font-semibold">4. Informações apresentadas na plataforma</h2>
            <p>A Smartbus BR disponibiliza na plataforma as informações fornecidas pela empresa organizadora, buscando facilitar a divulgação, a gestão e a venda das passagens. Eventuais atualizações operacionais, mudanças de logística, ajustes de horários ou decisões comerciais relacionadas ao transporte são de responsabilidade da empresa organizadora.</p>
          </div>

          <div className="space-y-1">
            <h2 className="font-semibold">5. Ciência do passageiro</h2>
            <p>Ao concluir a compra, o passageiro declara estar ciente de que a Smartbus BR atua apenas como plataforma intermediadora e de que a empresa organizadora identificada no evento é a responsável exclusiva pelo serviço de transporte contratado.</p>
          </div>

          <div className="space-y-1">
            <h2 className="font-semibold">6. Identificação da organizadora</h2>
            <p>Sempre que aplicável, a página do evento, o fluxo de compra, a confirmação da compra e a própria passagem apresentarão a identificação da empresa responsável pela operação do transporte, para reforçar a transparência da contratação.</p>
          </div>

          <div className="space-y-1">
            <h2 className="font-semibold">7. Atendimento</h2>
            <p>Sempre que a demanda envolver execução do transporte, cancelamento, alteração, reembolso ou operação do evento, o atendimento principal deverá ser realizado pela empresa organizadora responsável.</p>
          </div>

          <p className="pt-2 border-t text-muted-foreground">A Smartbus BR mantém seu compromisso com transparência, organização da jornada de compra e apoio tecnológico à comercialização das passagens, sem assumir a posição de transportadora ou executora do serviço ofertado.</p>
        </section>

        <div className="rounded-lg border bg-muted/30 p-4 text-sm">
          <p className="font-medium">Orientação de atendimento</p>
          <p className="text-muted-foreground">Para dúvidas sobre embarque, horários, alterações, cancelamentos ou reembolsos, entre em contato com a empresa organizadora identificada no evento e na passagem.</p>
        </div>

        <Button asChild variant="outline" className="w-full sm:w-auto">
          <Link to="/eventos">Ver eventos disponíveis</Link>
        </Button>
      </div>
    </PublicLayout>
  );
}
