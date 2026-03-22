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
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
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
  ChevronDown,
  Webhook,
  Code,
  FileJson,
  Copy,
  RefreshCw,
  ExternalLink,
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
  message: string;
  payload_json: Record<string, unknown> | null;
  response_json: Record<string, unknown> | null;
  payment_environment: 'sandbox' | 'production' | null;
  environment_decision_source: 'sale' | 'request' | 'host' | null;
  environment_host_detected: string | null;
  created_at: string;
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

interface DiagnosticOperationalView {
  category: OperationalCategory;
  categoryLabel: string;
  categoryVariant: 'default' | 'secondary' | 'destructive' | 'outline';
  categoryClassName?: string;
  priority: number;
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

function computeGateway(sale: DiagnosticSale): string {
  if (sale.asaas_payment_id) return 'Asaas';
  if (sale.stripe_checkout_session_id || sale.stripe_payment_intent_id) return 'Stripe';
  if (sale.sale_origin === 'admin_manual' || sale.sale_origin === 'seller_manual') return 'Manual';
  return 'Manual';
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

  if (sale.asaas_payment_id || sale.stripe_checkout_session_id || sale.stripe_payment_intent_id) {
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

  // A causa principal é mutuamente exclusiva: a função retorna no primeiro cenário dominante.
  // Isso evita que a linha traga duas narrativas conflitantes e preserva uma leitura operacional confiável.
  if (sale.status === 'pago') {
    return {
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
    };
  }

  if (sale.status === 'cancelado') {
    const cancelledByExpiry = (sale.cancel_reason ?? '').toLowerCase().includes('expir');
    return {
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
    };
  }

  if (hasGatewayDivergence) {
    return {
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
    };
  }

  if (paymentStatus.label === 'Pagamento expirado' || paymentStatus.label === 'Pagamento cancelado' || paymentStatus.label === 'Pagamento estornado') {
    return {
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
    };
  }

  if (isPendingCheckout) {
    if (lockStatus.isExpired) {
      return {
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
      };
    }

    if (lockStatus.isMissing) {
      return {
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
      };
    }

    if (lockStatus.isPartial) {
      return {
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
      };
    }

    return {
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
    };
  }

  if (isReserved) {
    // Reservas manuais em `reservado` não devem aparecer como falha por padrão.
    // Aqui só elevamos o caso para atenção ou divergência quando a validade própria venceu
    // ou quando surgem sinais concretos de inconsistência entre pagamento e banco.
    if (isManualReservation) {
      if (manualReservationExpired) {
        return {
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
        };
      }

      return {
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
      };
    }

    if (lockStatus.isExpired) {
      return {
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
      };
    }

    if (lockStatus.isMissing) {
      return {
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
      };
    }

    return {
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
    };
  }

  return {
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
  };
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
  if (sale.asaas_payment_id || sale.stripe_checkout_session_id) {
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

  // 1. Sale created
  entries.push({
    time: format(parseISO(sale.created_at), 'HH:mm:ss', { locale: ptBR }),
    label: 'Venda criada',
    icon: Clock,
    color: 'text-muted-foreground',
  });

  // 2. Gateway charge sent
  const gateway = computeGateway(sale);
  if (gateway !== 'Manual' && (sale.asaas_payment_id || sale.stripe_checkout_session_id)) {
    entries.push({
      time: format(parseISO(sale.created_at), 'HH:mm:ss', { locale: ptBR }),
      label: `Cobrança enviada ao ${gateway}`,
      icon: CreditCard,
      color: 'text-blue-600',
    });
  }

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
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [newSaleIds, setNewSaleIds] = useState<string[]>([]);
  const latestSalesRequestIdRef = useRef(0);
  const latestEventsRequestIdRef = useRef(0);
  const previousCompanyIdRef = useRef<string | null>(null);
  const previousRenderedSaleIdsRef = useRef<string[]>([]);

  // Detail modal
  const [detailSale, setDetailSale] = useState<DiagnosticSale | null>(null);
  const [detailLogs, setDetailLogs] = useState<SaleLog[]>([]);
  const [detailIntegrationLogs, setDetailIntegrationLogs] = useState<SaleIntegrationLog[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
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
      .map((sale) => ({ sale, operational: computeOperationalView(sale) }))
      .sort((a, b) => {
        // Correção operacional: a ordenação padrão precisa ser previsível e sempre começar
        // pela venda mais recente. A prioridade passa a ser apenas critério secundário.
        const createdAtDiff = new Date(b.sale.created_at).getTime() - new Date(a.sale.created_at).getTime();
        if (createdAtDiff !== 0) {
          return createdAtDiff;
        }

        return a.operational.priority - b.operational.priority;
      });
  }, [sales]);

  const visibleSalesWithOperationalView = useMemo(() => {
    if (!showOnlyProblems) return salesWithOperationalView;

    return salesWithOperationalView.filter((entry) => (
      entry.operational.category === 'divergencia' || entry.operational.category === 'atencao'
    ));
  }, [salesWithOperationalView, showOnlyProblems]);

  const visibleOperationalSummary = useMemo(() => {
    return visibleSalesWithOperationalView.reduce((acc, entry) => {
      acc.total += 1;
      if (entry.operational.category === 'saudavel') acc.saudavel += 1;
      if (entry.operational.category === 'atencao') acc.atencao += 1;
      if (entry.operational.category === 'divergencia') acc.problema += 1;
      if (entry.operational.category === 'pago') acc.pago += 1;
      if (entry.operational.category === 'cancelado') acc.cancelado += 1;
      return acc;
    }, { total: 0, saudavel: 0, atencao: 0, problema: 0, pago: 0, cancelado: 0 });
  }, [visibleSalesWithOperationalView]);

  const groupedSalesWithOperationalView = useMemo(() => {
    const groupedEntries = new Map<OperationalCategory, typeof visibleSalesWithOperationalView>();
    const orderedCategories: OperationalCategory[] = ['divergencia', 'atencao', 'saudavel', 'pago', 'cancelado'];

    orderedCategories.forEach((category) => {
      groupedEntries.set(category, []);
    });

    visibleSalesWithOperationalView.forEach((entry) => {
      groupedEntries.get(entry.operational.category)?.push(entry);
    });

    return orderedCategories
      .map((category) => ({
        category,
        entries: groupedEntries.get(category) ?? [],
      }))
      .filter((group) => group.entries.length > 0);
  }, [visibleSalesWithOperationalView]);

  const lastUpdatedLabel = useMemo(() => {
    if (!lastUpdatedAt) return 'Aguardando primeira atualização';
    return format(parseISO(lastUpdatedAt), "HH:mm:ss", { locale: ptBR });
  }, [lastUpdatedAt]);

  const systemFeedbackMessage = useMemo(() => {
    if (visibleOperationalSummary.problema > 0) {
      return `${visibleOperationalSummary.problema} venda(s) com divergência nas últimas atualizações.`;
    }

    if (visibleOperationalSummary.atencao > 0) {
      return `${visibleOperationalSummary.atencao} venda(s) em atenção no monitoramento atual.`;
    }

    if (visibleOperationalSummary.total > 0) {
      return 'Nenhum problema encontrado nas últimas vendas carregadas.';
    }

    return 'Aguardando vendas dentro do escopo operacional atual.';
  }, [visibleOperationalSummary]);

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
    if (autoRefreshEnabled) {
      const previousSaleIds = previousRenderedSaleIdsRef.current;
      const incomingSaleIds = currentSaleIds.filter((saleId) => !previousSaleIds.includes(saleId));
      setNewSaleIds(incomingSaleIds);
    } else {
      setNewSaleIds([]);
    }

    previousRenderedSaleIdsRef.current = currentSaleIds;
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
        ...(availableGateways.includes('stripe') ? [{ value: 'stripe', label: 'Stripe' }] : []),
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

  const operationalGroupTitles: Record<OperationalCategory, string> = {
    divergencia: 'Com divergência',
    atencao: 'Atenção',
    saudavel: 'Saudáveis',
    pago: 'Pagas',
    cancelado: 'Canceladas',
  };

  const renderSaleRow = ({ sale, operational }: { sale: DiagnosticSale; operational: DiagnosticOperationalView }) => {
    const gateway = computeGateway(sale);
    const paymentStatus = computePaymentStatus(sale);
    const lockStatus = computeLockStatus(sale);
    const flowStage = computeFlowStage(sale);
    const FlowIcon = flowStage.icon;
    const compactFlowLabel = computeCompactFlowLabel(flowStage.label);
    const createdAtLabel = format(parseISO(sale.created_at), "dd/MM/yy 'às' HH:mm", { locale: ptBR });
    const createdAtRelativeLabel = formatDistanceToNowStrict(parseISO(sale.created_at), {
      addSuffix: true,
      locale: ptBR,
    });
    const saleAmountLabel = formatCurrencyBRL(sale.gross_amount ?? sale.quantity * sale.unit_price);
    const paymentEnvironmentLabel = sale.payment_environment === 'production' ? 'Produção' : 'Sandbox';

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

    const isNewSale = autoRefreshEnabled && newSaleIds.includes(sale.id);

    return (
      <TableRow
        key={sale.id}
        className={cn(
          'border-l-4 transition-colors',
          operational.category === 'divergencia' && 'border-l-destructive bg-destructive/5',
          operational.category === 'atencao' && 'border-l-amber-400 bg-amber-50/50',
          operational.category === 'saudavel' && 'border-l-transparent',
          operational.category === 'pago' && 'border-l-emerald-400 bg-emerald-50/40',
          operational.category === 'cancelado' && 'border-l-zinc-300 bg-zinc-50/40'
        )}
      >
        <TableCell className="py-5 align-top">
          <div className="space-y-3">
            <div className="space-y-1">
              <p className="text-sm font-semibold uppercase tracking-tight text-foreground">
                {sale.event_name}
              </p>
              <p className="text-sm text-muted-foreground">
                Comprador: <span className="font-medium text-foreground">{sale.customer_name}</span>
              </p>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">
                  {createdAtLabel} • {saleAmountLabel}
                </p>
                <p className="text-xs font-medium text-foreground">
                  {createdAtRelativeLabel}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="text-xs">
                {gateway}
              </Badge>
              <Badge variant="outline" className="text-xs">
                {paymentEnvironmentLabel}
              </Badge>
              {isNewSale && (
                <Badge className="text-xs">Nova</Badge>
              )}
            </div>
          </div>
        </TableCell>

        <TableCell className="py-5 align-top">
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <StatusBadge status={sale.status} />
              <Badge variant={paymentStatus.variant} className="text-xs">
                {operational.paymentStatusLabel}
              </Badge>
              <Badge variant={operational.categoryVariant} className={`text-xs ${operational.categoryClassName ?? ''}`}>
                {operational.categoryLabel}
              </Badge>
              {operational.hasGatewayDivergence && (
                <Badge variant="destructive" className="text-xs">Divergência gateway</Badge>
              )}
            </div>

            <div className="space-y-1">
              <p className="text-sm font-semibold leading-tight">{operational.operationalLabel}</p>
              <p className="text-xs text-muted-foreground">
                Venda: {operational.saleStatusLabel} • Pagamento: {paymentStatus.detail ?? operational.paymentStatusLabel}
              </p>
              <p className="text-xs leading-relaxed text-muted-foreground">{operational.operationalDetail}</p>
            </div>
          </div>
        </TableCell>

        <TableCell className="py-5 align-top">
          <div className="space-y-2">
            <p className="text-sm font-semibold leading-tight text-foreground">{operational.causeLabel}</p>
            <p className="text-sm leading-relaxed text-muted-foreground">
              <span className="font-medium text-foreground">Ação sugerida:</span> {operational.actionLabel}
            </p>
            <div className="space-y-1 text-xs text-muted-foreground">
              <p>{operational.timeLabel} • {operational.timeDetail}</p>
              <p>{operational.timeSourceLabel}</p>
            </div>
          </div>
        </TableCell>

        <TableCell className="py-5 align-top">
          <div className="space-y-3">
            <div className="space-y-1">
              <Badge variant={operational.lockVariant} className="text-xs whitespace-normal text-left">
                {operational.lockLabel}
              </Badge>
              {lockStatus.detail && (
                <p className="text-xs leading-relaxed text-muted-foreground">{lockStatus.detail}</p>
              )}
            </div>

            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Fluxo</p>
              <span className={`flex items-center gap-1.5 text-sm ${flowStage.color}`}>
                <FlowIcon className="h-3.5 w-3.5 shrink-0" />
                <span>{compactFlowLabel}</span>
              </span>
            </div>
          </div>
        </TableCell>

        <TableCell className="py-5 align-top">
          <ActionsDropdown actions={actions} />
        </TableCell>
      </TableRow>
    );
  };

  return (
    <AdminLayout>
      <div className="page-container">
        <PageHeader
          title="Diagnóstico de Vendas"
          description="Ferramenta para análise de vendas, pagamentos e retorno das integrações do sistema."
        />

        <Card className="mb-4">
          <CardContent className="space-y-4 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
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

              <div className="flex flex-wrap items-center gap-3">
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
                    <p className="text-xs text-muted-foreground">Mantém a ordem por data dentro do grupo</p>
                  </div>
                </div>

                <Button
                  variant={showOnlyProblems ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setShowOnlyProblems((current) => !current)}
                >
                  {showOnlyProblems ? 'Mostrar todos' : 'Ver apenas problemas'}
                </Button>
              </div>
            </div>

            <div className="flex flex-col gap-2 text-xs text-muted-foreground lg:flex-row lg:items-center lg:justify-between">
              <p>{systemFeedbackMessage}</p>
              <p>
                {isCompanyScopeRefreshing
                  ? 'Atualizando o diagnóstico da empresa ativa...'
                  : autoRefreshEnabled
                    ? 'Atualização automática ativa.'
                    : 'Atualização manual em modo estável.'}
              </p>
            </div>

            <div className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
              Espaço reservado para alertas em tempo real e integração futura com stream de webhook/log.
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

        {!loading && visibleSalesWithOperationalView.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
            <StatsCard label="Total" value={visibleOperationalSummary.total} icon={Activity} />
            <StatsCard label="Pendentes saudáveis" value={visibleOperationalSummary.saudavel} icon={CheckCircle} variant="success" />
            <StatsCard label="Pendentes atenção" value={visibleOperationalSummary.atencao} icon={AlertTriangle} variant="warning" />
            <StatsCard label="Com divergência" value={visibleOperationalSummary.problema} icon={XCircle} variant="destructive" />
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
          <Card>
            <CardContent className="p-0">
              <Table className="table-fixed">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[29%] min-w-[280px]">Venda</TableHead>
                    <TableHead className="w-[24%] min-w-[240px]">Status</TableHead>
                    <TableHead className="w-[25%] min-w-[240px]">Diagnóstico</TableHead>
                    <TableHead className="w-[16%] min-w-[170px]">Controle</TableHead>
                    <TableHead className="w-[76px]">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                {groupByOperationalStatus ? (
                  groupedSalesWithOperationalView.map((group) => (
                    <TableBody key={group.category}>
                      <TableRow className="bg-muted/40">
                        <TableCell colSpan={5} className="py-3">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-semibold text-foreground">
                              {operationalGroupTitles[group.category]}
                            </span>
                            <Badge variant="outline" className="text-xs">
                              {group.entries.length} item(ns)
                            </Badge>
                          </div>
                        </TableCell>
                      </TableRow>
                      {group.entries.map((entry) => renderSaleRow(entry))}
                    </TableBody>
                  ))
                ) : (
                  <TableBody>
                    {visibleSalesWithOperationalView.map((entry) => renderSaleRow(entry))}
                  </TableBody>
                )}
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Detail Modal */}
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
                          <p>{computeGateway(detailSale)}</p>
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
                          <p>{computeGateway(detailSale)}</p>
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
                            {detailSale.asaas_payment_id || detailSale.stripe_payment_intent_id || detailSale.stripe_checkout_session_id || '-'}
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
                              <span className="text-muted-foreground">Webhook recebido</span>
                              <p className={webhookReceived ? 'text-emerald-600 font-medium' : 'text-amber-600 font-medium'}>
                                {webhookReceived ? 'Sim' : 'Não detectado'}
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
                              <span className="text-muted-foreground">Ambiente persistido da venda</span>
                              <p className="font-medium">{formatPaymentEnvironmentLabel(detailSale.payment_environment)}</p>
                            </div>
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
                          {!webhookReceived && (
                            <div className="rounded-md border border-border bg-muted/50 p-3 text-xs text-muted-foreground">
                              {confirmationSource === 'on_demand' ? (
                                <p>Nenhum log de webhook encontrado, mas o pagamento foi confirmado por verificação on-demand.</p>
                              ) : (
                                <p>Nenhum log técnico de webhook encontrado para esta venda.</p>
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
