/**
 * PassengerTicketList — Componente reutilizável que agrupa passagens por passageiro.
 *
 * Motivação: em compras com múltiplos passageiros e/ou ida+volta, a listagem
 * aberta de todos os TicketCards gerava scroll excessivo. Este componente:
 *   1. Agrupa tickets pelo CPF do passageiro (normalizado)
 *   2. Detecta ida/volta pelo prefixo "VOLTA-" no seatLabel
 *   3. Exibe cards resumidos e compactos por passageiro
 *   4. Abre o detalhe (TicketCard completo) sob demanda, com abas ida/volta
 *
 * Padrão oficial de passagem virtual do sistema.
 * Usado em: /admin/vendas (referência), /consultar-passagens, Confirmation e NewSaleModal.
 */

import { useState, useMemo } from 'react';
import { TicketCard, TicketCardData } from '@/components/public/TicketCard';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { User, ChevronDown, Armchair, ArrowLeftRight, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TransportPolicy } from '@/types/database';

// ── Types ──

interface PassengerTicketListProps {
  tickets: TicketCardData[];
  /** Callback para verificar status de pagamento (TicketLookup) */
  onRefreshStatus?: (saleId: string) => Promise<void>;
  /** Set de saleIds sendo verificados (TicketLookup) */
  isRefreshingSaleIds?: Set<string>;
  /** Permite download mesmo em status reservado (contexto admin) */
  allowReservedDownloads?: boolean;
  /** Ajustes visuais por contexto */
  context?: 'public' | 'admin';
}

interface PassengerGroup {
  cpfKey: string;
  name: string;
  cpfDisplay: string;
  transportPolicy: TransportPolicy;
  idaTicket: TicketCardData | null;
  voltaTicket: TicketCardData | null;
  hasRoundTrip: boolean;
  shouldRenderConsolidatedRoundTrip: boolean;
}

// ── Helpers ──

/** Detecta se o ticket é de volta pelo prefixo VOLTA- no seatLabel */
function isVoltaTicket(ticket: TicketCardData): boolean {
  return ticket.seatLabel.toUpperCase().startsWith('VOLTA-');
}

function isRoundTripMandatoryPolicy(policy?: TransportPolicy): boolean {
  return policy === 'ida_volta_obrigatorio';
}

/** Mascara CPF para exibição: ***.456.789-** */
function maskCpfDisplay(cpf: string): string {
  const digits = cpf.replace(/\D/g, '');
  if (digits.length !== 11) return cpf;
  return `***.${digits.slice(3, 6)}.${digits.slice(6, 9)}-**`;
}

/** Extrai label amigável do assento, removendo prefixo VOLTA- */
function friendlySeatLabel(ticket: TicketCardData): string {
  if (isVoltaTicket(ticket)) {
    const raw = ticket.seatLabel.replace(/^VOLTA-/i, '');
    // Se volta sem assento real (ex: VOLTA-1, VOLTA-SN), exibir "Retorno incluso"
    if (/^\d+$/.test(raw) || raw.toUpperCase() === 'SN') {
      return 'Retorno incluso';
    }
    return raw;
  }
  return ticket.seatLabel;
}

// ── Component ──

