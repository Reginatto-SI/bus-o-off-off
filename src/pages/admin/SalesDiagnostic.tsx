import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Sale, SaleLog, SaleStatus } from '@/types/database';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { PageHeader } from '@/components/admin/PageHeader';
import { FilterCard } from '@/components/admin/FilterCard';
import { ActionsDropdown, ActionItem } from '@/components/admin/ActionsDropdown';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  Activity,
  Eye,
  Loader2,
  Search,
  Calendar,
  Building2,
  CreditCard,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  Ticket,
  Webhook,
  Code,
  FileJson,
  Copy,
  RefreshCw,
  ExternalLink,
  ChevronDown,
} from 'lucide-react';
import { toast } from 'sonner';
import { format, formatDistanceToNowStrict, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { formatCurrencyBRL } from '@/lib/currency';
import { useAuth } from '@/contexts/AuthContext';
import { StatsCard } from '@/components/admin/StatsCard';
import { useRuntimePaymentEnvironment } from '@/hooks/use-runtime-payment-environment';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';

// ── Types ──
interface DiagnosticFilters {
  search: string;
  status: 'all' | SaleStatus;
  eventId: string;
  gateway: string;
  paymentStatus: string;
  dateFrom: string;
  dateTo: string;
}

const initialFilters: DiagnosticFilters = {
  search: '',
  status: 'all',
  eventId: 'all',
  gateway: 'all',
  paymentStatus: 'all',
  dateFrom: '',
  dateTo: '',
};

interface DiagnosticSale extends Omit<Sale, 'event'> {
  company_id: string;
  company?: { name: string } | null;
  event?: { name: string; date: string } | null;
  company_name?: string;
  event_name?: string;
  event_date?: string | null;
  ticket_count?: number;
  active_lock_count?: number;
  latest_lock_expires_at?: string | null;
}

type OperationalCategory = 'saudavel' | 'atencao' | 'divergencia' | 'pago' | 'cancelado';

interface SaleIntegrationLog {
  id: string;
  sale_id: string | null;
  company_id: string | null;
  provider: string;
  direction: string;
  event_type: string | null;
  payment_id: string | null;
  external_reference: string | null;
  http_status: number | null;
  processing_status: 'received' | 'ignored' | 'success' | 'partial_failure' | 'failed' | 'unauthorized' | 'warning' | 'rejected' | 'duplicate';
  result_category?: string | null;
  incident_code?: string | null;
  warning_code?: string | null;
  message: string;
  payload_json: Record<string, unknown> | null;
  response_json: Record<string, unknown> | null;
  payment_environment: 'sandbox' | 'production' | null;
  environment_decision_source: 'sale' | 'request' | 'host' | null;
  environment_host_detected: string | null;
  created_at: string;
}

interface WebhookDedupEntry {
  asaas_event_id: string;
  sale_id: string | null;
  external_reference: string | null;
  payment_environment: 'sandbox' | 'production' | null;
  duplicate_count: number;
  first_received_at: string;
  last_seen_at: string;
}

type TechnicalDiagnosticStatus = 'ok' | 'attention' | 'critical';

interface TechnicalDiagnosticSnapshot {
  companyId: string;
  companyName: string;
  paymentEnvironment: 'sandbox' | 'production';
  executedAt: string;
}

interface TechnicalDivergence {
  id: string;
  title: string;
  severity: 'attention' | 'critical';
  detail: string;
  saleId?: string | null;
}

const EMPTY_UUID_FILTER = '00000000-0000-0000-0000-000000000000';
const EXACT_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function buildCreatedAtBoundary(dateInput: string, endOfDay: boolean): string {
  const [year, month, day] = dateInput.split('-').map(Number);

  if (!year || !month || !day) {
    throw new Error(`Data inválida para filtro: ${dateInput}`);
  }

  // Correção crítica: `new Date('YYYY-MM-DD')` interpreta a string em UTC e depois `setHours`
  // atua no fuso local, truncando o dia em navegadores UTC-03. Montamos a data com componentes
  // locais para que o intervalo represente exatamente o dia operacional visto pelo usuário.
  return endOfDay
    ? new Date(year, month - 1, day, 23, 59, 59, 999).toISOString()
    : new Date(year, month - 1, day, 0, 0, 0, 0).toISOString();
}

function isExactUuid(value: string): boolean {
  return EXACT_UUID_PATTERN.test(value);
}

function formatPaymentEnvironmentLabel(value?: string | null): string {
  return value === 'production' ? 'Produção' : 'Sandbox';
}

function formatTechnicalDiagnosticStatusLabel(status: TechnicalDiagnosticStatus): string {
  if (status === 'critical') return 'Crítico';
  if (status === 'attention') return 'Atenção';
  return 'OK';
}

function formatTechnicalDiagnosticStatusTone(status: TechnicalDiagnosticStatus): string {
  if (status === 'critical') return 'text-destructive';
  if (status === 'attention') return 'text-amber-600';
  return 'text-emerald-600';
}

function formatCompactDurationFromNow(targetDate: string): string {
  const diffMs = new Date(targetDate).getTime() - Date.now();
  const absMs = Math.abs(diffMs);
  const absMinutes = Math.max(Math.round(absMs / 60000), 0);

  let value = absMinutes;
  let unit = 'min';

  if (absMinutes >= 60 * 24) {
    value = Math.round(absMinutes / (60 * 24));
    unit = value === 1 ? 'dia' : 'dias';
  } else if (absMinutes >= 60) {
    value = Math.round(absMinutes / 60);
    unit = 'h';
  }

  if (value <= 0) return 'agora';
  return diffMs >= 0 ? `em ${value} ${unit}` : `há ${value} ${unit}`;
}

function formatCreatedAtLabel(createdAt: string): string {
  return `Criada ${formatCompactDurationFromNow(createdAt)}`;
}

function formatHumanRelativeWithDirection(targetDate: string): string {
  const target = new Date(targetDate);
  const now = new Date();
  const isFuture = target.getTime() > now.getTime();
  const distance = formatDistanceToNowStrict(target, { locale: ptBR, addSuffix: false });
  return isFuture ? `vence em ${distance}` : `venceu há ${distance}`;
}

function getSaleStatusLabel(status: SaleStatus): string {
  const labels: Record<SaleStatus, string> = {
    pendente_pagamento: 'Pendente de pagamento',
    reservado: 'Reservado',
    pago: 'Pago',
    cancelado: 'Cancelado',
    bloqueado: 'Bloqueado',
  };
  return labels[status] ?? status;
}

function isManualReservationFlow(sale: DiagnosticSale): boolean {
  // Reservas em `reservado` só são tratadas como fluxo administrativo legítimo quando a venda
  // carrega a validade própria (`reservation_expires_at`) e não depende do lock curto do checkout.
  // Isso evita que a UI chame de erro um caso saudável do administrativo.
  return sale.status === 'reservado' && !!sale.reservation_expires_at;
}

function buildOperationalTimeView(sale: DiagnosticSale, lockStatus: LockStatusView): {
  label: string;
  detail: string;
  sourceLabel: string;
} {
  // A tela usa a fonte de verdade real de cada fluxo: checkout público lê `seat_locks.expires_at`;
  // reserva manual lê `reservation_expires_at`. Nunca inferimos vencimento por `created_at`,
  // porque isso mentiria para o operador e reintroduziria a ambiguidade que o backend já corrigiu.
  if (sale.status === 'pendente_pagamento' && lockStatus.expiresAt) {
    return {
      label: formatHumanRelativeWithDirection(lockStatus.expiresAt),
      detail: `Bloqueio temporário do checkout público · ${format(parseISO(lockStatus.expiresAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`,
      sourceLabel: 'Fonte: bloqueio temporário do checkout',
    };
  }

  if (isManualReservationFlow(sale) && sale.reservation_expires_at) {
    return {
      label: formatHumanRelativeWithDirection(sale.reservation_expires_at),
      detail: `Validade da reserva manual · ${format(parseISO(sale.reservation_expires_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`,
      sourceLabel: 'Fonte: validade própria da reserva manual',
    };
  }

  return {
    label: formatCreatedAtLabel(sale.created_at),
    detail: `Criada em ${format(parseISO(sale.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`,
    sourceLabel: 'Fonte: data de criação da venda',
  };
}

interface PaymentStatusView {
  label: string;
  detail?: string;
  variant: 'default' | 'secondary' | 'destructive' | 'outline';
}

interface LockStatusView {
  label: string;
  detail?: string;
  variant: 'default' | 'secondary' | 'destructive' | 'outline';
  isActive: boolean;
  isExpired: boolean;
  isMissing: boolean;
  isPartial: boolean;
  expiresAt: string | null;
}

type OperationalPriority = 'critico' | 'atencao' | 'ok';
type MonitoringFreshness = 'novo' | 'recente' | 'estavel';
type QuickFocusFilter = 'todos' | 'criticos' | 'novos' | 'acompanhamento' | 'ok';

interface DiagnosticOperationalView {
  category: OperationalCategory;
  categoryLabel: string;
  categoryVariant: 'default' | 'secondary' | 'destructive' | 'outline';
  categoryClassName?: string;
  priority: number;
  operationalPriority: OperationalPriority;
  saleStatusLabel: string;
  paymentStatusLabel: string;
  operationalLabel: string;
  operationalDetail: string;
  causeLabel: string;
  actionLabel: string;
  timeLabel: string;
  timeDetail: string;
  timeSourceLabel: string;
  lockLabel: string;
  lockVariant: 'default' | 'secondary' | 'destructive' | 'outline';
  hasGatewayDivergence: boolean;
}


function computeOperationalPriority(view: Pick<DiagnosticOperationalView, 'category' | 'hasGatewayDivergence'>): OperationalPriority {
  // A prioridade operacional é derivada apenas de sinais já calculados pela própria tela.
  // Não cria regra paralela de negócio: apenas traduz a leitura existente para triagem explícita,
  // mantendo o diagnóstico previsível, auditável e igual em sandbox/produção.
  if (view.category === 'divergencia' || view.hasGatewayDivergence) return 'critico';
  if (view.category === 'atencao') return 'atencao';
  return 'ok';
}

function getOperationalPriorityPresentation(priority: OperationalPriority): {
  label: string;
  actionLabel: string;
  actionDescription: string;
} {
  if (priority === 'critico') {
    return {
      label: 'Crítico',
      actionLabel: 'Revisar agora',
      actionDescription: 'Exige ação imediata.',
    };
  }

  if (priority === 'atencao') {
    return {
      label: 'Atenção',
      actionLabel: 'Acompanhar',
      actionDescription: 'Exige acompanhamento operacional.',
    };
  }

  return {
    label: 'OK',
    actionLabel: 'Sem ação',
    actionDescription: 'Sem necessidade de intervenção.',
  };
}

function getOperationalHeadlineLabel(view: DiagnosticOperationalView): string {
  if (view.operationalPriority === 'critico') return 'Venda com divergência';
  if (view.operationalPriority === 'atencao') return 'Venda em acompanhamento';

  if (view.category === 'cancelado') return 'Venda cancelada corretamente';
  if (view.category === 'pago') return 'Pagamento confirmado com sucesso';
  return 'Fluxo estável';
}

function computeMonitoringFreshness(sale: DiagnosticSale, isNewInSession: boolean): MonitoringFreshness {
  // "Novo" e "recente" não significam a mesma coisa:
  // - novo = item percebido pela sessão atual depois de um refresh desta tela;
  // - recente = item criado há pouco tempo, mesmo que já estivesse visível antes.
  // Isso mantém a leitura auditável e evita chamar de novidade algo que é apenas recente por data.
  if (isNewInSession) return 'novo';

  const createdAtMs = new Date(sale.created_at).getTime();
  const recentWindowMs = 1000 * 60 * 60 * 2;
  return Date.now() - createdAtMs <= recentWindowMs ? 'recente' : 'estavel';
}

function getMonitoringFreshnessPresentation(freshness: MonitoringFreshness): {
  label: string;
  description: string;
} {
  if (freshness === 'novo') {
    return {
      label: 'Novo nesta sessão',
      description: 'Entrou no monitoramento após atualização desta sessão.',
    };
  }

  if (freshness === 'recente') {
    return {
      label: 'Recente no monitoramento',
      description: 'Venda criada há pouco tempo dentro da janela operacional.',
    };
  }

  return {
    label: 'Sem mudança recente',
    description: 'Nenhum sinal recente adicional percebido nesta sessão.',
  };
}

function computeGateway(sale: DiagnosticSale): string {
  if (sale.asaas_payment_id) return 'Asaas';
  if (sale.sale_origin === 'admin_manual' || sale.sale_origin === 'seller_manual') return 'Manual';
  return 'Manual';
}

function getGatewayDisplayLabel(gateway: string): string {
  return gateway;
}

function computeLockStatus(sale: DiagnosticSale): LockStatusView {
  const gateway = computeGateway(sale);
  const expiresAt = sale.latest_lock_expires_at ?? null;
  const activeLockCount = sale.active_lock_count ?? 0;
  const expiresAtMs = expiresAt ? new Date(expiresAt).getTime() : null;
  const isExpired = expiresAtMs !== null && expiresAtMs <= Date.now();
  const isActive = activeLockCount > 0 && expiresAtMs !== null && expiresAtMs > Date.now();
  const isPartial = activeLockCount > 0 && activeLockCount < Math.max(sale.quantity, 1);
  const isMissing = activeLockCount <= 0 && !isExpired;

  // Traduzimos a linguagem técnica de lock para linguagem operacional. O operador não precisa ler
  // “lock ausente”; ele precisa entender se existe ou não um bloqueio temporário relevante para o checkout.
  if (gateway === 'Manual' && isManualReservationFlow(sale) && !expiresAt) {
    return {
      label: 'Sem bloqueio temporário',
      detail: 'Reserva manual legítima: o bloqueio curto do checkout não se aplica a este caso.',
      variant: 'outline',
      isActive: false,
      isExpired: false,
      isMissing: false,
      isPartial: false,
      expiresAt,
    };
  }

  if (isActive) {
    return {
      label: isPartial ? 'Bloqueio temporário parcial' : 'Bloqueio temporário ativo',
      detail: `Expira ${formatHumanRelativeWithDirection(expiresAt!)}`,
      variant: isPartial ? 'secondary' : 'default',
      isActive: true,
      isExpired: false,
      isMissing: false,
      isPartial,
      expiresAt,
    };
  }

  if (isExpired) {
    return {
      label: 'Bloqueio temporário expirado',
      detail: formatHumanRelativeWithDirection(expiresAt!),
      variant: 'destructive',
      isActive: false,
      isExpired: true,
      isMissing: false,
      isPartial: false,
      expiresAt,
    };
  }

  return {
    label: 'Sem bloqueio temporário',
    detail: 'Nenhum bloqueio temporário ativo foi encontrado para esta venda.',
    variant: 'outline',
    isActive: false,
    isExpired: false,
    isMissing: true,
    isPartial: false,
    expiresAt,
  };
}

function computePaymentStatus(sale: DiagnosticSale): PaymentStatusView {
  const gateway = computeGateway(sale);
  const asaasStatus = sale.asaas_payment_status;

  // A tela separa status da venda e status do pagamento porque o operador precisa distinguir
  // pendência comercial legítima de divergência técnica com o gateway. Misturar os dois conceitos
  // faria `reservado` parecer erro mesmo quando a operação manual ainda está saudável.
  if (asaasStatus === 'RECEIVED' || asaasStatus === 'CONFIRMED') {
    return { label: 'Pagamento confirmado', detail: `Retorno do Asaas: ${asaasStatus}`, variant: 'default' };
  }
  if (asaasStatus === 'PENDING') {
    return { label: 'Pagamento aguardando confirmação', detail: 'Cobrança criada no gateway e ainda em aberto.', variant: 'secondary' };
  }
  if (asaasStatus === 'OVERDUE' || asaasStatus === 'EXPIRED') {
    return { label: 'Pagamento expirado', detail: `Retorno do Asaas: ${asaasStatus}`, variant: 'destructive' };
  }
  if (asaasStatus === 'REFUNDED' || asaasStatus === 'REFUND_REQUESTED') {
    return { label: 'Pagamento estornado', detail: `Retorno do Asaas: ${asaasStatus}`, variant: 'destructive' };
  }
  if (asaasStatus === 'CANCELLED') {
    return { label: 'Pagamento cancelado', detail: 'Cobrança cancelada no gateway.', variant: 'destructive' };
  }

  if (gateway === 'Manual') {
    if (sale.status === 'pago') return { label: 'Pagamento confirmado manualmente', detail: 'Venda manual sem cobrança em gateway.', variant: 'default' };
    if (sale.status === 'cancelado') return { label: 'Sem pagamento ativo', detail: 'Venda manual cancelada.', variant: 'outline' };
    if (sale.status === 'reservado') return { label: 'Pagamento aguardando confirmação manual', detail: 'Reserva administrativa aguardando baixa manual.', variant: 'secondary' };
  }

  if (sale.asaas_payment_id) {
    return { label: 'Pagamento em processamento', detail: 'Cobrança enviada ao gateway sem retorno final.', variant: 'secondary' };
  }

  if (sale.status === 'pago') return { label: 'Pagamento confirmado', variant: 'default' };
  if (sale.status === 'cancelado') return { label: 'Sem pagamento ativo', variant: 'outline' };
  return { label: 'Sem dados suficientes de pagamento', detail: 'Não há gateway nem confirmação manual registrada.', variant: 'outline' };
}

function computeOperationalView(sale: DiagnosticSale): DiagnosticOperationalView {
  const gateway = computeGateway(sale);
  const paymentStatus = computePaymentStatus(sale);
  const lockStatus = computeLockStatus(sale);
  const timeView = buildOperationalTimeView(sale, lockStatus);
  const isPendingCheckout = sale.status === 'pendente_pagamento';
  const isReserved = sale.status === 'reservado';
  const isManualReservation = isManualReservationFlow(sale);
  const manualReservationExpired = isManualReservation && !!sale.reservation_expires_at && new Date(sale.reservation_expires_at).getTime() <= Date.now();
  const asaasPaid = sale.asaas_payment_status === 'RECEIVED' || sale.asaas_payment_status === 'CONFIRMED';
  const hasGatewayDivergence = ((isPendingCheckout || isReserved) && asaasPaid) || (sale.status === 'cancelado' && asaasPaid);

  // Helper local para evitar repetição: calcula operationalPriority a partir do resultado parcial.
  const withPriority = (base: Omit<DiagnosticOperationalView, 'operationalPriority'>): DiagnosticOperationalView => ({
    ...base,
    operationalPriority: computeOperationalPriority(base),
  });

  // A causa principal é mutuamente exclusiva: a função retorna no primeiro cenário dominante.
  // Isso evita que a linha traga duas narrativas conflitantes e preserva uma leitura operacional confiável.
  if (sale.status === 'pago') {
    return withPriority({
      category: 'pago',
      categoryLabel: 'Pago',
      categoryVariant: 'default',
      priority: 4,
      saleStatusLabel: getSaleStatusLabel(sale.status),
      paymentStatusLabel: paymentStatus.label,
      operationalLabel: 'Venda concluída',
      operationalDetail: 'Venda paga e sem alerta operacional prioritário.',
      causeLabel: 'Pagamento confirmado e venda já regularizada no sistema.',
      actionLabel: 'Sem ação.',
      timeLabel: timeView.label,
      timeDetail: timeView.detail,
      timeSourceLabel: timeView.sourceLabel,
      lockLabel: lockStatus.label,
      lockVariant: lockStatus.variant,
      hasGatewayDivergence,
    });
  }

  if (sale.status === 'cancelado') {
    const cancelledByExpiry = (sale.cancel_reason ?? '').toLowerCase().includes('expir');
    return withPriority({
      category: 'cancelado',
      categoryLabel: 'Cancelado',
      categoryVariant: 'outline',
      categoryClassName: 'border-zinc-400 text-zinc-700',
      priority: hasGatewayDivergence ? 1 : 5,
      saleStatusLabel: getSaleStatusLabel(sale.status),
      paymentStatusLabel: paymentStatus.label,
      operationalLabel: hasGatewayDivergence ? 'Cancelamento com divergência' : 'Venda encerrada',
      operationalDetail: hasGatewayDivergence
        ? 'O gateway indica pagamento, mas a venda foi cancelada no banco.'
        : 'Cancelamento registrado e fluxo encerrado.',
      causeLabel: hasGatewayDivergence
        ? 'Divergência entre gateway e banco.'
        : cancelledByExpiry
          ? 'Venda cancelada corretamente após expiração automática.'
          : (sale.cancel_reason ?? 'Cancelamento registrado no sistema.'),
      actionLabel: hasGatewayDivergence ? 'Investigar conciliação.' : 'Sem ação.',
      timeLabel: timeView.label,
      timeDetail: timeView.detail,
      timeSourceLabel: timeView.sourceLabel,
      lockLabel: lockStatus.label,
      lockVariant: lockStatus.variant,
      hasGatewayDivergence,
    });
  }

  if (hasGatewayDivergence) {
    return withPriority({
      category: 'divergencia',
      categoryLabel: 'Divergência',
      categoryVariant: 'destructive',
      priority: 1,
      saleStatusLabel: getSaleStatusLabel(sale.status),
      paymentStatusLabel: paymentStatus.label,
      operationalLabel: 'Pagamento confirmado, venda pendente',
      operationalDetail: 'O gateway já confirmou o pagamento, mas o banco ainda não refletiu a conciliação final.',
      causeLabel: 'Pagamento confirmado, venda pendente de conciliação.',
      actionLabel: 'Investigar conciliação.',
      timeLabel: timeView.label,
      timeDetail: timeView.detail,
      timeSourceLabel: timeView.sourceLabel,
      lockLabel: lockStatus.label,
      lockVariant: lockStatus.variant,
      hasGatewayDivergence: true,
    });
  }

  if (paymentStatus.label === 'Pagamento expirado' || paymentStatus.label === 'Pagamento cancelado' || paymentStatus.label === 'Pagamento estornado') {
    return withPriority({
      category: 'divergencia',
      categoryLabel: 'Divergência',
      categoryVariant: 'destructive',
      priority: 1,
      saleStatusLabel: getSaleStatusLabel(sale.status),
      paymentStatusLabel: paymentStatus.label,
      operationalLabel: 'Pagamento com retorno final incompatível',
      operationalDetail: 'O gateway já encerrou a cobrança, mas a venda ainda precisa ser revisada no banco.',
      causeLabel: paymentStatus.detail ?? 'Retorno final do gateway exige revisão operacional.',
      actionLabel: 'Revisar manualmente.',
      timeLabel: timeView.label,
      timeDetail: timeView.detail,
      timeSourceLabel: timeView.sourceLabel,
      lockLabel: lockStatus.label,
      lockVariant: lockStatus.variant,
      hasGatewayDivergence: false,
    });
  }

  if (isPendingCheckout) {
    if (lockStatus.isExpired) {
      return withPriority({
        category: 'divergencia',
        categoryLabel: 'Divergência',
        categoryVariant: 'destructive',
        priority: 1,
        saleStatusLabel: getSaleStatusLabel(sale.status),
        paymentStatusLabel: paymentStatus.label,
        operationalLabel: 'Checkout aguardando limpeza',
        operationalDetail: 'O bloqueio temporário já expirou, mas a venda ainda não foi encerrada pelo cleanup.',
        causeLabel: 'Checkout expirado e aguardando limpeza.',
        actionLabel: 'Acompanhar cleanup automático.',
        timeLabel: timeView.label,
        timeDetail: timeView.detail,
        timeSourceLabel: timeView.sourceLabel,
        lockLabel: lockStatus.label,
        lockVariant: lockStatus.variant,
        hasGatewayDivergence: false,
      });
    }

    // Rebaixamento controlado de severidade:
    // Para checkout público ainda pendente no gateway (PENDING/AWAITING_RISK_ANALYSIS),
    // sem ticket emitido, sem lock ativo e sem reserva manual, a ausência de lock
    // não indica bloqueio operacional atual. Nesses casos exibimos acompanhamento
    // em vez de divergência crítica para reduzir falso positivo sem mascarar falha real.
    const isPendingGatewayWithoutOperationalImpact =
      sale.sale_origin === 'online_checkout'
      && sale.status === 'pendente_pagamento'
      && (sale.asaas_payment_status === 'PENDING' || sale.asaas_payment_status === 'AWAITING_RISK_ANALYSIS')
      && (sale.ticket_count ?? 0) === 0
      && (sale.active_lock_count ?? 0) === 0
      && !sale.reservation_expires_at;

    if (lockStatus.isMissing && isPendingGatewayWithoutOperationalImpact) {
      return withPriority({
        category: 'atencao',
        categoryLabel: 'Atenção',
        categoryVariant: 'secondary',
        priority: 2,
        saleStatusLabel: getSaleStatusLabel(sale.status),
        paymentStatusLabel: paymentStatus.label,
        operationalLabel: 'Pendência financeira sem lock ativo',
        operationalDetail: 'Checkout público ainda pendente no gateway, sem bloqueio operacional ativo no momento.',
        causeLabel: 'Pagamento aguardando confirmação com assento atualmente livre no mapa operacional.',
        actionLabel: 'Acompanhar.',
        timeLabel: timeView.label,
        timeDetail: timeView.detail,
        timeSourceLabel: timeView.sourceLabel,
        lockLabel: lockStatus.label,
        lockVariant: lockStatus.variant,
        hasGatewayDivergence: false,
      });
    }

    if (lockStatus.isMissing) {
      return withPriority({
        category: 'divergencia',
        categoryLabel: 'Divergência',
        categoryVariant: 'destructive',
        priority: 1,
        saleStatusLabel: getSaleStatusLabel(sale.status),
        paymentStatusLabel: paymentStatus.label,
        operationalLabel: 'Checkout sem bloqueio temporário',
        operationalDetail: 'Venda do checkout público sem a proteção operacional esperada de seat_locks.',
        causeLabel: 'Sem dados suficientes do bloqueio temporário do checkout.',
        actionLabel: 'Revisar manualmente.',
        timeLabel: timeView.label,
        timeDetail: timeView.detail,
        timeSourceLabel: timeView.sourceLabel,
        lockLabel: lockStatus.label,
        lockVariant: lockStatus.variant,
        hasGatewayDivergence: false,
      });
    }

    if (lockStatus.isPartial) {
      return withPriority({
        category: 'atencao',
        categoryLabel: 'Atenção',
        categoryVariant: 'secondary',
        priority: 2,
        saleStatusLabel: getSaleStatusLabel(sale.status),
        paymentStatusLabel: paymentStatus.label,
        operationalLabel: 'Checkout em acompanhamento',
        operationalDetail: 'Há bloqueio temporário ativo, mas nem todos os assentos esperados aparecem protegidos.',
        causeLabel: 'Checkout aguardando pagamento com bloqueio temporário parcial.',
        actionLabel: 'Acompanhar.',
        timeLabel: timeView.label,
        timeDetail: timeView.detail,
        timeSourceLabel: timeView.sourceLabel,
        lockLabel: lockStatus.label,
        lockVariant: lockStatus.variant,
        hasGatewayDivergence: false,
      });
    }

    return withPriority({
      category: 'saudavel',
      categoryLabel: 'Saudável',
      categoryVariant: 'default',
      priority: 3,
      saleStatusLabel: getSaleStatusLabel(sale.status),
      paymentStatusLabel: paymentStatus.label,
      operationalLabel: 'Checkout dentro do prazo',
      operationalDetail: 'Fluxo público aguardando pagamento com bloqueio temporário ativo.',
      causeLabel: 'Checkout aguardando pagamento dentro do prazo.',
      actionLabel: 'Sem ação.',
      timeLabel: timeView.label,
      timeDetail: timeView.detail,
      timeSourceLabel: timeView.sourceLabel,
      lockLabel: lockStatus.label,
      lockVariant: lockStatus.variant,
      hasGatewayDivergence: false,
    });
  }

  if (isReserved) {
    // Reservas manuais em `reservado` não devem aparecer como falha por padrão.
    // Aqui só elevamos o caso para atenção ou divergência quando a validade própria venceu
    // ou quando surgem sinais concretos de inconsistência entre pagamento e banco.
    if (isManualReservation) {
      if (manualReservationExpired) {
        return withPriority({
          category: 'divergencia',
          categoryLabel: 'Divergência',
          categoryVariant: 'destructive',
          priority: 1,
          saleStatusLabel: getSaleStatusLabel(sale.status),
          paymentStatusLabel: paymentStatus.label,
          operationalLabel: 'Reserva manual vencida',
          operationalDetail: 'A reserva administrativa ultrapassou a validade própria configurada.',
          causeLabel: 'Reserva manual vencida.',
          actionLabel: 'Reserva vencida, validar liberação.',
          timeLabel: timeView.label,
          timeDetail: timeView.detail,
          timeSourceLabel: timeView.sourceLabel,
          lockLabel: lockStatus.label,
          lockVariant: lockStatus.variant,
          hasGatewayDivergence: false,
        });
      }

      return withPriority({
        category: 'saudavel',
        categoryLabel: 'Saudável',
        categoryVariant: 'default',
        priority: 3,
        saleStatusLabel: getSaleStatusLabel(sale.status),
        paymentStatusLabel: paymentStatus.label,
        operationalLabel: 'Reserva manual válida',
        operationalDetail: 'Reserva administrativa legítima, ainda dentro do prazo e sem indício de falha automática.',
        causeLabel: 'Reserva manual válida.',
        actionLabel: 'Acompanhar.',
        timeLabel: timeView.label,
        timeDetail: timeView.detail,
        timeSourceLabel: timeView.sourceLabel,
        lockLabel: lockStatus.label,
        lockVariant: lockStatus.variant,
        hasGatewayDivergence: false,
      });
    }

    if (lockStatus.isExpired) {
      return withPriority({
        category: 'divergencia',
        categoryLabel: 'Divergência',
        categoryVariant: 'destructive',
        priority: 1,
        saleStatusLabel: getSaleStatusLabel(sale.status),
        paymentStatusLabel: paymentStatus.label,
        operationalLabel: 'Reserva com bloqueio expirado',
        operationalDetail: 'A venda segue reservada, mas o bloqueio temporário do checkout já expirou.',
        causeLabel: 'Checkout expirado e aguardando limpeza.',
        actionLabel: 'Revisar manualmente.',
        timeLabel: timeView.label,
        timeDetail: timeView.detail,
        timeSourceLabel: timeView.sourceLabel,
        lockLabel: lockStatus.label,
        lockVariant: lockStatus.variant,
        hasGatewayDivergence: false,
      });
    }

    if (lockStatus.isMissing) {
      return withPriority({
        category: 'atencao',
        categoryLabel: 'Atenção',
        categoryVariant: 'secondary',
        priority: 2,
        saleStatusLabel: getSaleStatusLabel(sale.status),
        paymentStatusLabel: paymentStatus.label,
        operationalLabel: 'Reserva sem evidência operacional suficiente',
        operationalDetail: 'A venda está reservada, mas falta o dado que sustentaria a leitura automática do checkout.',
        causeLabel: 'Sem dados suficientes para diagnóstico.',
        actionLabel: 'Revisar manualmente.',
        timeLabel: timeView.label,
        timeDetail: timeView.detail,
        timeSourceLabel: timeView.sourceLabel,
        lockLabel: lockStatus.label,
        lockVariant: lockStatus.variant,
        hasGatewayDivergence: false,
      });
    }

    return withPriority({
      category: 'atencao',
      categoryLabel: 'Atenção',
      categoryVariant: 'secondary',
      priority: 2,
      saleStatusLabel: getSaleStatusLabel(sale.status),
      paymentStatusLabel: paymentStatus.label,
      operationalLabel: 'Reserva em acompanhamento',
      operationalDetail: 'Há reserva ativa sem confirmação final de pagamento.',
      causeLabel: 'Pagamento aguardando confirmação.',
      actionLabel: 'Acompanhar.',
      timeLabel: timeView.label,
      timeDetail: timeView.detail,
      timeSourceLabel: timeView.sourceLabel,
      lockLabel: lockStatus.label,
      lockVariant: lockStatus.variant,
      hasGatewayDivergence: false,
    });
  }

  return withPriority({
    category: 'atencao',
    categoryLabel: 'Atenção',
    categoryVariant: 'secondary',
    priority: 3,
    saleStatusLabel: getSaleStatusLabel(sale.status),
    paymentStatusLabel: paymentStatus.label,
    operationalLabel: 'Leitura operacional complementar necessária',
    operationalDetail: 'A combinação atual não entra nas regras principais do painel.',
    causeLabel: 'Sem dados suficientes para diagnóstico.',
    actionLabel: 'Revisar manualmente.',
    timeLabel: timeView.label,
    timeDetail: timeView.detail,
    timeSourceLabel: timeView.sourceLabel,
    lockLabel: lockStatus.label,
    lockVariant: lockStatus.variant,
    hasGatewayDivergence: false,
  });
}

function computeFlowStage(sale: DiagnosticSale): { label: string; icon: typeof CheckCircle; color: string } {
  const gateway = computeGateway(sale);

  if (sale.status === 'cancelado') {
    return { label: 'Cancelado', icon: XCircle, color: 'text-destructive' };
  }

  if (gateway === 'Manual') {
    if (sale.status === 'pago' && (sale.ticket_count ?? 0) > 0) {
      return { label: 'Passagem gerada', icon: Ticket, color: 'text-emerald-600' };
    }
    if (sale.status === 'pago') {
      return { label: 'Venda manual paga', icon: CheckCircle, color: 'text-emerald-600' };
    }
    return { label: 'Venda manual criada', icon: Clock, color: 'text-amber-600' };
  }

  if (sale.status === 'pago' && (sale.ticket_count ?? 0) > 0) {
    return { label: 'Passagem gerada', icon: Ticket, color: 'text-emerald-600' };
  }
  if (sale.status === 'pago') {
    return { label: 'Pagamento confirmado', icon: CheckCircle, color: 'text-emerald-600' };
  }
  if (sale.asaas_payment_id) {
    const asaasStatus = sale.asaas_payment_status;
    if (asaasStatus === 'OVERDUE') return { label: 'Cobrança expirada', icon: AlertTriangle, color: 'text-destructive' };
    return { label: 'Cobrança enviada ao gateway', icon: CreditCard, color: 'text-blue-600' };
  }

  return { label: 'Venda criada', icon: Clock, color: 'text-muted-foreground' };
}

function computeCompactFlowLabel(fullLabel: string): string {
  const compactLabels: Record<string, string> = {
    'Cobrança enviada ao gateway': 'Cobrança enviada',
    'Pagamento confirmado': 'Pagamento confirmado',
    'Passagem gerada': 'Passagem gerada',
    'Venda manual paga': 'Venda manual paga',
    'Venda manual criada': 'Venda manual criada',
    'Cobrança expirada': 'Cobrança expirada',
    'Venda criada': 'Venda criada',
    'Cancelado': 'Cancelado',
  };

  return compactLabels[fullLabel] ?? fullLabel;
}
// ── Timeline builder ──
interface TimelineEntry {
  time: string;
  label: string;
  icon: typeof CheckCircle;
  color: string;
}

type PaymentConfirmationSource = 'webhook' | 'on_demand' | 'none';
type WebhookDiagnosticState = 'webhook_detected' | 'fallback_without_webhook' | 'not_identified';

function detectPaymentConfirmationSource(
  sale: DiagnosticSale,
  saleLogs: SaleLog[],
  integrationLogs: SaleIntegrationLog[]
): PaymentConfirmationSource {
  // Regra de diagnóstico: se houve webhook Asaas recebido para a venda, ele tem prioridade como origem.
  const hasWebhookLog = integrationLogs.some((log) => log.direction === 'incoming_webhook' && log.provider === 'asaas');
  if (hasWebhookLog) return 'webhook';

  // Sem webhook técnico, tentamos identificar confirmação por verificação on-demand via trilha funcional.
  const hasOnDemandConfirmation = saleLogs.some((log) => (
    log.action === 'payment_confirmed' &&
    log.description.toLowerCase().includes('verify-payment-status')
  ));

  if (hasOnDemandConfirmation || (sale.status === 'pago' && sale.asaas_payment_status === 'CONFIRMED')) {
    return 'on_demand';
  }

  return 'none';
}

function buildTimeline(sale: DiagnosticSale, logs: SaleLog[]): TimelineEntry[] {
  const entries: TimelineEntry[] = [];
  const lockStatus = computeLockStatus(sale);
  const operationalView = computeOperationalView(sale);

  // 1. Sale created
  entries.push({
    time: format(parseISO(sale.created_at), 'HH:mm:ss', { locale: ptBR }),
    label: 'Venda criada',
    icon: Clock,
    color: 'text-muted-foreground',
  });

  // 2. Gateway charge sent
  const gateway = computeGateway(sale);
  if (gateway !== 'Manual' && sale.asaas_payment_id) {
    entries.push({
      time: format(parseISO(sale.created_at), 'HH:mm:ss', { locale: ptBR }),
      label: `Cobrança enviada ao ${getGatewayDisplayLabel(gateway)}`,
      icon: CreditCard,
      color: 'text-blue-600',
    });
  }

  // 3. Operational lock state
  // Esta timeline é derivada da leitura atual da tela; não promete auditoria histórica completa.
  // Ela apenas organiza marcos inferíveis com honestidade a partir do snapshot atual da venda.
  entries.push({
    time: format(parseISO(sale.updated_at), 'HH:mm:ss', { locale: ptBR }),
    label: lockStatus.label,
    icon: lockStatus.isExpired ? AlertTriangle : lockStatus.isMissing ? XCircle : CheckCircle,
    color: lockStatus.isExpired || lockStatus.isMissing ? 'text-amber-600' : 'text-blue-600',
  });

  // 3. Logs
  logs
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .forEach((log) => {
      entries.push({
        time: format(parseISO(log.created_at), 'HH:mm:ss', { locale: ptBR }),
        label: log.description,
        icon: log.action === 'cancel' ? XCircle : Activity,
        color: log.action === 'cancel' ? 'text-destructive' : 'text-muted-foreground',
      });
    });

  // 4. Payment confirmed
  if (sale.status === 'pago') {
    entries.push({
      time: format(parseISO(sale.updated_at), 'HH:mm:ss', { locale: ptBR }),
      label: 'Venda atualizada para pago',
      icon: CheckCircle,
      color: 'text-emerald-600',
    });
  }

  // 5. Tickets generated
  if ((sale.ticket_count ?? 0) > 0) {
    entries.push({
      time: format(parseISO(sale.updated_at), 'HH:mm:ss', { locale: ptBR }),
      label: `${sale.ticket_count} passagem(ns) gerada(s)`,
      icon: Ticket,
      color: 'text-emerald-600',
    });
  }

  // 6. Cancelled
  if (sale.status === 'cancelado' && sale.cancelled_at) {
    entries.push({
      time: format(parseISO(sale.cancelled_at), 'HH:mm:ss', { locale: ptBR }),
      label: sale.cancel_reason ? `Cancelado: ${sale.cancel_reason}` : 'Venda cancelada',
      icon: XCircle,
      color: 'text-destructive',
    });
  }

  entries.push({
    time: format(parseISO(sale.updated_at), 'HH:mm:ss', { locale: ptBR }),
    label: `Estado operacional atual: ${operationalView.operationalLabel}`,
    icon: operationalView.operationalPriority === 'critico' ? AlertTriangle : CheckCircle,
    color: operationalView.operationalPriority === 'critico' ? 'text-destructive' : 'text-emerald-600',
  });

  return entries;
}

// ── Component ──
export default function SalesDiagnostic() {
  const navigate = useNavigate();
  const { activeCompanyId, activeCompany } = useAuth();
  const {
    environment: runtimePaymentEnvironment,
    isReady: isRuntimePaymentEnvironmentReady,
  } = useRuntimePaymentEnvironment();
  const [sales, setSales] = useState<DiagnosticSale[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<DiagnosticFilters>(initialFilters);
  const [events, setEvents] = useState<{ id: string; name: string; date: string }[]>([]);
  const [availableGateways, setAvailableGateways] = useState<string[]>([]);
  const [isCompanyScopeRefreshing, setIsCompanyScopeRefreshing] = useState(false);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(false);
  const [groupByOperationalStatus, setGroupByOperationalStatus] = useState(false);
  const [showOnlyProblems, setShowOnlyProblems] = useState(false);
  const [quickFocusFilter, setQuickFocusFilter] = useState<QuickFocusFilter>('todos');
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [lastRelevantChangeAt, setLastRelevantChangeAt] = useState<string | null>(null);
  const [lastRelevantChangeLabel, setLastRelevantChangeLabel] = useState('Nenhuma mudança relevante percebida nesta sessão.');
  const [newSaleIds, setNewSaleIds] = useState<string[]>([]);
  const latestSalesRequestIdRef = useRef(0);
  const latestEventsRequestIdRef = useRef(0);
  const previousCompanyIdRef = useRef<string | null>(null);
  const previousRenderedSaleIdsRef = useRef<string[]>([]);
  const previousSalesSnapshotRef = useRef<Record<string, string>>({});

  // Detail modal
  const [detailSale, setDetailSale] = useState<DiagnosticSale | null>(null);
  const [detailLogs, setDetailLogs] = useState<SaleLog[]>([]);
  const [detailIntegrationLogs, setDetailIntegrationLogs] = useState<SaleIntegrationLog[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [technicalDiagnosticOpen, setTechnicalDiagnosticOpen] = useState(false);
  const [technicalDiagnosticLoading, setTechnicalDiagnosticLoading] = useState(false);
  const [technicalDiagnosticSnapshot, setTechnicalDiagnosticSnapshot] = useState<TechnicalDiagnosticSnapshot | null>(null);
  const [technicalDiagnosticLogs, setTechnicalDiagnosticLogs] = useState<SaleIntegrationLog[]>([]);
  const [technicalDiagnosticSales, setTechnicalDiagnosticSales] = useState<DiagnosticSale[]>([]);
  const [technicalDiagnosticSaleLogs, setTechnicalDiagnosticSaleLogs] = useState<SaleLog[]>([]);
  const [technicalDiagnosticDedupEntries, setTechnicalDiagnosticDedupEntries] = useState<WebhookDedupEntry[]>([]);
  const [detailCompany, setDetailCompany] = useState<{
    name: string;
    asaas_account_email_production: string | null;
    asaas_wallet_id_production: string | null;
    asaas_account_id_production: string | null;
    asaas_account_email_sandbox: string | null;
    asaas_wallet_id_sandbox: string | null;
    asaas_account_id_sandbox: string | null;
  } | null>(null);

  const detailCompanyOperationalAsaas = useMemo(() => {
    if (!detailCompany) return null;

    const environment = detailSale?.payment_environment === 'production' ? 'production' : 'sandbox';

    // Comentário de suporte: o diagnóstico usa apenas os campos do ambiente da venda.
    // O legado não deve mais influenciar leitura administrativa nem decisão operacional.
    if (environment === 'production') {
      return {
        environment,
        accountEmail: detailCompany.asaas_account_email_production,
        walletId: detailCompany.asaas_wallet_id_production,
        accountId: detailCompany.asaas_account_id_production,
      };
    }

    return {
      environment,
      accountEmail: detailCompany.asaas_account_email_sandbox,
      walletId: detailCompany.asaas_wallet_id_sandbox,
      accountId: detailCompany.asaas_account_id_sandbox,
    };
  }, [detailCompany, detailSale?.payment_environment]);

  const hasActiveFilters = useMemo(() => (
    filters.search !== '' ||
    filters.status !== 'all' ||
    filters.eventId !== 'all' ||
    filters.gateway !== 'all' ||
    filters.paymentStatus !== 'all' ||
    filters.dateFrom !== '' ||
    filters.dateTo !== ''
  ), [filters]);

  const salesWithOperationalView = useMemo(() => {
    return sales
      .map((sale) => {
        const operational = computeOperationalView(sale);
        const isNewInSession = newSaleIds.includes(sale.id);

        return {
          sale,
          operational,
          freshness: computeMonitoringFreshness(sale, isNewInSession),
        };
      })
      .sort((a, b) => {
        // Correção operacional: a ordenação padrão precisa ser previsível e sempre começar
        // pela venda mais recente. A prioridade passa a ser apenas critério secundário.
        const createdAtDiff = new Date(b.sale.created_at).getTime() - new Date(a.sale.created_at).getTime();
        if (createdAtDiff !== 0) {
          return createdAtDiff;
        }

        return a.operational.priority - b.operational.priority;
      });
  }, [newSaleIds, sales]);

  const visibleSalesWithOperationalView = useMemo(() => {
    let visibleEntries = salesWithOperationalView;

    // Precedência explícita: primeiro aplicamos o toggle global de problemas,
    // depois o foco rápido só refina a renderização visível sem mexer nos filtros estruturais.
    if (showOnlyProblems) {
      visibleEntries = visibleEntries.filter((entry) => entry.operational.operationalPriority !== 'ok');
    }

    if (quickFocusFilter === 'criticos') {
      visibleEntries = visibleEntries.filter((entry) => entry.operational.operationalPriority === 'critico');
    } else if (quickFocusFilter === 'novos') {
      visibleEntries = visibleEntries.filter((entry) => entry.freshness === 'novo' || entry.freshness === 'recente');
    } else if (quickFocusFilter === 'acompanhamento') {
      visibleEntries = visibleEntries.filter((entry) => entry.operational.operationalPriority === 'atencao');
    } else if (quickFocusFilter === 'ok') {
      visibleEntries = visibleEntries.filter((entry) => entry.operational.operationalPriority === 'ok');
    }

    return visibleEntries;
  }, [quickFocusFilter, salesWithOperationalView, showOnlyProblems]);

  const visibleOperationalSummary = useMemo(() => {
    return visibleSalesWithOperationalView.reduce((acc, entry) => {
      acc.total += 1;
      if (entry.operational.operationalPriority === 'critico') acc.critico += 1;
      if (entry.operational.operationalPriority === 'atencao') acc.atencao += 1;
      if (entry.operational.operationalPriority === 'ok') acc.ok += 1;
      if (entry.freshness === 'novo') acc.novo += 1;
      if (entry.freshness === 'recente') acc.recente += 1;
      if (entry.operational.operationalPriority === 'critico' && entry.freshness !== 'estavel') acc.criticoRecente += 1;
      if (entry.operational.category === 'pago') acc.pago += 1;
      if (entry.operational.category === 'cancelado') acc.cancelado += 1;
      return acc;
    }, { total: 0, critico: 0, atencao: 0, ok: 0, novo: 0, recente: 0, criticoRecente: 0, pago: 0, cancelado: 0 });
  }, [visibleSalesWithOperationalView]);

  const groupedSalesWithOperationalView = useMemo(() => {
    const orderedPriorities: OperationalPriority[] = ['critico', 'atencao', 'ok'];
    const groupedEntries = new Map<OperationalPriority, typeof visibleSalesWithOperationalView>();

    orderedPriorities.forEach((priority) => {
      groupedEntries.set(priority, []);
    });

    visibleSalesWithOperationalView.forEach((entry) => {
      groupedEntries.get(entry.operational.operationalPriority)?.push(entry);
    });

    return orderedPriorities
      .map((priority) => ({
        priority,
        entries: groupedEntries.get(priority) ?? [],
      }))
      .filter((group) => group.entries.length > 0);
  }, [visibleSalesWithOperationalView]);

  const lastUpdatedLabel = useMemo(() => {
    if (!lastUpdatedAt) return 'Aguardando primeira atualização';
    return format(parseISO(lastUpdatedAt), "HH:mm:ss", { locale: ptBR });
  }, [lastUpdatedAt]);

  const executiveSummaryMessages = useMemo(() => {
    if (visibleOperationalSummary.total === 0) {
      return ['Aguardando vendas dentro do escopo operacional atual.'];
    }

    // O resumo executivo usa apenas contagens visíveis no recorte atual.
    // Isso melhora a triagem sem esconder a origem dos números e mantém a leitura determinística.
    const messages: string[] = [];

    if (visibleOperationalSummary.critico > 0) {
      messages.push(`${visibleOperationalSummary.critico} venda(s) crítica(s) exigem revisão imediata.`);
    } else {
      messages.push('Nenhuma venda crítica encontrada neste recorte.');
    }

    if (visibleOperationalSummary.atencao > 0) {
      messages.push(`${visibleOperationalSummary.atencao} venda(s) estão em acompanhamento.`);
    }

    if (visibleOperationalSummary.ok > 0) {
      messages.push(
        visibleOperationalSummary.ok === visibleOperationalSummary.total
          ? 'Todas as vendas visíveis estão estáveis.'
          : `${visibleOperationalSummary.ok} venda(s) estão sem necessidade de ação.`
      );
    }

    return messages;
  }, [visibleOperationalSummary]);

  const movementSummaryMessages = useMemo(() => {
    if (visibleOperationalSummary.total === 0) {
      return ['Monitoramento sem itens visíveis neste recorte.'];
    }

    const messages: string[] = [];

    if (visibleOperationalSummary.novo > 0) {
      messages.push(`${visibleOperationalSummary.novo} nova(s) venda(s) entraram no monitoramento nesta sessão.`);
    }

    if (visibleOperationalSummary.criticoRecente > 0) {
      messages.push(`${visibleOperationalSummary.criticoRecente} item(ns) crítico(s) são novos ou recentes e exigem atenção imediata.`);
    } else if (visibleOperationalSummary.critico === 0) {
      messages.push('Nenhuma nova divergência detectada desde a última atualização.');
    }

    if (messages.length === 0) {
      messages.push('Monitoramento estável no recorte atual.');
    }

    return messages;
  }, [visibleOperationalSummary]);

  const operationalBanner = useMemo(() => {
    // O banner operacional mostra uma única mensagem por vez, seguindo ordem de prioridade fixa.
    // Assim o topo da tela continua previsível e preparado para futuros alertas sem criar múltiplos banners concorrentes.
    if (visibleOperationalSummary.criticoRecente > 0) {
      return {
        tone: 'border-destructive/30 bg-destructive/10 text-destructive',
        title: `Alerta: há ${visibleOperationalSummary.criticoRecente} divergência(s) nova(s) exigindo revisão imediata.`,
      };
    }

    if (visibleOperationalSummary.critico > 0) {
      return {
        tone: 'border-destructive/20 bg-destructive/5 text-destructive',
        title: `Atenção: existem ${visibleOperationalSummary.critico} vendas críticas no monitoramento atual.`,
      };
    }

    if (visibleOperationalSummary.atencao > 0) {
      return {
        tone: 'border-amber-300 bg-amber-50 text-amber-900',
        title: `Acompanhamento: ${visibleOperationalSummary.atencao} venda(s) seguem pendentes sem divergência estrutural.`,
      };
    }

    return {
      tone: 'border-emerald-200 bg-emerald-50 text-emerald-900',
      title: 'Monitoramento estável: nenhuma ocorrência crítica no recorte atual.',
    };
  }, [visibleOperationalSummary]);

  const lastRelevantChangeDisplayLabel = useMemo(() => {
    if (!lastRelevantChangeAt) return lastRelevantChangeLabel;
    return `${lastRelevantChangeLabel} Última mudança detectada às ${format(parseISO(lastRelevantChangeAt), 'HH:mm:ss', { locale: ptBR })}.`;
  }, [lastRelevantChangeAt, lastRelevantChangeLabel]);

  const technicalDiagnosticLastEvent = useMemo(() => technicalDiagnosticLogs[0] ?? null, [technicalDiagnosticLogs]);

  const technicalDiagnosticLastWebhook = useMemo(
    () => technicalDiagnosticLogs.find((log) => log.provider === 'asaas' && log.direction === 'incoming_webhook') ?? null,
    [technicalDiagnosticLogs]
  );

  const technicalDiagnosticLastFailure = useMemo(() => (
    technicalDiagnosticLogs.find((log) => (
      log.processing_status === 'failed'
      || log.processing_status === 'partial_failure'
      || log.processing_status === 'rejected'
      || log.processing_status === 'unauthorized'
      || !!log.incident_code
    )) ?? null
  ), [technicalDiagnosticLogs]);

  const technicalDiagnosticDivergences = useMemo<TechnicalDivergence[]>(() => {
    const divergences: TechnicalDivergence[] = [];

    // Critério 1 (objetivo): vendas sem payment_environment no recorte.
    technicalDiagnosticSales
      .filter((sale) => !sale.payment_environment)
      .forEach((sale) => {
        divergences.push({
          id: `sale_without_environment_${sale.id}`,
          title: 'Venda sem payment_environment',
          severity: 'critical',
          detail: `A venda ${sale.id} está sem ambiente persistido, o que quebra a rastreabilidade do fluxo Asaas.`,
          saleId: sale.id,
        });
      });

    // Critério 2 (objetivo): vendas sem asaas_payment_id, mas em estado pendente/reservado.
    technicalDiagnosticSales
      .filter((sale) => !sale.asaas_payment_id && sale.status !== 'cancelado')
      .forEach((sale) => {
        divergences.push({
          id: `sale_without_payment_id_${sale.id}`,
          title: 'Venda sem asaas_payment_id',
          severity: 'attention',
          detail: `A venda ${sale.id} está em ${sale.status} sem cobrança Asaas vinculada.`,
          saleId: sale.id,
        });
      });

    // Critério 3 (objetivo): status não pago no sales, com indício técnico de confirmação.
    const confirmedIndicators = new Set(
      technicalDiagnosticLogs
        .filter((log) => (
          !!log.sale_id
          && (
            (log.event_type ?? '').toLowerCase().includes('payment_confirmed')
            || (log.event_type ?? '').toLowerCase().includes('payment_received')
            || (log.result_category === 'payment_confirmed')
          )
        ))
        .map((log) => log.sale_id as string)
    );

    technicalDiagnosticSales
      .filter((sale) => sale.status !== 'pago' && confirmedIndicators.has(sale.id))
      .forEach((sale) => {
        divergences.push({
          id: `sale_status_mismatch_confirmed_${sale.id}`,
          title: 'Status da venda não reflete confirmação técnica',
          severity: 'critical',
          detail: `A venda ${sale.id} não está em pago, mas há indício recente de confirmação nos logs técnicos.`,
          saleId: sale.id,
        });
      });

    // Critério 4 (objetivo): inconsistência status da venda vs asaas_payment_status.
    technicalDiagnosticSales
      .filter((sale) => sale.status === 'pago' && sale.asaas_payment_status && !['CONFIRMED', 'RECEIVED'].includes(sale.asaas_payment_status))
      .forEach((sale) => {
        divergences.push({
          id: `sale_vs_asaas_status_${sale.id}`,
          title: 'Inconsistência sales.status x asaas_payment_status',
          severity: 'attention',
          detail: `A venda ${sale.id} está paga, porém asaas_payment_status=${sale.asaas_payment_status}.`,
          saleId: sale.id,
        });
      });

    // Critério 5 (objetivo): warning de observabilidade já padronizado no verify-payment-status.
    technicalDiagnosticLogs
      .filter((log) => log.warning_code === 'webhook_not_observed_before_verify_confirmation' || log.incident_code === 'webhook_not_observed_before_verify_confirmation')
      .forEach((log) => {
        divergences.push({
          id: `warning_webhook_not_observed_${log.id}`,
          title: 'Confirmação sem webhook correlacionado',
          severity: 'attention',
          detail: log.message,
          saleId: log.sale_id,
        });
      });

    // Critério 6 (objetivo): incidentes técnicos críticos recentes.
    technicalDiagnosticLogs
      .filter((log) => ['failed', 'partial_failure', 'rejected', 'unauthorized'].includes(log.processing_status) && !!log.incident_code)
      .forEach((log) => {
        divergences.push({
          id: `critical_incident_${log.id}`,
          title: `Incidente técnico: ${log.incident_code}`,
          severity: 'critical',
          detail: log.message,
          saleId: log.sale_id,
        });
      });

    // Critério 7 (objetivo): deduplicação detectada no recorte atual.
    technicalDiagnosticDedupEntries
      .filter((entry) => (entry.duplicate_count ?? 0) > 0)
      .forEach((entry) => {
        divergences.push({
          id: `dedup_${entry.asaas_event_id}`,
          title: 'Duplicidade de webhook detectada',
          severity: 'attention',
          detail: `Evento ${entry.asaas_event_id} teve ${entry.duplicate_count} repetição(ões).`,
          saleId: entry.sale_id,
        });
      });

    return divergences;
  }, [technicalDiagnosticDedupEntries, technicalDiagnosticLogs, technicalDiagnosticSales]);

  const technicalDiagnosticStatus = useMemo<TechnicalDiagnosticStatus>(() => {
    // Semáforo mínimo e explícito para evitar “diagnóstico fake”.
    // - Critical: incidente crítico, falha forte de processamento ou divergência crítica.
    // - Attention: warning relevante, ausência de evento recente ou divergências de atenção.
    // - OK: há atividade recente e nenhum achado relevante no recorte.
    const hasCriticalDivergence = technicalDiagnosticDivergences.some((divergence) => divergence.severity === 'critical');
    const hasCriticalLog = technicalDiagnosticLogs.some((log) => (
      ['failed', 'partial_failure', 'rejected', 'unauthorized'].includes(log.processing_status)
      || !!log.incident_code
    ));

    if (hasCriticalDivergence || hasCriticalLog) return 'critical';

    const hasAttentionDivergence = technicalDiagnosticDivergences.some((divergence) => divergence.severity === 'attention');
    const hasWarningLog = technicalDiagnosticLogs.some((log) => log.processing_status === 'warning' || !!log.warning_code);

    const lastEventAgeMs = technicalDiagnosticLastEvent
      ? Date.now() - new Date(technicalDiagnosticLastEvent.created_at).getTime()
      : null;
    const hasNoRecentEvent = lastEventAgeMs === null || lastEventAgeMs > 1000 * 60 * 60 * 12;

    if (hasAttentionDivergence || hasWarningLog || hasNoRecentEvent) return 'attention';

    return 'ok';
  }, [technicalDiagnosticDivergences, technicalDiagnosticLastEvent, technicalDiagnosticLogs]);

  const technicalDiagnosticKpis = useMemo(() => {
    // v1.1: KPIs apenas resumem sinais já existentes da v1.
    // Não criam nova regra de negócio e usam os mesmos dados carregados pelo snapshot congelado.
    const criticalLogsCount = technicalDiagnosticLogs.filter((log) => (
      ['failed', 'partial_failure', 'rejected', 'unauthorized'].includes(log.processing_status)
      || !!log.incident_code
    )).length;

    const criticalDivergencesCount = technicalDiagnosticDivergences.filter((divergence) => divergence.severity === 'critical').length;

    const warningsCount = technicalDiagnosticLogs.filter((log) => (
      log.processing_status === 'warning' || !!log.warning_code
    )).length;

    const duplicateWebhookCount = technicalDiagnosticDedupEntries.filter((entry) => (entry.duplicate_count ?? 0) > 0).length;

    const saleIdsWithDivergence = new Set(
      technicalDiagnosticDivergences
        .map((divergence) => divergence.saleId)
        .filter((saleId): saleId is string => !!saleId)
    );

    return {
      criticalIncidents: criticalLogsCount + criticalDivergencesCount,
      warnings: warningsCount,
      duplicateWebhooks: duplicateWebhookCount,
      salesWithDivergence: saleIdsWithDivergence.size,
    };
  }, [technicalDiagnosticDedupEntries, technicalDiagnosticDivergences, technicalDiagnosticLogs]);

  const fetchSales = useCallback(async () => {
    const requestId = ++latestSalesRequestIdRef.current;
    setLoading(true);
    setIsCompanyScopeRefreshing(true);

    // Ambiente também faz parte do escopo operacional da tela. Esperamos a fonte oficial do app
    // antes de consultar para evitar uma primeira renderização com dados de ambiente misturado.
    if (!isRuntimePaymentEnvironmentReady) {
      return;
    }

    if (!activeCompanyId) {
      setSales([]);
      setAvailableGateways([]);
      setLoading(false);
      setIsCompanyScopeRefreshing(false);
      return;
    }

    let query = supabase
      .from('sales')
      .select(`
        *,
        event:events(name, date),
        company:companies(name)
      `)
      .order('created_at', { ascending: false })
      // Painel operacional: mantemos recorte nas 100 vendas mais recentes para preservar custo/tempo
      // de resposta. A rastreabilidade da correção documenta essa decisão para não ficar ambígua.
      .limit(100);

    // Correção mínima: esta tela deve seguir o mesmo contrato visual do restante do admin.
    // Se o header mostra uma empresa ativa, a consulta precisa respeitar esse `company_id`,
    // inclusive para developer, evitando leitura cross-company implícita nesta rota.
    query = query.eq('company_id', activeCompanyId);

    if (runtimePaymentEnvironment) {
      query = query.eq('payment_environment', runtimePaymentEnvironment);
    }

    if (filters.search.trim()) {
      const searchTerm = filters.search.trim();
      const normalizedCpf = searchTerm.replace(/\D/g, '');
      const matchedSaleIds = new Set<string>();

      // A busca antiga tentava `ILIKE` direto em UUID e quebrava a consulta no PostgREST.
      // Aqui resolvemos as chaves de busca em etapas explícitas e só aplicamos `id IN (...)`
      // no resultado final, preservando previsibilidade e evitando erro técnico no backend.
      const [nameSearchRes, cpfSearchRes] = await Promise.all([
        (() => {
          let salesByNameQuery = supabase
            .from('sales')
            .select('id')
            .ilike('customer_name', `%${searchTerm}%`)
            .limit(100);

          if (activeCompanyId) {
            salesByNameQuery = salesByNameQuery.eq('company_id', activeCompanyId);
          }

          return salesByNameQuery;
        })(),
        normalizedCpf.length > 0
          ? (() => {
              let salesByCpfQuery = supabase
                .from('sales')
                .select('id')
                .ilike('customer_cpf', `%${normalizedCpf}%`)
                .limit(100);

              if (activeCompanyId) {
                salesByCpfQuery = salesByCpfQuery.eq('company_id', activeCompanyId);
              }

              return salesByCpfQuery;
            })()
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (nameSearchRes.error || cpfSearchRes.error) {
        toast.error('Erro ao resolver a busca de vendas para diagnóstico');
        setLoading(false);
        return;
      }

      (nameSearchRes.data ?? []).forEach((sale) => matchedSaleIds.add(sale.id));
      (cpfSearchRes.data ?? []).forEach((sale) => matchedSaleIds.add(sale.id));

      if (isExactUuid(searchTerm)) {
        matchedSaleIds.add(searchTerm);
      }

      // Mantemos ticket e evento como apoio mínimo à UX já prometida pelo campo de busca,
      // sem trocar a fonte principal da grade nem introduzir nova arquitetura de consulta.
      const [ticketSearchRes, eventSearchRes] = await Promise.all([
        (() => {
          let ticketQuery = supabase
            .from('tickets')
            .select('sale_id')
            .ilike('ticket_number', `%${searchTerm}%`)
            .limit(100);

          // Blindagem multiempresa: a resolução de ticket também deve obedecer à empresa ativa,
          // não apenas a query final de `sales`, para evitar encadeamento parcial do escopo.
          ticketQuery = ticketQuery.eq('company_id', activeCompanyId);

          return ticketQuery;
        })(),
        (() => {
          let eventsQuery = supabase
            .from('events')
            .select('id')
            .ilike('name', `%${searchTerm}%`)
            .limit(50);

          eventsQuery = eventsQuery.eq('company_id', activeCompanyId);

          return eventsQuery;
        })(),
      ]);

      if (ticketSearchRes.error || eventSearchRes.error) {
        toast.error('Erro ao resolver a busca complementar do diagnóstico');
        setLoading(false);
        return;
      }

      (ticketSearchRes.data ?? []).forEach((ticket) => {
        if (ticket.sale_id) matchedSaleIds.add(ticket.sale_id);
      });

      const matchedEventIds = (eventSearchRes.data ?? []).map((event) => event.id);
      if (matchedEventIds.length > 0) {
        let salesByEventQuery = supabase
          .from('sales')
          .select('id')
          .in('event_id', matchedEventIds)
          .limit(100);

        salesByEventQuery = salesByEventQuery.eq('company_id', activeCompanyId);

        const { data: salesByEvent, error: salesByEventError } = await salesByEventQuery;

        if (salesByEventError) {
          toast.error('Erro ao resolver a busca por evento no diagnóstico');
          setLoading(false);
          return;
        }

        (salesByEvent ?? []).forEach((sale) => matchedSaleIds.add(sale.id));
      }

      const resolvedSaleIds = Array.from(matchedSaleIds);
      query = resolvedSaleIds.length > 0
        ? query.in('id', resolvedSaleIds)
        : query.eq('id', EMPTY_UUID_FILTER);
    }

    if (filters.status !== 'all') {
      query = query.eq('status', filters.status);
    }

    if (filters.eventId !== 'all') {
      query = query.eq('event_id', filters.eventId);
    }

    if (filters.dateFrom) {
      query = query.gte('created_at', buildCreatedAtBoundary(filters.dateFrom, false));
    }

    if (filters.dateTo) {
      query = query.lte('created_at', buildCreatedAtBoundary(filters.dateTo, true));
    }

    const { data, error } = await query;

    if (requestId !== latestSalesRequestIdRef.current) {
      return;
    }

    if (error) {
      toast.error('Erro ao carregar vendas para diagnóstico');
      setLoading(false);
      setIsCompanyScopeRefreshing(false);
      return;
    }

    const rawSales = (data ?? []) as unknown as DiagnosticSale[];

    // Fetch ticket counts and current seat locks for these sales.
    // Comentário de manutenção: usamos seat_locks para diagnosticar lock ativo/ausente/expirado
    // sem alterar a regra de negócio do checkout/expiração definida nos steps anteriores.
    const saleIds = rawSales.map((s) => s.id);
    const ticketCounts: Record<string, number> = {};
    const activeLockCountBySale: Record<string, number> = {};
    const latestLockExpiryBySale: Record<string, string> = {};
    if (saleIds.length > 0) {
      const [ticketsRes, locksRes] = await Promise.all([
        (() => {
          let ticketsQuery = supabase
            .from('tickets')
            .select('sale_id')
            .in('sale_id', saleIds);

          ticketsQuery = ticketsQuery.eq('company_id', activeCompanyId);

          return ticketsQuery;
        })(),
        (() => {
          let locksQuery = supabase
            .from('seat_locks')
            .select('sale_id, expires_at')
            .in('sale_id', saleIds);

          // Blindagem explícita: seat_locks também carrega company_id no schema e precisa repetir
          // o mesmo escopo da venda selecionada para evitar qualquer leitura cruzada implícita.
          locksQuery = locksQuery.eq('company_id', activeCompanyId);

          return locksQuery;
        })(),
      ]);

      if (requestId !== latestSalesRequestIdRef.current) {
        return;
      }

      const tickets = ticketsRes.data ?? [];
      const seatLocks = locksRes.data ?? [];

      tickets.forEach((t) => {
        ticketCounts[t.sale_id] = (ticketCounts[t.sale_id] ?? 0) + 1;
      });

      seatLocks.forEach((lock) => {
        const saleId = lock.sale_id as string | null;
        if (!saleId) return;

        if (new Date(lock.expires_at).getTime() > Date.now()) {
          activeLockCountBySale[saleId] = (activeLockCountBySale[saleId] ?? 0) + 1;
        }

        const currentLatest = latestLockExpiryBySale[saleId];
        if (!currentLatest || new Date(lock.expires_at).getTime() > new Date(currentLatest).getTime()) {
          latestLockExpiryBySale[saleId] = lock.expires_at;
        }
      });
    }

    const mapped: DiagnosticSale[] = rawSales.map((s) => ({
      ...s,
      company_name: s.company?.name ?? '-',
      event_name: s.event?.name ?? '-',
      event_date: s.event?.date ?? null,
      ticket_count: ticketCounts[s.id] ?? 0,
      active_lock_count: activeLockCountBySale[s.id] ?? 0,
      latest_lock_expires_at: latestLockExpiryBySale[s.id] ?? null,
    }));

    const companyGateways = Array.from(new Set(mapped.map((sale) => computeGateway(sale).toLowerCase())));
    setAvailableGateways(companyGateways);

    // Client-side filters for gateway and payment status
    let filtered = mapped;

    if (filters.gateway !== 'all') {
      filtered = filtered.filter((s) => {
        const g = computeGateway(s);
        return g.toLowerCase() === filters.gateway.toLowerCase();
      });
    }

    if (filters.paymentStatus !== 'all') {
      filtered = filtered.filter((s) => {
        const ps = computePaymentStatus(s);
        if (filters.paymentStatus === 'aguardando') return ['Pagamento aguardando confirmação', 'Pagamento aguardando confirmação manual', 'Pagamento em processamento'].includes(ps.label);
        if (filters.paymentStatus === 'pago') return ['Pagamento confirmado', 'Pagamento confirmado manualmente'].includes(ps.label);
        if (filters.paymentStatus === 'falhou') return ['Pagamento expirado', 'Pagamento estornado', 'Pagamento cancelado'].includes(ps.label);
        return true;
      });
    }

    setSales(filtered);
    setLastUpdatedAt(new Date().toISOString());

    const currentSaleIds = filtered.map((sale) => sale.id);
    const currentSnapshot = Object.fromEntries(
      filtered.map((sale) => {
        const operational = computeOperationalView(sale);
        return [sale.id, `${sale.status}|${sale.updated_at}|${computeOperationalPriority(operational)}`];
      })
    );

    const previousSnapshot = previousSalesSnapshotRef.current;
    const changedSaleIds = currentSaleIds.filter((saleId) => previousSnapshot[saleId] && previousSnapshot[saleId] !== currentSnapshot[saleId]);

    if (autoRefreshEnabled) {
      const previousSaleIds = previousRenderedSaleIdsRef.current;
      const incomingSaleIds = currentSaleIds.filter((saleId) => !previousSaleIds.includes(saleId));
      setNewSaleIds(incomingSaleIds);

      // A percepção de mudança existe só dentro desta sessão e compara snapshots em memória.
      // Não prometemos histórico persistido; apenas sinalizamos quando a tela percebe novidade relevante.
      if (incomingSaleIds.length > 0 || changedSaleIds.length > 0) {
        const relevantChangeCount = incomingSaleIds.length + changedSaleIds.length;
        const detectedAt = new Date().toISOString();
        setLastRelevantChangeAt(detectedAt);
        setLastRelevantChangeLabel(`${relevantChangeCount} mudança(s) percebida(s) nesta atualização.`);
      } else {
        setLastRelevantChangeLabel('Nenhuma mudança relevante desde a última atualização.');
      }
    } else {
      setNewSaleIds([]);
      if (changedSaleIds.length > 0) {
        const detectedAt = new Date().toISOString();
        setLastRelevantChangeAt(detectedAt);
        setLastRelevantChangeLabel(`${changedSaleIds.length} mudança(s) percebida(s) na atualização manual.`);
      } else {
        setLastRelevantChangeLabel('Nenhuma mudança relevante desde a última atualização.');
      }
    }

    previousRenderedSaleIdsRef.current = currentSaleIds;
    previousSalesSnapshotRef.current = currentSnapshot;
    setLoading(false);
    setIsCompanyScopeRefreshing(false);
  }, [activeCompanyId, autoRefreshEnabled, filters, isRuntimePaymentEnvironmentReady, runtimePaymentEnvironment]);

  const fetchEvents = useCallback(async () => {
    const requestId = ++latestEventsRequestIdRef.current;

    if (!activeCompanyId) {
      setEvents([]);
      return;
    }

    let query = supabase
      .from('events')
      .select('id, name, date')
      .order('date', { ascending: false })
      .limit(50);

    // Mantemos o filtro de eventos coerente com a mesma empresa ativa usada na listagem.
    if (activeCompanyId) {
      query = query.eq('company_id', activeCompanyId);
    }

    const { data } = await query;
    if (requestId !== latestEventsRequestIdRef.current) {
      return;
    }
    setEvents((data ?? []) as { id: string; name: string; date: string }[]);
  }, [activeCompanyId]);

  const openDetail = useCallback(async (sale: DiagnosticSale) => {
    setDetailSale(sale);
    setDetailLoading(true);
    setDetailLogs([]);
    setDetailIntegrationLogs([]);
    setDetailCompany(null);

    const [logsRes, integrationLogsRes, companyRes] = await Promise.all([
      supabase
        .from('sale_logs')
        .select('*')
        .eq('sale_id', sale.id)
        .eq('company_id', sale.company_id)
        .order('created_at', { ascending: true }),
      // Usa trilha técnica persistida para diagnóstico confiável do webhook/payload.
      supabase
        .from('sale_integration_logs')
        .select('*')
        .eq('sale_id', sale.id)
        .eq('company_id', sale.company_id)
        .eq('payment_environment', sale.payment_environment)
        .order('created_at', { ascending: false })
        .limit(30),
      supabase
        .from('companies')
        // Comentário de manutenção: detalhe da venda deve refletir apenas a conta operacional por ambiente.
        .select('name, asaas_account_email_production, asaas_wallet_id_production, asaas_account_id_production, asaas_account_email_sandbox, asaas_wallet_id_sandbox, asaas_account_id_sandbox')
        .eq('id', sale.company_id)
        .single(),
    ]);

    setDetailLogs((logsRes.data ?? []) as SaleLog[]);
    setDetailIntegrationLogs((integrationLogsRes.data ?? []) as SaleIntegrationLog[]);
    setDetailCompany((companyRes.data ?? null) as typeof detailCompany);
    setDetailLoading(false);
  }, []);

  useEffect(() => {
    fetchSales();
  }, [fetchSales]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  useEffect(() => {
    if (previousCompanyIdRef.current === activeCompanyId) return;

    previousCompanyIdRef.current = activeCompanyId;
    latestSalesRequestIdRef.current += 1;
    latestEventsRequestIdRef.current += 1;
    setSales([]);
    setEvents([]);
    setAvailableGateways([]);
    setNewSaleIds([]);
    setQuickFocusFilter('todos');
    setLastRelevantChangeAt(null);
    setLastRelevantChangeLabel('Nenhuma mudança relevante percebida nesta sessão.');
    previousSalesSnapshotRef.current = {};

    // Filtros dependentes precisam ser limpos ao trocar a empresa para não carregar um valor
    // invisivelmente inválido herdado da empresa anterior.
    setFilters((currentFilters) => {
      const nextFilters = {
        ...currentFilters,
        eventId: 'all',
        gateway: 'all',
        paymentStatus: 'all',
      };

      const filtersChanged =
        nextFilters.eventId !== currentFilters.eventId ||
        nextFilters.gateway !== currentFilters.gateway ||
        nextFilters.paymentStatus !== currentFilters.paymentStatus;

      if (filtersChanged) {
        toast.success('Empresa alterada. Filtros dependentes foram atualizados.');
      }

      return nextFilters;
    });
  }, [activeCompanyId]);

  useEffect(() => {
    if (!autoRefreshEnabled || detailSale) return;

    // Modo monitoramento: atualiza sem resetar filtros nem quebrar o layout; pausamos com modal
    // aberto para não sobrescrever uma investigação em curso do suporte.
    const refreshInterval = window.setInterval(() => {
      fetchSales();
    }, 30000);

    return () => window.clearInterval(refreshInterval);
  }, [autoRefreshEnabled, detailSale, fetchSales]);

  useEffect(() => {
    if (newSaleIds.length === 0) return;

    const cleanupTimer = window.setTimeout(() => {
      setNewSaleIds([]);
    }, 45000);

    return () => window.clearTimeout(cleanupTimer);
  }, [newSaleIds]);

  const handleCopyToClipboard = useCallback(async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copiado com sucesso.`);
    } catch {
      toast.error(`Não foi possível copiar ${label.toLowerCase()}.`);
    }
  }, []);

  const handleRefreshSingleSale = useCallback(async (sale: DiagnosticSale) => {
    await fetchSales();

    if (detailSale?.id === sale.id) {
      await openDetail(sale);
    }

    toast.success('Diagnóstico da venda recarregado.');
  }, [detailSale?.id, fetchSales, openDetail]);

  const handleOpenTechnicalDiagnostic = useCallback(async () => {
    if (!activeCompanyId || !runtimePaymentEnvironment || !isRuntimePaymentEnvironmentReady) {
      toast.error('Contexto ativo indisponível para diagnóstico técnico.');
      return;
    }

    // Snapshot fixo: congela empresa + ambiente + horário no clique.
    // Toda a leitura do modal usa este contexto até o fechamento, evitando mistura durante troca no header.
    const snapshot: TechnicalDiagnosticSnapshot = {
      companyId: activeCompanyId,
      companyName: activeCompany?.name ?? 'Empresa ativa',
      paymentEnvironment: runtimePaymentEnvironment,
      executedAt: new Date().toISOString(),
    };

    setTechnicalDiagnosticSnapshot(snapshot);
    setTechnicalDiagnosticOpen(true);
    setTechnicalDiagnosticLoading(true);
    setTechnicalDiagnosticLogs([]);
    setTechnicalDiagnosticSales([]);
    setTechnicalDiagnosticSaleLogs([]);
    setTechnicalDiagnosticDedupEntries([]);

    const { data: logsData, error: logsError } = await supabase
      .from('sale_integration_logs')
      .select('*')
      .eq('company_id', snapshot.companyId)
      .eq('payment_environment', snapshot.paymentEnvironment)
      .order('created_at', { ascending: false })
      .limit(120);

    if (logsError) {
      toast.error('Erro ao carregar logs técnicos do diagnóstico.');
      setTechnicalDiagnosticLoading(false);
      return;
    }

    const typedLogs = (logsData ?? []) as SaleIntegrationLog[];
    setTechnicalDiagnosticLogs(typedLogs);

    const { data: salesData, error: salesError } = await supabase
      .from('sales')
      .select(`
        *,
        event:events(name, date),
        company:companies(name)
      `)
      .eq('company_id', snapshot.companyId)
      .eq('payment_environment', snapshot.paymentEnvironment)
      .order('created_at', { ascending: false })
      .limit(120);

    if (salesError) {
      toast.error('Erro ao carregar vendas do diagnóstico técnico.');
      setTechnicalDiagnosticLoading(false);
      return;
    }

    const typedSales = (salesData ?? []) as unknown as DiagnosticSale[];
    setTechnicalDiagnosticSales(typedSales);

    const saleIds = typedSales.map((sale) => sale.id);

    if (saleIds.length > 0) {
      const [saleLogsRes, dedupRes] = await Promise.all([
        supabase
          .from('sale_logs')
          .select('*')
          .in('sale_id', saleIds)
          .eq('company_id', snapshot.companyId)
          .order('created_at', { ascending: false })
          .limit(120),
        supabase
          .from('asaas_webhook_event_dedup')
          .select('asaas_event_id, sale_id, external_reference, payment_environment, duplicate_count, first_received_at, last_seen_at')
          .in('sale_id', saleIds)
          .eq('payment_environment', snapshot.paymentEnvironment)
          .order('last_seen_at', { ascending: false })
          .limit(120),
      ]);

      if (saleLogsRes.error) {
        toast.error('Erro ao carregar trilha funcional (sale_logs).');
      }

      if (dedupRes.error) {
        toast.error('Erro ao carregar deduplicação de webhook.');
      }

      setTechnicalDiagnosticSaleLogs((saleLogsRes.data ?? []) as SaleLog[]);
      setTechnicalDiagnosticDedupEntries((dedupRes.data ?? []) as WebhookDedupEntry[]);
    }

    setTechnicalDiagnosticLoading(false);
  }, [activeCompany?.name, activeCompanyId, isRuntimePaymentEnvironmentReady, runtimePaymentEnvironment]);

  const filterSelects = [
    {
      id: 'status',
      label: 'Status da Venda',
      placeholder: 'Todos',
      value: filters.status,
      onChange: (v: string) => setFilters((f) => ({ ...f, status: v as DiagnosticFilters['status'] })),
      options: [
        { value: 'all', label: 'Todos' },
        { value: 'pendente_pagamento', label: 'Pendente pagamento' },
        { value: 'reservado', label: 'Reservado' },
        { value: 'pago', label: 'Pago' },
        { value: 'cancelado', label: 'Cancelado' },
      ],
    },
    {
      id: 'gateway',
      label: 'Gateway',
      placeholder: 'Todos',
      value: filters.gateway,
      onChange: (v: string) => setFilters((f) => ({ ...f, gateway: v })),
      icon: CreditCard,
      options: [
        { value: 'all', label: 'Todos' },
        ...(availableGateways.includes('asaas') ? [{ value: 'asaas', label: 'Asaas' }] : []),
        ...(availableGateways.includes('manual') ? [{ value: 'manual', label: 'Manual' }] : []),
      ],
    },
    {
      id: 'paymentStatus',
      label: 'Status Pagamento',
      placeholder: 'Todos',
      value: filters.paymentStatus,
      onChange: (v: string) => setFilters((f) => ({ ...f, paymentStatus: v })),
      options: [
        { value: 'all', label: 'Todos' },
        { value: 'aguardando', label: 'Aguardando' },
        { value: 'pago', label: 'Pago' },
        { value: 'falhou', label: 'Falhou/Expirado' },
      ],
    },
  ];

  const mainFilters = (
    <>
      <div className="space-y-1.5">
        <label className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Calendar className="h-4 w-4" />
          Evento
        </label>
        <Select value={filters.eventId} onValueChange={(v) => setFilters((f) => ({ ...f, eventId: v }))}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Todos os eventos" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os eventos</SelectItem>
            {events.map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {e.date ? format(parseISO(e.date), 'dd/MM/yy', { locale: ptBR }) + ' - ' : ''}{e.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <label className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Calendar className="h-4 w-4" />
          Data inicial da criação da venda
        </label>
        <input
          type="date"
          value={filters.dateFrom}
          onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        />
      </div>
      <div className="space-y-1.5">
        <label className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Calendar className="h-4 w-4" />
          Data final da criação da venda
        </label>
        <input
          type="date"
          value={filters.dateTo}
          onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        />
      </div>
    </>
  );

  const operationalGroupTitles: Record<OperationalPriority, string> = {
    critico: 'Críticos',
    atencao: 'Atenção',
    ok: 'OK',
  };

  const getStatusToneClasses = (operational: DiagnosticOperationalView) => {
    if (operational.operationalPriority === 'critico') {
      return {
        container: 'border-destructive bg-destructive/10 shadow-[inset_4px_0_0_0_theme(colors.destructive.DEFAULT)]',
        badge: 'border-destructive/30 bg-destructive/10 text-destructive',
        dot: 'bg-destructive',
      };
    }

    if (operational.operationalPriority === 'atencao') {
      return {
        container: 'border-amber-300 bg-amber-50/70',
        badge: 'border-amber-300 bg-amber-100 text-amber-800',
        dot: 'bg-amber-500',
      };
    }

    return {
      container: 'border-emerald-200 bg-emerald-50/60',
      badge: 'border-emerald-200 bg-emerald-100 text-emerald-800',
      dot: 'bg-emerald-500',
    };
  };

  const renderSaleRow = ({ sale, operational, freshness }: { sale: DiagnosticSale; operational: DiagnosticOperationalView; freshness: MonitoringFreshness }) => {
    const gateway = computeGateway(sale);
    const paymentStatus = computePaymentStatus(sale);
    const lockStatus = computeLockStatus(sale);
    const flowStage = computeFlowStage(sale);
    const FlowIcon = flowStage.icon;
    const createdAtLabel = format(parseISO(sale.created_at), "dd/MM/yy 'às' HH:mm", { locale: ptBR });
    const createdAtRelativeLabel = formatDistanceToNowStrict(parseISO(sale.created_at), {
      addSuffix: true,
      locale: ptBR,
    });
    const saleAmountLabel = formatCurrencyBRL(sale.gross_amount ?? sale.quantity * sale.unit_price);
    const paymentEnvironmentLabel = sale.payment_environment === 'production' ? 'Produção' : 'Sandbox';
    const statusTone = getStatusToneClasses(operational);
    const priorityPresentation = getOperationalPriorityPresentation(operational.operationalPriority);
    const freshnessPresentation = getMonitoringFreshnessPresentation(freshness);
    const primaryStatusLabel = operational.hasGatewayDivergence ? 'Venda com divergência' : getOperationalHeadlineLabel(operational);
    const secondaryStatusLabel = operational.operationalLabel;

    const actions: ActionItem[] = [
      {
        label: 'Ver detalhes da venda',
        icon: Eye,
        onClick: () => openDetail(sale),
      },
      {
        label: 'Copiar ID da venda',
        icon: Copy,
        onClick: () => void handleCopyToClipboard('ID da venda', sale.id),
      },
      {
        label: 'Copiar CPF',
        icon: Copy,
        onClick: () => void handleCopyToClipboard('CPF', sale.customer_cpf),
      },
      {
        label: 'Abrir evento relacionado',
        icon: ExternalLink,
        onClick: () => navigate(`/admin/eventos/${sale.event_id}`),
      },
      {
        label: 'Recarregar diagnóstico da venda',
        icon: RefreshCw,
        onClick: () => void handleRefreshSingleSale(sale),
      },
    ];

    const isNewSale = freshness === 'novo';
    const isRecentSale = freshness === 'recente';
    const isCriticalAndFresh = operational.operationalPriority === 'critico' && freshness !== 'estavel';

    return (
      <div
        key={sale.id}
        className={cn(
          'overflow-hidden rounded-xl border bg-card shadow-sm transition-colors',
          statusTone.container,
          isNewSale && 'ring-2 ring-primary/20',
          isCriticalAndFresh && 'ring-2 ring-destructive/20'
        )}
      >
        {/* Nova divisão em 3 blocos: informação principal, status e ação.
            Isso reduz ruído visual e replica a leitura operacional rápida adotada nas telas piloto do admin. */}
        <div
          className="grid cursor-pointer gap-4 px-4 py-4 lg:grid-cols-[minmax(0,1.8fr)_minmax(240px,0.9fr)_minmax(180px,0.45fr)] lg:items-start"
          onClick={() => void openDetail(sale)}
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              void openDetail(sale);
            }
          }}
        >
          <div className="min-w-0 space-y-3">
            <div className="space-y-1.5">
              <p className="text-base font-semibold uppercase tracking-tight text-foreground">
                {sale.event_name}
              </p>
              <p className="text-sm text-muted-foreground">
                Comprador: <span className="font-medium text-foreground">{sale.customer_name}</span>
              </p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span>{createdAtLabel}</span>
                <span>•</span>
                <span className="font-medium text-foreground">{saleAmountLabel}</span>
                <span>•</span>
                <span>{createdAtRelativeLabel}</span>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="text-[11px] font-normal">
                {gateway}
              </Badge>
              <Badge variant="outline" className="text-[11px] font-normal">
                {paymentEnvironmentLabel}
              </Badge>
              {(isNewSale || isRecentSale) && (
                <Badge variant="outline" className="text-[11px] font-normal">
                  {freshness === 'novo' ? 'Novo' : 'Recente'}
                </Badge>
              )}
            </div>
            <p className={cn('text-[11px]', isCriticalAndFresh ? 'font-medium text-destructive' : 'text-muted-foreground')}>
              {freshnessPresentation.label}
            </p>
          </div>

          <div className="min-w-0 space-y-3 border-t border-border/60 pt-3 lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
            {/* Padronização de status: apenas um badge principal aparece na visão resumida.
                Os detalhes complementares ficam em texto curto e os dados técnicos descem para o accordion.
                Status técnico e prioridade operacional não são a mesma coisa: o primeiro explica o estado,
                o segundo só informa urgência de triagem. */}
            <div className="flex items-center gap-2">
              <span className={cn('h-2.5 w-2.5 rounded-full', statusTone.dot)} />
              <Badge variant="outline" className={cn('text-xs font-medium', statusTone.badge)}>
                {primaryStatusLabel}
              </Badge>
            </div>
            <div className="space-y-1">
              <p className="text-lg font-semibold leading-none text-foreground">{secondaryStatusLabel}</p>
              <p className="text-sm text-muted-foreground">{paymentStatus.label}</p>
              <p className="text-xs leading-relaxed text-muted-foreground">{operational.operationalDetail}</p>
            </div>
          </div>

          <div className="min-w-0 space-y-3 border-t border-border/60 pt-3 lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
            {/* A antiga coluna "Controle" saiu da visão principal porque misturava leitura operacional com detalhe técnico.
                A ação agora é objetiva e o restante fica recolhido no accordion abaixo. */}
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Prioridade operacional</p>
              <Badge variant="outline" className={cn('w-fit text-xs font-medium', statusTone.badge)}>
                {priorityPresentation.label}
              </Badge>
              <p className="text-sm font-semibold text-foreground">{priorityPresentation.actionLabel}</p>
              <p className="text-xs leading-relaxed text-muted-foreground">{priorityPresentation.actionDescription}</p>
            </div>
            <div className="flex justify-start lg:justify-end" onClick={(event) => event.stopPropagation()}>
              <ActionsDropdown actions={actions} />
            </div>
          </div>
        </div>

        {/* Os dados técnicos ficam em accordion fechado por padrão para preservar leitura em 3 segundos.
            Assim o operador vê primeiro o essencial e expande somente quando precisar auditar a venda. */}
        <Accordion type="single" collapsible>
          <AccordionItem value={`sale-${sale.id}`} className="border-t border-border/70 px-4">
            <AccordionTrigger className="py-3 text-sm font-medium text-muted-foreground hover:no-underline">
              <span>Ver detalhes técnicos e trilha operacional</span>
            </AccordionTrigger>
            <AccordionContent className="pb-4">
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,0.9fr)]">
                <div className="space-y-2 rounded-lg border bg-background/80 p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Diagnóstico completo</p>
                  <p className="text-sm font-semibold leading-tight text-foreground">{operational.causeLabel}</p>
                  <p className="text-xs leading-relaxed text-muted-foreground">{operational.operationalDetail}</p>
                  <div className="space-y-1 text-xs text-muted-foreground">
                    <p>{operational.timeLabel} • {operational.timeDetail}</p>
                    <p>{operational.timeSourceLabel}</p>
                  </div>
                </div>

                <div className="space-y-3 rounded-lg border bg-background/80 p-3">
                  <div className="space-y-1">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Fluxo</p>
                    <span className={`flex items-center gap-1.5 text-sm font-medium ${flowStage.color}`}>
                      <FlowIcon className="h-4 w-4 shrink-0" />
                      <span>{flowStage.label}</span>
                    </span>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Pagamento</p>
                    <p className="text-sm text-foreground">{operational.paymentStatusLabel}</p>
                    {paymentStatus.detail && (
                      <p className="text-xs leading-relaxed text-muted-foreground">{paymentStatus.detail}</p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Status da venda</p>
                    <div className="pt-0.5"><StatusBadge status={sale.status} /></div>
                  </div>
                </div>

                <div className="space-y-3 rounded-lg border bg-background/80 p-3">
                  <div className="space-y-1">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Bloqueio</p>
                    <Badge variant={operational.lockVariant} className="text-xs whitespace-normal text-left">
                      {operational.lockLabel}
                    </Badge>
                    {lockStatus.detail && (
                      <p className="text-xs leading-relaxed text-muted-foreground">{lockStatus.detail}</p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Logs relevantes</p>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      Gateway: {gateway} • Ambiente: {paymentEnvironmentLabel}
                    </p>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      Tickets gerados: {sale.ticket_count ?? 0} • Assentos bloqueados: {sale.active_lock_count ?? 0}
                    </p>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      Contexto temporal: {freshnessPresentation.description}
                    </p>
                  </div>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    );
  };

  const renderSalesGroup = (entries: typeof visibleSalesWithOperationalView, title?: string) => (
    <div className="space-y-3">
      {title && (
        <div
          className={cn(
            'flex items-center justify-between rounded-lg border px-4 py-3',
            title === 'Críticos' ? 'border-destructive/30 bg-destructive/5' : 'bg-muted/30'
          )}
        >
          <span className="text-sm font-semibold text-foreground">{title}</span>
          <Badge variant="outline" className="text-xs">{entries.length} item(ns)</Badge>
        </div>
      )}
      {entries.map((entry) => renderSaleRow(entry))}
    </div>
  );

  return (
    <AdminLayout>
      <div className="page-container">
        <PageHeader
          title="Diagnóstico de Vendas"
          description="Ferramenta para análise de vendas, pagamentos e retorno das integrações do sistema."
          actions={(
            <Button
              type="button"
              variant="outline"
              onClick={() => void handleOpenTechnicalDiagnostic()}
              disabled={!activeCompanyId || !runtimePaymentEnvironment || !isRuntimePaymentEnvironmentReady}
              className="gap-2"
            >
              <Code className="h-4 w-4" />
              Executar diagnóstico técnico
            </Button>
          )}
        />

        <Card className="mb-4">
          <CardContent className="space-y-4 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                {activeCompany?.name && (
                  <Badge variant="outline" className="text-xs">
                    Empresa: {activeCompany.name}
                  </Badge>
                )}
                <Badge variant="outline" className="text-xs">
                  Ambiente: {runtimePaymentEnvironment
                    ? (runtimePaymentEnvironment === 'production' ? 'Produção' : 'Sandbox')
                    : 'Carregando...'}
                </Badge>
                <Badge variant="outline" className="text-xs">
                  Ordenação: mais recentes primeiro
                </Badge>
                <Badge variant="outline" className="text-xs">
                  {filters.dateFrom || filters.dateTo ? 'Período filtrado' : 'Últimas 100 vendas'}
                </Badge>
                <Badge variant="outline" className="text-xs">
                  {sales.length} venda(s) carregada(s)
                </Badge>
                <Badge variant="outline" className="text-xs">
                  Atualizado às {lastUpdatedLabel}
                </Badge>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                <div className="flex items-center gap-2 rounded-md border px-3 py-2">
                  <Switch
                    checked={autoRefreshEnabled}
                    onCheckedChange={setAutoRefreshEnabled}
                    aria-label="Atualizar automaticamente"
                  />
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium text-foreground">Atualizar automaticamente</p>
                    <p className="text-xs text-muted-foreground">A cada 30 segundos</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 rounded-md border px-3 py-2">
                  <Switch
                    checked={groupByOperationalStatus}
                    onCheckedChange={setGroupByOperationalStatus}
                    aria-label="Agrupar por status"
                  />
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium text-foreground">Agrupar por status</p>
                    <p className="text-xs text-muted-foreground">Críticos, atenção e OK</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 rounded-md border px-3 py-2">
                  <Switch
                    checked={showOnlyProblems}
                    onCheckedChange={setShowOnlyProblems}
                    aria-label="Ver apenas problemas"
                  />
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium text-foreground">Ver apenas problemas</p>
                    <p className="text-xs text-muted-foreground">Oculta vendas estáveis e mostra apenas itens que exigem acompanhamento.</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-lg border bg-muted/20 p-3">
              {/* O resumo executivo transforma contagens já filtradas em frases humanas curtas.
                  Isso acelera a triagem sem criar inferência obscura ou lógica escondida fora da tela. */}
              <div className="space-y-1 text-sm text-foreground">
                {executiveSummaryMessages.map((message) => (
                  <p key={message}>{message}</p>
                ))}
              </div>
            </div>

            <div className="rounded-lg border bg-background p-3">
              <div className="space-y-1 text-sm text-foreground">
                {movementSummaryMessages.map((message) => (
                  <p key={message}>{message}</p>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{lastRelevantChangeDisplayLabel}</p>
            </div>

            <div className="flex flex-col gap-2 text-xs text-muted-foreground lg:flex-row lg:items-center lg:justify-between">
              <p>
                {isCompanyScopeRefreshing
                  ? 'Atualizando o diagnóstico da empresa ativa...'
                  : autoRefreshEnabled
                    ? 'Atualização automática ativa.'
                    : 'Atualização manual em modo estável.'}
              </p>
            </div>

            <div className={cn('rounded-md border px-3 py-2 text-sm', operationalBanner.tone)}>
              <p className="font-medium">{operationalBanner.title}</p>
              <p className="mt-1 text-xs opacity-90">Estrutura preparada para alertas futuros sem depender de backend novo nesta etapa.</p>
            </div>
          </CardContent>
        </Card>

        <div className="mb-6">
          {/* Mantém o mesmo espaçamento e hierarquia visual das demais telas administrativas. */}
          <FilterCard
            searchValue={filters.search}
            onSearchChange={(v) => setFilters((f) => ({ ...f, search: v }))}
            searchPlaceholder="Nome, CPF, ticket, ID exato da venda ou evento..."
            searchIcon={Search}
            selects={filterSelects}
            mainFilters={mainFilters}
            onClearFilters={() => {
              setFilters(initialFilters);
              toast.success('Filtros dependentes limpos com sucesso.');
            }}
            hasActiveFilters={hasActiveFilters}
          />
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          {[
            { value: 'todos', label: 'Todos' },
            { value: 'criticos', label: 'Críticos' },
            { value: 'novos', label: 'Novos' },
            { value: 'acompanhamento', label: 'Em acompanhamento' },
            { value: 'ok', label: 'OK' },
          ].map((option) => (
            <Button
              key={option.value}
              type="button"
              size="sm"
              variant={quickFocusFilter === option.value ? 'default' : 'outline'}
              onClick={() => setQuickFocusFilter(option.value as QuickFocusFilter)}
            >
              {option.label}
            </Button>
          ))}
        </div>

        {!loading && visibleSalesWithOperationalView.length > 0 && (
          <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {/* Os KPIs usam nomes humanos porque a camada de prioridade é a principal linguagem de triagem do operador. */}
            <StatsCard label="Total" value={visibleOperationalSummary.total} icon={Activity} />
            <StatsCard label="Críticas" value={visibleOperationalSummary.critico} icon={XCircle} variant="destructive" />
            <StatsCard label="Atenção" value={visibleOperationalSummary.atencao} icon={AlertTriangle} variant="warning" />
            <StatsCard label="OK" value={visibleOperationalSummary.ok} icon={CheckCircle} variant="success" />
            <StatsCard label="Pagas" value={visibleOperationalSummary.pago} icon={Ticket} variant="success" />
            <StatsCard label="Canceladas" value={visibleOperationalSummary.cancelado} icon={Clock} />
          </div>
        )}

        {isCompanyScopeRefreshing && !loading && (
          <div className="mb-4 text-xs text-muted-foreground">
            Atualizando o diagnóstico da empresa ativa...
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : visibleSalesWithOperationalView.length === 0 ? (
          <EmptyState
            icon={<Activity className="h-8 w-8 text-muted-foreground" />}
            title="Nenhuma venda encontrada"
            description={`Nenhuma venda encontrada para ${activeCompany?.name ?? 'a empresa ativa'} com os filtros atuais.`}
          />
        ) : (
          <div className="space-y-4">
            {groupByOperationalStatus
              ? groupedSalesWithOperationalView.map((group) => renderSalesGroup(group.entries, operationalGroupTitles[group.priority]))
              : renderSalesGroup(visibleSalesWithOperationalView)}
          </div>
        )}

        {/* Detail Modal */}
        <Dialog
          open={technicalDiagnosticOpen}
          onOpenChange={(open) => {
            setTechnicalDiagnosticOpen(open);
            if (!open) {
              setTechnicalDiagnosticSnapshot(null);
              setTechnicalDiagnosticLogs([]);
              setTechnicalDiagnosticSales([]);
              setTechnicalDiagnosticSaleLogs([]);
              setTechnicalDiagnosticDedupEntries([]);
            }
          }}
        >
          <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Code className="h-4 w-4" />
                Diagnóstico técnico de webhooks (v1)
              </DialogTitle>
            </DialogHeader>

            <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  Empresa: {technicalDiagnosticSnapshot?.companyName ?? '-'}
                </Badge>
                <Badge variant="outline" className="text-xs">
                  Ambiente: {formatPaymentEnvironmentLabel(technicalDiagnosticSnapshot?.paymentEnvironment ?? null)}
                </Badge>
                <Badge variant="outline" className="text-xs">
                  Execução: {technicalDiagnosticSnapshot?.executedAt
                    ? format(parseISO(technicalDiagnosticSnapshot.executedAt), "dd/MM/yyyy 'às' HH:mm:ss", { locale: ptBR })
                    : '-'}
                </Badge>
              </div>
            </div>

            {technicalDiagnosticLoading ? (
              <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando diagnóstico técnico do contexto ativo...
              </div>
            ) : (
              <Tabs defaultValue="resumo" className="flex-1 overflow-hidden flex flex-col">
                <TabsList className="w-full justify-start flex-shrink-0">
                  <TabsTrigger value="resumo">Resumo</TabsTrigger>
                  <TabsTrigger value="ambiente">Ambiente atual</TabsTrigger>
                  <TabsTrigger value="divergencias">Divergências</TabsTrigger>
                  <TabsTrigger value="logs">Logs recentes</TabsTrigger>
                </TabsList>

                <TabsContent value="resumo" className="flex-1 overflow-auto">
                  <ScrollArea className="h-full pr-4">
                    <div className="grid gap-3 pb-4 md:grid-cols-2 xl:grid-cols-3">
                      <Card>
                        <CardContent className="p-3 space-y-1">
                          <p className="text-xs text-muted-foreground">Status geral</p>
                          <p className={cn('text-lg font-semibold', formatTechnicalDiagnosticStatusTone(technicalDiagnosticStatus))}>
                            {formatTechnicalDiagnosticStatusLabel(technicalDiagnosticStatus)}
                          </p>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="p-3 space-y-1">
                          <p className="text-xs text-muted-foreground">Último webhook</p>
                          <p className="text-sm font-medium">{technicalDiagnosticLastWebhook?.event_type ?? 'Não encontrado no recorte'}</p>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="p-3 space-y-1">
                          <p className="text-xs text-muted-foreground">Tempo desde último evento</p>
                          <p className="text-sm font-medium">
                            {technicalDiagnosticLastEvent
                              ? formatDistanceToNowStrict(parseISO(technicalDiagnosticLastEvent.created_at), { addSuffix: true, locale: ptBR })
                              : 'Sem eventos no recorte'}
                          </p>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="p-3 space-y-1">
                          <p className="text-xs text-muted-foreground">Última falha relevante</p>
                          <p className="text-sm font-medium">
                            {technicalDiagnosticLastFailure?.incident_code ?? technicalDiagnosticLastFailure?.warning_code ?? technicalDiagnosticLastFailure?.processing_status ?? 'Nenhuma'}
                          </p>
                          <p className="text-xs text-muted-foreground line-clamp-2">{technicalDiagnosticLastFailure?.message ?? 'Sem falha relevante no recorte.'}</p>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="p-3 space-y-1">
                          <p className="text-xs text-muted-foreground">Divergências detectadas</p>
                          <p className="text-lg font-semibold">{technicalDiagnosticDivergences.length}</p>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="p-3 space-y-1">
                          <p className="text-xs text-muted-foreground">Logs analisados</p>
                          <p className="text-lg font-semibold">{technicalDiagnosticLogs.length}</p>
                          <p className="text-xs text-muted-foreground">sale_logs: {technicalDiagnosticSaleLogs.length} • dedup: {technicalDiagnosticDedupEntries.length}</p>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="p-3 space-y-1">
                          <p className="text-xs text-muted-foreground">Incidentes críticos</p>
                          <p className="text-lg font-semibold text-destructive">{technicalDiagnosticKpis.criticalIncidents}</p>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="p-3 space-y-1">
                          <p className="text-xs text-muted-foreground">Warnings</p>
                          <p className="text-lg font-semibold text-amber-600">{technicalDiagnosticKpis.warnings}</p>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="p-3 space-y-1">
                          <p className="text-xs text-muted-foreground">Duplicidades de webhook</p>
                          <p className="text-lg font-semibold">{technicalDiagnosticKpis.duplicateWebhooks}</p>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="p-3 space-y-1">
                          <p className="text-xs text-muted-foreground">Vendas com divergência</p>
                          <p className="text-lg font-semibold">{technicalDiagnosticKpis.salesWithDivergence}</p>
                          <p className="text-xs text-muted-foreground">Divergências totais: {technicalDiagnosticDivergences.length}</p>
                        </CardContent>
                      </Card>
                    </div>
                  </ScrollArea>
                </TabsContent>

                <TabsContent value="ambiente" className="flex-1 overflow-auto">
                  <ScrollArea className="h-full pr-4">
                    <div className="space-y-3 pb-4">
                      <h3 className="text-sm font-semibold">Último log de webhook no ambiente ativo</h3>
                      {technicalDiagnosticLastWebhook ? (
                        <div className="grid gap-3 md:grid-cols-2 text-sm">
                          <div><span className="text-muted-foreground">event_type</span><p className="font-mono text-xs">{technicalDiagnosticLastWebhook.event_type ?? '-'}</p></div>
                          <div><span className="text-muted-foreground">created_at</span><p>{format(parseISO(technicalDiagnosticLastWebhook.created_at), "dd/MM/yyyy 'às' HH:mm:ss", { locale: ptBR })}</p></div>
                          <div><span className="text-muted-foreground">external_reference</span><p className="font-mono text-xs break-all">{technicalDiagnosticLastWebhook.external_reference ?? '-'}</p></div>
                          <div><span className="text-muted-foreground">payment_id</span><p className="font-mono text-xs break-all">{technicalDiagnosticLastWebhook.payment_id ?? '-'}</p></div>
                          <div><span className="text-muted-foreground">sale_id</span><p className="font-mono text-xs break-all">{technicalDiagnosticLastWebhook.sale_id ?? '-'}</p></div>
                          <div><span className="text-muted-foreground">company_id</span><p className="font-mono text-xs break-all">{technicalDiagnosticLastWebhook.company_id ?? '-'}</p></div>
                          <div><span className="text-muted-foreground">payment_environment</span><p>{technicalDiagnosticLastWebhook.payment_environment ? formatPaymentEnvironmentLabel(technicalDiagnosticLastWebhook.payment_environment) : '-'}</p></div>
                          <div><span className="text-muted-foreground">processing_status</span><p>{technicalDiagnosticLastWebhook.processing_status}</p></div>
                          <div><span className="text-muted-foreground">result_category</span><p>{technicalDiagnosticLastWebhook.result_category ?? '-'}</p></div>
                          <div><span className="text-muted-foreground">http_status</span><p className="font-mono text-xs">{technicalDiagnosticLastWebhook.http_status ?? '-'}</p></div>
                          <div><span className="text-muted-foreground">duration_ms</span><p className="font-mono text-xs">{technicalDiagnosticLastWebhook.duration_ms ?? '-'}</p></div>
                          <div><span className="text-muted-foreground">incident_code</span><p className="font-mono text-xs">{technicalDiagnosticLastWebhook.incident_code ?? '-'}</p></div>
                          <div><span className="text-muted-foreground">warning_code</span><p className="font-mono text-xs">{technicalDiagnosticLastWebhook.warning_code ?? '-'}</p></div>
                          <div className="md:col-span-2"><span className="text-muted-foreground">message</span><p className="text-xs">{technicalDiagnosticLastWebhook.message}</p></div>
                          <div><span className="text-muted-foreground">environment_decision_source</span><p className="font-mono text-xs">{technicalDiagnosticLastWebhook.environment_decision_source ?? '-'}</p></div>
                          <div><span className="text-muted-foreground">environment_host_detected</span><p className="font-mono text-xs break-all">{technicalDiagnosticLastWebhook.environment_host_detected ?? '-'}</p></div>
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">Nenhum webhook persistido encontrado no recorte atual.</p>
                      )}
                    </div>
                  </ScrollArea>
                </TabsContent>

                <TabsContent value="divergencias" className="flex-1 overflow-auto">
                  <ScrollArea className="h-full pr-4">
                    <div className="space-y-3 pb-4">
                      <h3 className="text-sm font-semibold">Achados com regra explícita</h3>
                      {technicalDiagnosticDivergences.length === 0 ? (
                        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                          Nenhuma divergência encontrada no recorte atual.
                        </div>
                      ) : (
                        technicalDiagnosticDivergences.map((divergence) => (
                          <div
                            key={divergence.id}
                            className={cn(
                              'rounded-md border p-3',
                              divergence.severity === 'critical'
                                ? 'border-destructive/30 bg-destructive/5'
                                : 'border-amber-300 bg-amber-50'
                            )}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-semibold">{divergence.title}</p>
                              <Badge variant="outline" className="text-xs">
                                {divergence.severity === 'critical' ? 'Crítico' : 'Atenção'}
                              </Badge>
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">{divergence.detail}</p>
                            {divergence.saleId && (
                              <p className="mt-1 text-[11px] font-mono text-muted-foreground break-all">sale_id: {divergence.saleId}</p>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </ScrollArea>
                </TabsContent>

                <TabsContent value="logs" className="flex-1 overflow-auto">
                  <ScrollArea className="h-full pr-4">
                    <div className="space-y-2 pb-4">
                      <h3 className="text-sm font-semibold">Logs técnicos recentes (contexto ativo)</h3>
                      {technicalDiagnosticLogs.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Sem logs técnicos no recorte.</p>
                      ) : (
                        technicalDiagnosticLogs.map((log) => (
                          <div key={log.id} className="rounded-md border p-3 text-xs">
                            <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-4">
                              <p><span className="text-muted-foreground">horário:</span> {format(parseISO(log.created_at), "dd/MM HH:mm:ss", { locale: ptBR })}</p>
                              <p><span className="text-muted-foreground">origem:</span> {log.provider}</p>
                              <p><span className="text-muted-foreground">direção:</span> {log.direction}</p>
                              <p><span className="text-muted-foreground">event_type:</span> {log.event_type ?? '-'}</p>
                              <p><span className="text-muted-foreground">status:</span> {log.processing_status}</p>
                              <p><span className="text-muted-foreground">incident_code:</span> {log.incident_code ?? '-'}</p>
                              <p><span className="text-muted-foreground">warning_code:</span> {log.warning_code ?? '-'}</p>
                              <p><span className="text-muted-foreground">ambiente:</span> {log.payment_environment ? formatPaymentEnvironmentLabel(log.payment_environment) : '-'}</p>
                              <p className="break-all"><span className="text-muted-foreground">sale_id:</span> {log.sale_id ?? '-'}</p>
                              <p className="break-all"><span className="text-muted-foreground">company_id:</span> {log.company_id ?? '-'}</p>
                              <p className="break-all"><span className="text-muted-foreground">payment_id:</span> {log.payment_id ?? '-'}</p>
                              <p className="break-all"><span className="text-muted-foreground">external_reference:</span> {log.external_reference ?? '-'}</p>
                            </div>
                            <p className="mt-2 text-muted-foreground">message: {log.message}</p>
                          </div>
                        ))
                      )}
                    </div>
                  </ScrollArea>
                </TabsContent>
              </Tabs>
            )}
          </DialogContent>
        </Dialog>

        <Dialog open={!!detailSale} onOpenChange={(open) => !open && setDetailSale(null)}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-primary" />
                Diagnóstico da Venda
              </DialogTitle>
            </DialogHeader>

            {detailSale && (
              <Tabs defaultValue="resumo" className="flex-1 overflow-hidden flex flex-col">
                <TabsList className="w-full justify-start flex-shrink-0">
                  <TabsTrigger value="resumo">Resumo</TabsTrigger>
                  <TabsTrigger value="fluxo">Fluxo da Venda</TabsTrigger>
                  <TabsTrigger value="gateway">Gateway</TabsTrigger>
                  <TabsTrigger value="webhook">Webhook</TabsTrigger>
                  <TabsTrigger value="payloads">Payloads</TabsTrigger>
                </TabsList>

                {/* Tab 1 — Resumo */}
                <TabsContent value="resumo" className="flex-1 overflow-auto">
                  <ScrollArea className="h-full pr-4">
                    <div className="space-y-4 pb-4">
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <span className="text-muted-foreground">ID da venda</span>
                          <p className="font-mono text-xs break-all">{detailSale.id}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Empresa</span>
                          <p>{detailSale.company_name}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Evento</span>
                          <p>{detailSale.event_name}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Comprador</span>
                          <p>{detailSale.customer_name}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">CPF</span>
                          <p>{detailSale.customer_cpf}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Quantidade</span>
                          <p>{detailSale.quantity} passagem(ns)</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Valor total</span>
                          <p className="font-semibold">
                            {formatCurrencyBRL(detailSale.gross_amount ?? detailSale.quantity * detailSale.unit_price)}
                          </p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Data da compra</span>
                          <p>{format(parseISO(detailSale.created_at), "dd/MM/yyyy 'às' HH:mm:ss", { locale: ptBR })}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Gateway</span>
                          <p>{getGatewayDisplayLabel(computeGateway(detailSale))}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Status da venda</span>
                          <div className="mt-1"><StatusBadge status={detailSale.status} /></div>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Status do pagamento</span>
                          <Badge variant={computePaymentStatus(detailSale).variant} className="text-xs mt-1">
                            {computePaymentStatus(detailSale).label}
                          </Badge>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Origem da venda</span>
                          <p>{detailSale.sale_origin ?? '-'}</p>
                        </div>
                      </div>
                    </div>
                  </ScrollArea>
                </TabsContent>

                {/* Tab 2 — Fluxo da Venda */}
                <TabsContent value="fluxo" className="flex-1 overflow-auto">
                  <ScrollArea className="h-full pr-4">
                    <div className="space-y-3 pb-4">
                      <h3 className="text-sm font-semibold text-foreground">Linha do tempo da transação</h3>
                      {detailLoading ? (
                        <div className="flex items-center gap-2 text-muted-foreground text-sm py-4">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Carregando histórico...
                        </div>
                      ) : (() => {
                        const timeline = buildTimeline(detailSale, detailLogs);
                        return (
                          <div className="space-y-0">
                            {timeline.map((entry, i) => {
                              const EntryIcon = entry.icon;
                              return (
                                <div key={i} className="flex items-start gap-3 py-2">
                                  <div className="flex flex-col items-center">
                                    <EntryIcon className={`h-4 w-4 ${entry.color}`} />
                                    {i < timeline.length - 1 && (
                                      <div className="w-px h-full min-h-[16px] bg-border mt-1" />
                                    )}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm">{entry.label}</p>
                                    <p className="text-xs text-muted-foreground">{entry.time}</p>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}
                    </div>
                  </ScrollArea>
                </TabsContent>

                {/* Tab 3 — Gateway / Integração */}
                <TabsContent value="gateway" className="flex-1 overflow-auto">
                  <ScrollArea className="h-full pr-4">
                    <div className="space-y-4 pb-4">
                      <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                        <CreditCard className="h-4 w-4" />
                        Dados da Integração
                      </h3>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <span className="text-muted-foreground">Gateway utilizado</span>
                          <p>{getGatewayDisplayLabel(computeGateway(detailSale))}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Empresa vinculada</span>
                          <p>{detailCompany?.name ?? detailSale.company_name ?? '-'}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Conta Asaas (email)</span>
                          <p className="font-mono text-xs">{detailCompanyOperationalAsaas?.accountEmail ?? 'N/A'}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Wallet Asaas</span>
                          <p className="font-mono text-xs">{detailCompanyOperationalAsaas?.walletId ?? 'N/A'}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">ID Conta Asaas</span>
                          <p className="font-mono text-xs">{detailCompanyOperationalAsaas?.accountId ?? 'N/A'}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Ambiente operacional da venda</span>
                          <p className="font-mono text-xs">
                            {detailCompanyOperationalAsaas?.environment === 'production' ? 'Produção' : 'Sandbox'}
                          </p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">ID da cobrança no gateway</span>
                          <p className="font-mono text-xs break-all">
                            {detailSale.asaas_payment_id || '-'}
                          </p>
                        </div>
                        {detailSale.asaas_payment_status && (
                          <div>
                            <span className="text-muted-foreground">Status Asaas bruto</span>
                            <p className="font-mono text-xs">{detailSale.asaas_payment_status}</p>
                          </div>
                        )}
                        <div>
                          <span className="text-muted-foreground">Status taxa plataforma</span>
                          <p className="font-mono text-xs">{detailSale.platform_fee_status ?? '-'}</p>
                        </div>
                        {detailSale.platform_fee_total != null && (
                          <div>
                            <span className="text-muted-foreground">Taxa plataforma</span>
                            <p>{formatCurrencyBRL(detailSale.platform_fee_total)}</p>
                          </div>
                        )}
                        {detailSale.socio_fee_amount != null && (
                          <div>
                            <span className="text-muted-foreground">Comissão sócio</span>
                            <p>{formatCurrencyBRL(detailSale.socio_fee_amount)}</p>
                          </div>
                        )}
                      </div>
                      <div className="rounded-md border border-border bg-muted/50 p-3 text-xs text-muted-foreground">
                        <p>Logs técnicos de integração são persistidos em <code className="font-mono">sale_integration_logs</code> para rastreamento do webhook e payloads.</p>
                      </div>
                    </div>
                  </ScrollArea>
                </TabsContent>

                {/* Tab 4 — Webhook */}
                <TabsContent value="webhook" className="flex-1 overflow-auto">
                  <ScrollArea className="h-full pr-4">
                    {(() => {
                      const webhookLog = detailIntegrationLogs.find((log) => log.direction === 'incoming_webhook' && log.provider === 'asaas');
                      const webhookReceived = !!webhookLog;
                      const confirmationSource = detectPaymentConfirmationSource(detailSale, detailLogs, detailIntegrationLogs);
                      const fallbackWithoutWebhookLog = detailIntegrationLogs.find((log) => (
                        log.direction === 'manual_sync'
                        && log.provider === 'asaas'
                        && log.incident_code === 'webhook_not_observed_before_verify_confirmation'
                      ));
                      // Comentário de suporte: a aba agora separa ausência total de webhook
                      // do caso em que o fallback confirmou o pagamento sem evidência persistida.
                      const webhookDiagnosticState: WebhookDiagnosticState = webhookReceived
                        ? 'webhook_detected'
                        : (confirmationSource === 'on_demand' || fallbackWithoutWebhookLog)
                          ? 'fallback_without_webhook'
                          : 'not_identified';
                      const statusLabelMap: Record<SaleIntegrationLog['processing_status'], string> = {
                        received: 'Recebido',
                        ignored: 'Ignorado',
                        success: 'Sucesso',
                        partial_failure: 'Parcial',
                        failed: 'Falha',
                        unauthorized: 'Não autorizado',
                        duplicate: 'Duplicado',
                        rejected: 'Rejeitado',
                        warning: 'Aviso',
                      };

                      return (
                        <div className="space-y-4 pb-4">
                          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                            <Webhook className="h-4 w-4" />
                            Webhook do Pagamento
                          </h3>
                          <div className="grid grid-cols-2 gap-3 text-sm">
                            <div>
                              <span className="text-muted-foreground">Webhook persistido</span>
                              <p className={webhookReceived ? 'text-emerald-600 font-medium' : 'text-amber-600 font-medium'}>
                                {webhookReceived ? 'Encontrado' : 'Não encontrado'}
                              </p>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Origem da confirmação</span>
                              <p className="font-medium">
                                {confirmationSource === 'webhook' && 'Webhook'}
                                {confirmationSource === 'on_demand' && 'Verificação on-demand (verify-payment-status)'}
                                {confirmationSource === 'none' && 'Não identificada'}
                              </p>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Leitura diagnóstica</span>
                              <p className={`font-medium ${
                                webhookDiagnosticState === 'webhook_detected'
                                  ? 'text-emerald-600'
                                  : webhookDiagnosticState === 'fallback_without_webhook'
                                    ? 'text-amber-600'
                                    : 'text-muted-foreground'
                              }`}>
                                {webhookDiagnosticState === 'webhook_detected' && 'Webhook persistido e correlacionado'}
                                {webhookDiagnosticState === 'fallback_without_webhook' && 'Fallback confirmou sem evidência persistida de webhook'}
                                {webhookDiagnosticState === 'not_identified' && 'Sem webhook persistido e sem confirmação on-demand identificada'}
                              </p>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Ambiente persistido da venda</span>
                              <p className="font-medium">{formatPaymentEnvironmentLabel(detailSale.payment_environment)}</p>
                            </div>
                            {fallbackWithoutWebhookLog && (
                              <div className="col-span-2">
                                <span className="text-muted-foreground">Incidente de observabilidade</span>
                                <p className="font-mono text-xs break-all">{fallbackWithoutWebhookLog.incident_code}</p>
                                <p className="mt-1 text-xs text-muted-foreground">{fallbackWithoutWebhookLog.message}</p>
                              </div>
                            )}
                            {webhookLog && (
                              <>
                                <div>
                                  <span className="text-muted-foreground">Ambiente no log técnico</span>
                                  <p className="font-medium">{formatPaymentEnvironmentLabel(webhookLog.payment_environment)}</p>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Origem da decisão</span>
                                  <p className="font-mono text-xs">{webhookLog.environment_decision_source ?? '-'}</p>
                                </div>
                                <div className="col-span-2">
                                  <span className="text-muted-foreground">Host detectado na decisão</span>
                                  <p className="font-mono text-xs break-all">{webhookLog.environment_host_detected ?? '-'}</p>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Data do webhook</span>
                                  <p>{format(parseISO(webhookLog.created_at), "dd/MM/yyyy 'às' HH:mm:ss", { locale: ptBR })}</p>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Tipo do evento</span>
                                  <p className="font-mono text-xs">{webhookLog.event_type ?? '-'}</p>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Status bruto do Asaas</span>
                                  <p className="font-mono text-xs">{String((webhookLog.payload_json as { payment?: { status?: string } } | null)?.payment?.status ?? '-')}</p>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Status do processamento</span>
                                  <p className="font-medium">{statusLabelMap[webhookLog.processing_status] ?? webhookLog.processing_status}</p>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Mensagem técnica</span>
                                  <p className="text-xs">{webhookLog.message}</p>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">HTTP retornado</span>
                                  <p className="font-mono text-xs">{webhookLog.http_status ?? '-'}</p>
                                </div>
                              </>
                            )}
                          </div>
                          {webhookDiagnosticState !== 'webhook_detected' && (
                            <div className={`rounded-md border p-3 text-xs ${
                              webhookDiagnosticState === 'fallback_without_webhook'
                                ? 'border-amber-200 bg-amber-50 text-amber-900'
                                : 'border-border bg-muted/50 text-muted-foreground'
                            }`}>
                              {webhookDiagnosticState === 'fallback_without_webhook' ? (
                                <p>Webhook persistido não encontrado até o momento da confirmação. A venda foi confirmada por verificação on-demand e o sistema registrou a anomalia de observabilidade para suporte.</p>
                              ) : (
                                <p>Nenhum log técnico de webhook ou confirmação on-demand foi identificado para esta venda.</p>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </ScrollArea>
                </TabsContent>

                {/* Tab 5 — Payloads Técnicos */}
                <TabsContent value="payloads" className="flex-1 overflow-auto">
                  <ScrollArea className="h-full pr-4">
                    <div className="space-y-4 pb-4">
                      <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                        <FileJson className="h-4 w-4" />
                        Payloads Técnicos
                      </h3>

                      {/* Causa do runtime: estes blocos já usavam o Collapsible padrão do projeto,
                          mas o arquivo ficou sem importar os símbolos necessários. */}
                      {/* Raw sale data */}
                      <Collapsible>
                        <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium hover:text-primary transition-colors w-full">
                          <ChevronDown className="h-4 w-4 transition-transform [[data-state=open]>&]:rotate-180" />
                          Ver dados brutos da venda
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <pre className="mt-2 rounded-md border border-border bg-muted/50 p-3 text-xs font-mono overflow-auto max-h-64">
                            {JSON.stringify(
                              (() => {
                                const safe = { ...(detailSale as unknown as Record<string, unknown>) };
                                // Remove sensitive/internal fields
                                delete safe.event;
                                delete safe.company;
                                return safe;
                              })(),
                              null,
                              2
                            )}
                          </pre>
                        </CollapsibleContent>
                      </Collapsible>

                      {/* Mantemos o padrão consolidado já usado no admin/public em vez de trocar a UI. */}
                      {/* Sale logs */}
                      <Collapsible>
                        <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium hover:text-primary transition-colors w-full">
                          <ChevronDown className="h-4 w-4 transition-transform [[data-state=open]>&]:rotate-180" />
                          Ver logs da venda ({detailLogs.length})
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          {detailLogs.length === 0 ? (
                            <p className="mt-2 text-xs text-muted-foreground">Nenhum log registrado para esta venda.</p>
                          ) : (
                            <pre className="mt-2 rounded-md border border-border bg-muted/50 p-3 text-xs font-mono overflow-auto max-h-64">
                              {JSON.stringify(detailLogs, null, 2)}
                            </pre>
                          )}
                        </CollapsibleContent>
                      </Collapsible>

                      <Collapsible>
                        <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium hover:text-primary transition-colors w-full">
                          <ChevronDown className="h-4 w-4 transition-transform [[data-state=open]>&]:rotate-180" />
                          Ver logs técnicos de integração ({detailIntegrationLogs.length})
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          {detailIntegrationLogs.length === 0 ? (
                            <p className="mt-2 text-xs text-muted-foreground">Nenhum log técnico encontrado para esta venda.</p>
                          ) : (
                            <pre className="mt-2 rounded-md border border-border bg-muted/50 p-3 text-xs font-mono overflow-auto max-h-64">
                              {JSON.stringify(detailIntegrationLogs, null, 2)}
                            </pre>
                          )}
                        </CollapsibleContent>
                      </Collapsible>
                    </div>
                  </ScrollArea>
                </TabsContent>
              </Tabs>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