export function PassengerTicketList({
  tickets,
  onRefreshStatus,
  isRefreshingSaleIds,
  allowReservedDownloads = false,
  context = 'public',
}: PassengerTicketListProps) {
  // Nota de manutenção: `context` existe para ajustes mínimos de container/espaçamento
  // por tela, mas o template visual da passagem (card, bloco de passageiro e abas ida/volta)
  // permanece único e compartilhado entre admin e público.
  void context;

  // Agrupa tickets por CPF do passageiro
  const groups = useMemo<PassengerGroup[]>(() => {
    const map = new Map<string, {
      ida: TicketCardData | null;
      volta: TicketCardData | null;
      name: string;
      cpf: string;
      transportPolicy: TransportPolicy;
    }>();

    for (const ticket of tickets) {
      const cpfKey = ticket.passengerCpf.replace(/\D/g, '');
      const existing = map.get(cpfKey);

      if (!existing) {
        map.set(cpfKey, {
          ida: isVoltaTicket(ticket) ? null : ticket,
          volta: isVoltaTicket(ticket) ? ticket : null,
          name: ticket.passengerName,
          cpf: cpfKey,
          transportPolicy: ticket.eventTransportPolicy ?? 'trecho_independente',
        });
      } else {
        if (ticket.eventTransportPolicy) {
          existing.transportPolicy = ticket.eventTransportPolicy;
        }

        if (isVoltaTicket(ticket)) {
          existing.volta = ticket;
        } else {
          // Se já tem ida, pode ser um cenário de múltiplos trechos — mantém o primeiro
          if (!existing.ida) existing.ida = ticket;
        }
      }
    }

    return Array.from(map.entries()).map(([cpfKey, data]) => ({
      cpfKey,
      name: data.name,
      cpfDisplay: maskCpfDisplay(data.cpf),
      transportPolicy: data.transportPolicy,
      idaTicket: data.ida,
      voltaTicket: data.volta,
      hasRoundTrip: !!(data.ida && data.volta),
      // Regra de negócio: só consolidamos visualmente quando a política exige ida e volta.
      shouldRenderConsolidatedRoundTrip: !!(data.ida && data.volta && isRoundTripMandatoryPolicy(data.transportPolicy)),
    }));
  }, [tickets]);

  // Se só tem 1 passageiro e 1 ticket, mostra direto sem collapsible
  const isSingleSimple = groups.length === 1 && !groups[0].hasRoundTrip;

  if (tickets.length === 0) return null;

  return (
    <div className="space-y-3">
      {/* Resumo geral quando há múltiplos passageiros */}
      {groups.length > 1 && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <User className="h-4 w-4" />
          <span>
            {groups.length} passageiro{groups.length > 1 ? 's' : ''}
            {' · '}
            {tickets.length} passagem{tickets.length > 1 ? 'ns' : ''}
          </span>
        </div>
      )}

      {isSingleSimple ? (
        // Caso simples: 1 passageiro, somente ida — mostra TicketCard direto
        <TicketCard
          ticket={groups[0].idaTicket!}
          allowReservedDownloads={allowReservedDownloads}
          onRefreshStatus={onRefreshStatus}
          isRefreshing={!!(groups[0].idaTicket?.saleId && isRefreshingSaleIds?.has(groups[0].idaTicket.saleId))}
        />
      ) : (
        groups.map((group) => (
          <PassengerCollapsibleCard
            key={group.cpfKey}
            group={group}
            allowReservedDownloads={allowReservedDownloads}
            onRefreshStatus={onRefreshStatus}
            isRefreshingSaleIds={isRefreshingSaleIds}
            defaultOpen={groups.length === 1}
          />
        ))
      )}
    </div>
  );
}

// ── Collapsible Card por Passageiro ──

interface PassengerCollapsibleCardProps {
  group: PassengerGroup;
  allowReservedDownloads: boolean;
  onRefreshStatus?: (saleId: string) => Promise<void>;
  isRefreshingSaleIds?: Set<string>;
  defaultOpen?: boolean;
}

function PassengerCollapsibleCard({
  group,
  allowReservedDownloads,
  onRefreshStatus,
  isRefreshingSaleIds,
  defaultOpen = false,
}: PassengerCollapsibleCardProps) {
  const [open, setOpen] = useState(defaultOpen);

  // Determina o status a mostrar (prioriza ida)
  const displayTicket = group.idaTicket || group.voltaTicket;
  const saleStatus = displayTicket?.saleStatus;

  // Label do assento de ida
  const idaSeatDisplay = group.idaTicket ? friendlySeatLabel(group.idaTicket) : null;
  const voltaSeatDisplay = group.voltaTicket ? friendlySeatLabel(group.voltaTicket) : null;
  const isVoltaSeatPlaceholder = !!group.voltaTicket && voltaSeatDisplay === 'Retorno incluso';

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button
          className={cn(
            'w-full rounded-lg border bg-card p-4 text-left transition-colors',
            'hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            open && 'border-primary/30 bg-accent/30'
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
                <User className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0 space-y-0.5">
                <p className="font-semibold text-sm text-foreground truncate">
                  {group.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  CPF: {group.cpfDisplay}
                </p>
                <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground mt-1">
                  {idaSeatDisplay && (
                    <span className="inline-flex items-center gap-1">
                      <Armchair className="h-3 w-3" />
                      {idaSeatDisplay}
                    </span>
                  )}
                  {group.hasRoundTrip ? (
                    <span className="inline-flex items-center gap-1 text-primary font-medium">
                      <ArrowLeftRight className="h-3 w-3" />
                      Ida e Volta
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1">
                      <ArrowRight className="h-3 w-3" />
                      Somente Ida
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {saleStatus && <StatusBadge status={saleStatus} className="text-[10px]" />}
              <ChevronDown
                className={cn(
                  'h-4 w-4 text-muted-foreground transition-transform',
                  open && 'rotate-180'
                )}
              />
            </div>
          </div>
        </button>
      </CollapsibleTrigger>

      <CollapsibleContent className="mt-2">
        {group.shouldRenderConsolidatedRoundTrip ? (
          // Consolidação visual apenas para ida_volta_obrigatorio: mantém modelagem interna por trecho.
          group.idaTicket && group.voltaTicket && (
            <TicketCard
              ticket={group.idaTicket}
              consolidatedRoundTrip={{
                returnSeatLabel: voltaSeatDisplay ?? 'Retorno incluso',
                returnSeatIsPlaceholder: isVoltaSeatPlaceholder,
              }}
              allowReservedDownloads={allowReservedDownloads}
              onRefreshStatus={onRefreshStatus}
              isRefreshing={!!(group.idaTicket.saleId && isRefreshingSaleIds?.has(group.idaTicket.saleId))}
            />
          )
        ) : group.hasRoundTrip ? (
          // Preserva o mesmo padrão validado no admin: segmentação explícita de ida/volta com destaque do trecho ativo.
          <Tabs defaultValue="ida" className="w-full">
            <TabsList className="w-full">
              <TabsTrigger value="ida" className="flex-1">Ida</TabsTrigger>
              <TabsTrigger value="volta" className="flex-1">Volta</TabsTrigger>
            </TabsList>
            <TabsContent value="ida">
              {group.idaTicket && (
                <TicketCard
                  ticket={group.idaTicket}
                  allowReservedDownloads={allowReservedDownloads}
                  onRefreshStatus={onRefreshStatus}
                  isRefreshing={!!(group.idaTicket.saleId && isRefreshingSaleIds?.has(group.idaTicket.saleId))}
                />
              )}
            </TabsContent>
            <TabsContent value="volta">
              {group.voltaTicket && (
                <TicketCard
                  ticket={group.voltaTicket}
                  allowReservedDownloads={allowReservedDownloads}
                  onRefreshStatus={onRefreshStatus}
                  isRefreshing={!!(group.voltaTicket.saleId && isRefreshingSaleIds?.has(group.voltaTicket.saleId))}
                />
              )}
            </TabsContent>
          </Tabs>
        ) : (
          // Somente ida — renderiza TicketCard direto
          displayTicket && (
            <TicketCard
              ticket={displayTicket}
              allowReservedDownloads={allowReservedDownloads}
              onRefreshStatus={onRefreshStatus}
              isRefreshing={!!(displayTicket.saleId && isRefreshingSaleIds?.has(displayTicket.saleId))}
            />
          )
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
