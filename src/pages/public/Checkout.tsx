import { useState, useEffect, useMemo, useCallback } from "react";
import {
  useParams,
  useNavigate,
  useSearchParams,
  Link,
} from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Event, Trip, BoardingLocation, Seat } from "@/types/database";
import { calculateFees, calculatePlatformFeeTotal, type EventFeeInput } from "@/lib/feeCalculator";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { EventSummaryCard } from "@/components/public/EventSummaryCard";
import { SeatMap } from "@/components/public/SeatMap";
import {
  EventTermsAcceptanceCard,
  type PublicEventTerm,
} from "@/components/public/EventTermsAcceptanceCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  MapPin,
  Clock,
  Loader2,
  ArrowLeft,
  User,
  Ticket,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { formatCurrencyBRL } from "@/lib/currency";
import { getTripSeatOccupancyRpc } from "@/lib/tripSeatOccupancyRpc";
import { formatPhoneBR } from "@/lib/phone";
import { useRuntimePaymentEnvironment } from "@/hooks/use-runtime-payment-environment";
import {
  BENEFIT_PRICING_RULE_VERSION,
  resolvePassengerBenefitPrice,
} from "@/lib/benefitEligibility";
import {
  CHECKOUT_RESPONSIBILITY_HELPER_TEXT,
  CHECKOUT_RESPONSIBILITY_VALIDATION_MESSAGE,
  getCheckoutResponsibilityAcceptanceLabel,
} from "@/lib/intermediationPolicy";

// ---- CPF validation helpers ----
function isValidCpf(cpf: string): boolean {
  const digits = cpf.replace(/\D/g, "");
  if (digits.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(digits[i]) * (10 - i);
  let rest = (sum * 10) % 11;
  if (rest === 10) rest = 0;
  if (rest !== parseInt(digits[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(digits[i]) * (11 - i);
  rest = (sum * 10) % 11;
  if (rest === 10) rest = 0;
  return rest === parseInt(digits[10]);
}

function formatCpfMask(value: string): string {
  const d = value.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

// Comentário: formatPhoneMask substituído por formatPhoneBR de @/lib/phone.ts (fonte única de verdade).
const formatPhoneMask = formatPhoneBR;

// Comentário P0: generateSeatLayout removido. Assentos devem ser materializados no banco via
// sincronização do layout_snapshot em /admin/frota. O checkout nunca cria assentos localmente.

// ---- Passenger data type ----
interface PassengerData {
  name: string;
  cpf: string;
  phone: string;
  ticket_type_id: string;
  ticket_type_name: string;
  ticket_type_price: number;
}

interface EventTicketType {
  id: string;
  name: string;
  price: number;
  is_active: boolean;
}

interface CheckoutEventCompany {
  name?: string | null;
  trade_name?: string | null;
}

type CheckoutEvent = Event & { company?: CheckoutEventCompany | null };

interface EventTicketTypeRow {
  id: string;
  name: string;
  price: number | string | null;
  is_active: boolean | null;
}

interface EventCategoryPriceRow {
  category: string;
  price: number | string | null;
}

interface EventTermLinkRow {
  id: string;
  company_id: string;
  event_id: string;
  term_id: string;
  term_version_id: string;
  selection_mode: string | null;
  acceptance_required: boolean | null;
}

interface CompanyTermVersionRow {
  id: string;
  company_id: string;
  term_id: string;
  version_number: number | string | null;
  title: string;
  term_type: string;
  content: string;
  content_hash: string | null;
  summary: string | null;
  status: string | null;
  published_at: string | null;
}

interface CheckoutErrorWithContext {
  context?: {
    json?: () => Promise<unknown>;
  };
}

interface PassengerBenefitSnapshot {
  benefit_program_id: string | null;
  benefit_program_name: string | null;
  benefit_type: "percentual" | "valor_fixo" | "preco_final" | null;
  benefit_value: number | null;
  original_price: number;
  discount_amount: number;
  final_price: number;
  benefit_applied: boolean;
  pricing_rule_version: string;
}

type PaymentMethod = "pix" | "credit_card";

type PaymentCheckoutStatus = "idle" | "preparing" | "popup_blocked" | "error";

function renderPaymentPreparingTab(tab: Window) {
  // Comentário de suporte: evita aba "about:blank" sem contexto enquanto aguardamos a URL final do Asaas.
  tab.document.title = "Preparando cobrança...";
  tab.document.body.innerHTML = `
    <div style="min-height:100vh;margin:0;display:flex;align-items:center;justify-content:center;background:#f5f5f5;color:#475569;font-family:system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;text-align:center;padding:24px;">
      <div>
        <div style="width:44px;height:44px;margin:0 auto 14px;border:4px solid #e2e8f0;border-top-color:#f97316;border-radius:9999px;animation:smartbus-spin 0.9s linear infinite;"></div>
        <h1 style="margin:0 0 8px;font-size:20px;color:#0f172a;">Preparando sua cobrança</h1>
        <p style="margin:0;font-size:15px;line-height:1.5;">Estamos carregando a fatura do Asaas.<br />Isso pode levar alguns segundos. Não feche esta aba.</p>
      </div>
    </div>
    <style>@keyframes smartbus-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }</style>
  `;
}

function isPassengerComplete(p: PassengerData): boolean {
  const rawCpf = p.cpf.replace(/\D/g, "");
  return (
    p.name.trim().length >= 3 && rawCpf.length === 11 && isValidCpf(rawCpf)
  );
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

function maskCpfForLog(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length <= 4) return "***";
  return `***${digits.slice(-4)}`;
}

const CHECKOUT_FALLBACK_TICKET_TYPE_ID = "__default_base_type__";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUuid(value: string | null | undefined): boolean {
  return Boolean(value && UUID_PATTERN.test(value));
}

function resolvePersistedTicketTypeId(value: string | null | undefined): string | null {
  // Comentário de segurança: o tipo padrão do checkout é apenas estado visual/local;
  // no banco `ticket_type_id` é UUID nullable, então fallbacks sintéticos viram null.
  return isValidUuid(value) ? value! : null;
}

function resolveTicketTypeOriginForLog(value: string | null | undefined):
  | "real_uuid"
  | "fallback_base_type"
  | "empty"
  | "invalid_non_uuid" {
  if (!value) return "empty";
  if (value === CHECKOUT_FALLBACK_TICKET_TYPE_ID) return "fallback_base_type";
  return isValidUuid(value) ? "real_uuid" : "invalid_non_uuid";
}

function maskPhoneForLog(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length <= 4) return "***";
  return `***${digits.slice(-4)}`;
}

function getMissingPassengerFields(passenger: PassengerData): string[] {
  const missing: string[] = [];
  const cpfDigits = passenger.cpf.replace(/\D/g, "");

  if (!passenger.name.trim() || passenger.name.trim().length < 3) {
    missing.push("passenger_name");
  }

  if (cpfDigits.length !== 11 || !isValidCpf(cpfDigits)) {
    missing.push("passenger_cpf");
  }

  if (!passenger.ticket_type_name?.trim()) {
    missing.push("ticket_type_name");
  }

  if (!Number.isFinite(Number(passenger.ticket_type_price))) {
    missing.push("ticket_type_price");
  }

  return missing;
}

export default function Checkout() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const tripId = searchParams.get("trip");
  const locationId = searchParams.get("location");
  const quantity = parseInt(searchParams.get("quantity") || "1");
  const sellerRef = searchParams.get("ref");
  const departureTime = searchParams.get("time");
  const returnTripId = searchParams.get("return_trip");

  const [event, setEvent] = useState<Event | null>(null);
  const [trip, setTrip] = useState<Trip | null>(null);
  const [location, setLocation] = useState<BoardingLocation | null>(null);
  const [seats, setSeats] = useState<Seat[]>([]);
  const [occupiedSeatIds, setOccupiedSeatIds] = useState<string[]>([]);
  const [blockedSeatIds, setBlockedSeatIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatingSeats, setGeneratingSeats] = useState(false);
  const [loadingSeatStatus, setLoadingSeatStatus] = useState(false);
  const [seatStatusError, setSeatStatusError] = useState<string | null>(null);
  const [categoryPrices, setCategoryPrices] = useState<
    { category: string; price: number }[]
  >([]);

  // Step management: 1 = seat selection, 2 = passenger data, 3 = payment method
  const [step, setStep] = useState(1);
  const [selectedSeats, setSelectedSeats] = useState<string[]>([]);
  const [passengers, setPassengers] = useState<PassengerData[]>([]);
  const [passengerBenefitSnapshots, setPassengerBenefitSnapshots] = useState<
    Array<PassengerBenefitSnapshot | null>
  >([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [paymentCheckoutStatus, setPaymentCheckoutStatus] =
    useState<PaymentCheckoutStatus>("idle");
  const [manualCheckoutUrl, setManualCheckoutUrl] = useState<string | null>(
    null,
  );
  const [payerIndex, setPayerIndex] = useState(0);
  const [openPassengerIdx, setOpenPassengerIdx] = useState<number | null>(0);
  const [eventFees, setEventFees] = useState<EventFeeInput[]>([]);
  const [eventTicketTypes, setEventTicketTypes] = useState<EventTicketType[]>([]);
  const [eventTerms, setEventTerms] = useState<PublicEventTerm[]>([]);
  const [loadingEventTerms, setLoadingEventTerms] = useState(false);
  const [eventTermsError, setEventTermsError] = useState(false);
  // Comentário Fase 4A: aceite local/visual dos termos do evento; não persiste em sale_term_acceptances nesta etapa.
  const [eventTermsAccepted, setEventTermsAccepted] = useState(false);
  const [companyPixStatus, setCompanyPixStatus] = useState<{
    productionReady: boolean;
    sandboxReady: boolean;
  } | null>(null);
  const [companyPlatformFeePercent, setCompanyPlatformFeePercent] = useState(0);
  const [isSummaryExpanded, setIsSummaryExpanded] = useState(false);
  // Comentário de suporte: mantemos o método escolhido explícito para evitar cobrança UNDEFINED no Asaas.
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("pix");
  // Aceite jurídico obrigatório no passo final para registrar ciência da intermediação da Smartbus BR.
  const [intermediationAccepted, setIntermediationAccepted] = useState(false);
  const mandatoryRoundTrip =
    event?.transport_policy === "ida_volta_obrigatorio";
  const {
    environment: runtimePaymentEnvironment,
    source: runtimePaymentEnvironmentSource,
  } = useRuntimePaymentEnvironment();
  const isPixReadyForCurrentEnvironment =
    runtimePaymentEnvironment === "production"
      ? Boolean(companyPixStatus?.productionReady)
      : runtimePaymentEnvironment === "sandbox"
        ? Boolean(companyPixStatus?.sandboxReady)
        : false;
  const hasConfiguredPlatformFee =
    Number.isFinite(companyPlatformFeePercent) && companyPlatformFeePercent > 0;

  // Helper: get price for a seat based on category pricing
  const getSeatPrice = useCallback((seatId: string): number => {
    if (!event) return 0;
    if (!event.use_category_pricing) return event.unit_price ?? 0;
    const seat = seats.find((s) => s.id === seatId);
    if (!seat) return event.unit_price ?? 0;
    const catPrice = categoryPrices.find((cp) => cp.category === seat.category);
    return catPrice?.price ?? event.unit_price ?? 0;
  }, [event, seats, categoryPrices]);

  const usesCategoryPricing = Boolean(event?.use_category_pricing);
  const checkoutEvent = event as CheckoutEvent | null;
  const eventCompanyName =
    checkoutEvent?.company?.trade_name ||
    checkoutEvent?.company?.name ||
    "empresa organizadora";
  const hasMixedPrices =
    usesCategoryPricing &&
    selectedSeats.length > 0 &&
    new Set(selectedSeats.map(getSeatPrice)).size > 1;
  const eventTermsRequireAcceptance = eventTerms.some(
    (term) => term.acceptanceRequired,
  );
  const isEventTermsPaymentBlocked =
    loadingEventTerms ||
    eventTermsError ||
    (eventTermsRequireAcceptance && !eventTermsAccepted);

  const seatLabels = useMemo(
    () =>
      selectedSeats.map(
        (seatId) => seats.find((seat) => seat.id === seatId)?.label ?? seatId,
      ),
    [selectedSeats, seats],
  );

  useEffect(() => {
    if (paymentMethod === "pix" && runtimePaymentEnvironment && !isPixReadyForCurrentEnvironment) {
      // Comentário de suporte: evita que o comprador descubra indisponibilidade do Pix apenas no fim.
      setPaymentMethod("credit_card");
    }
  }, [paymentMethod, runtimePaymentEnvironment, isPixReadyForCurrentEnvironment]);


  useEffect(() => {
    let active = true;

    const fetchEventTerms = async () => {
      if (!event?.id || !event.company_id) {
        setEventTerms([]);
        setEventTermsAccepted(false);
        setEventTermsError(false);
        return;
      }

      setLoadingEventTerms(true);
      setEventTermsError(false);
      setEventTermsAccepted(false);

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- tabelas de termos ainda não constam no tipo gerado do Supabase.
        const supabaseAny = supabase as any;
        const { data: linksData, error: linksError } = await supabaseAny
          .from("event_term_links")
          .select(
            "id, company_id, event_id, term_id, term_version_id, selection_mode, acceptance_required",
          )
          .eq("event_id", event.id)
          .eq("company_id", event.company_id)
          .order("created_at", { ascending: true });

        if (!active) return;

        if (linksError) {
          throw linksError;
        }

        const links = (linksData ?? []) as EventTermLinkRow[];
        if (links.length === 0) {
          setEventTerms([]);
          return;
        }

        const versionIds = links.map((link) => link.term_version_id);
        const { data: versionsData, error: versionsError } = await supabaseAny
          .from("company_term_versions")
          .select(
            "id, company_id, term_id, version_number, title, term_type, content, content_hash, summary, status, published_at",
          )
          .eq("company_id", event.company_id)
          .eq("status", "published")
          .in("id", versionIds);

        if (!active) return;

        if (versionsError) {
          throw versionsError;
        }

        const versions = ((versionsData ?? []) as CompanyTermVersionRow[]).filter(
          (version) =>
            version.company_id === event.company_id &&
            version.status === "published",
        );
        const versionsById = new Map(
          versions.map((version) => [version.id, version]),
        );
        const hydratedTerms = links.map((link) => {
          const version = versionsById.get(link.term_version_id);

          if (
            !version ||
            version.term_id !== link.term_id ||
            version.company_id !== link.company_id
          ) {
            return null;
          }

          return {
            linkId: link.id,
            termId: link.term_id,
            termVersionId: link.term_version_id,
            acceptanceRequired: link.acceptance_required === true,
            selectionMode: link.selection_mode ?? "specific_version",
            title: version.title,
            termType: version.term_type,
            versionNumber: Number(version.version_number ?? 0),
            summary: version.summary,
            content: version.content,
            contentHash: version.content_hash,
            publishedAt: version.published_at,
          } satisfies PublicEventTerm;
        });

        if (hydratedTerms.some((term) => term === null)) {
          throw new Error(
            "Nem todas as versões publicadas vinculadas ao evento foram encontradas.",
          );
        }

        // Comentário de suporte: evita exibir mais de um termo do mesmo tipo no checkout
        // público caso existam vínculos legados duplicados para o evento.
        const uniqueTermsByType = (hydratedTerms as PublicEventTerm[]).filter(
          (term, index, terms) =>
            terms.findIndex((candidate) => candidate.termType === term.termType) === index,
        );

        setEventTerms(uniqueTermsByType);
      } catch (error) {
        console.error("[checkout] event_terms_load_failed", {
          eventId: event.id,
          companyId: event.company_id,
          error,
        });
        if (active) {
          setEventTerms([]);
          setEventTermsError(true);
        }
      } finally {
        if (active) {
          setLoadingEventTerms(false);
        }
      }
    };

    fetchEventTerms();

    return () => {
      active = false;
    };
  }, [event?.id, event?.company_id]);

  // Comentário de suporte: consolidamos os números do resumo em um único memo para evitar
  // divergência visual entre as etapas sem alterar as regras atuais de cálculo.
  const checkoutSummary = useMemo(() => {
    if (!event) {
      return {
        originalSubtotal: 0,
        benefitDiscountTotal: 0,
        subtotalAfterBenefits: 0,
        totalFees: 0,
        grandTotal: 0,
        hasFeeLines: false,
        hasBenefitsApplied: false,
        benefitDescription: null as string | null,
      };
    }

    const selectedCount = selectedSeats.length;
    const hasPassengerTicketTypesSelected =
      passengers.length === selectedCount && selectedCount > 0;
    const originalSeatsTotal = hasPassengerTicketTypesSelected
      ? passengers.reduce(
          (sum, passenger) => sum + Number(passenger.ticket_type_price ?? 0),
          0,
        )
      : usesCategoryPricing
        ? selectedSeats.reduce((sum, seatId) => {
            const seat = seats.find((s) => s.id === seatId);
            const catPrice = categoryPrices.find(
              (cp) => cp.category === seat?.category,
            );
            const seatPrice = catPrice?.price ?? event.unit_price ?? 0;
            return sum + seatPrice;
          }, 0)
        : (event.unit_price ?? 0) * selectedCount;

    const hasResolvedBenefitSnapshot =
      passengerBenefitSnapshots.length === selectedCount &&
      passengerBenefitSnapshots.every((snapshot) => snapshot !== null);

    const seatsSubtotalAfterBenefits = hasResolvedBenefitSnapshot
      ? passengerBenefitSnapshots.reduce(
          (sum, snapshot) => sum + (snapshot?.final_price ?? 0),
          0,
        )
      : originalSeatsTotal;
    const totalBenefitDiscount = hasResolvedBenefitSnapshot
      ? passengerBenefitSnapshots.reduce(
          (sum, snapshot) => sum + (snapshot?.discount_amount ?? 0),
          0,
        )
      : 0;

    const unitPricesForFees = hasResolvedBenefitSnapshot
      ? passengerBenefitSnapshots.map((snapshot) => snapshot?.final_price ?? 0)
      : hasPassengerTicketTypesSelected
        ? passengers.map((passenger, index) => {
            const typePrice = Number(passenger.ticket_type_price ?? 0);
            return typePrice > 0 ? typePrice : getSeatPrice(selectedSeats[index]);
          })
        : selectedSeats.map((seatId) => getSeatPrice(seatId));

    const eventFeesTotal = roundCurrency(
      unitPricesForFees.reduce((sum, unitPrice) => sum + calculateFees(unitPrice, eventFees).totalFees, 0),
    );
    // PRD 01: a taxa da plataforma repassada ao cliente usa a mesma ordem do backend:
    // teto por item, soma da venda e piso total de R$ 5,00 apenas depois da soma.
    const platformFeeTotal = event.pass_platform_fee_to_customer && hasConfiguredPlatformFee
      ? calculatePlatformFeeTotal(unitPricesForFees)
      : 0;
    const totalFees = roundCurrency(eventFeesTotal + platformFeeTotal);
    const grandTotal = roundCurrency(seatsSubtotalAfterBenefits + totalFees);
    const benefitSnapshots = hasResolvedBenefitSnapshot
      ? passengerBenefitSnapshots.filter(
          (snapshot): snapshot is PassengerBenefitSnapshot =>
            snapshot !== null &&
            snapshot.benefit_applied &&
            Number(snapshot.discount_amount) > 0,
        )
      : [];

    const uniqueBenefitDescriptions = Array.from(
      new Set(
        benefitSnapshots.map((snapshot) => {
          const typeValue =
            snapshot.benefit_type === "percentual"
              ? `${Number(snapshot.benefit_value ?? 0)}%`
              : snapshot.benefit_type === "valor_fixo"
                ? formatCurrencyBRL(Number(snapshot.benefit_value ?? 0))
                : snapshot.benefit_type === "preco_final"
                  ? `preço final ${formatCurrencyBRL(Number(snapshot.benefit_value ?? 0))}`
                  : null;
          const safeName = snapshot.benefit_program_name || "Benefício por CPF";
          return typeValue ? `${safeName} (${typeValue})` : safeName;
        }),
      ),
    );

    const benefitDescription =
      uniqueBenefitDescriptions.length === 0
        ? null
        : uniqueBenefitDescriptions.length === 1
          ? uniqueBenefitDescriptions[0]
          : `${uniqueBenefitDescriptions.length} benefícios aplicados`;

    return {
      originalSubtotal: roundCurrency(originalSeatsTotal),
      benefitDiscountTotal: roundCurrency(totalBenefitDiscount),
      subtotalAfterBenefits: roundCurrency(seatsSubtotalAfterBenefits),
      totalFees,
      grandTotal,
      hasFeeLines: totalFees > 0,
      hasBenefitsApplied: roundCurrency(totalBenefitDiscount) > 0,
      benefitDescription,
    };
  }, [
    event,
    selectedSeats,
    getSeatPrice,
    passengers,
    usesCategoryPricing,
    eventFees,
    hasConfiguredPlatformFee,
    seats,
    categoryPrices,
    passengerBenefitSnapshots,
  ]);
  const fetchOccupiedSeats = useCallback(
    async (tripUuid: string, isActive: () => boolean) => {
      setLoadingSeatStatus(true);
      setSeatStatusError(null);

      try {
        // Public-safe occupancy via SECURITY DEFINER RPC (no PII exposed)
        // + active seat_locks (already public-readable for events 'a_venda')
        const occRes = await getTripSeatOccupancyRpc({ tripId: tripUuid, context: 'public_checkout' });

        if (!isActive()) return;

        const occRows = (occRes.rows ?? []) as {
          seat_id: string | null;
          is_blocked: boolean | null;
        }[];

        const blockedSeats = occRows
          .filter((r) => r.seat_id && r.is_blocked)
          .map((r) => r.seat_id as string);

        const occupiedSeats = occRows
          .filter((r) => r.seat_id && !r.is_blocked)
          .map((r) => r.seat_id as string);

        setBlockedSeatIds(blockedSeats);
        setOccupiedSeatIds(occupiedSeats);
      } catch (error) {
        console.error("Erro ao carregar status dos assentos:", error);
        if (!isActive()) return;
        setSeatStatusError("Não foi possível atualizar os assentos ocupados.");
      } finally {
        if (isActive()) {
          setLoadingSeatStatus(false);
        }
      }
    },
    [],
  );

  // ---- Load data ----
  useEffect(() => {
    let active = true;
    const isActive = () => active;

    const fetchData = async () => {
      if (!id || !tripId || !locationId) {
        navigate("/eventos");
        return;
      }

      setLoading(true);

      try {
        const [eventRes, tripRes, locationRes] = await Promise.all([
          supabase
            .from("events")
            .select("*, company:companies(name, trade_name, asaas_pix_ready_production, asaas_pix_ready_sandbox, asaas_pix_last_error_production, asaas_pix_last_error_sandbox)")
            .eq("id", id)
            .single(),
          supabase
            .from("trips")
            .select("*, vehicle:vehicles(*)")
            .eq("id", tripId)
            .single(),
          supabase
            .from("boarding_locations")
            .select("*")
            .eq("id", locationId)
            .single(),
        ]);

        if (!isActive()) return;

        if (eventRes.data) {
          const eventData = eventRes.data as Event;
          if (!eventData.allow_online_sale) {
            toast.error("Este evento não está disponível para compra online.");
            navigate(`/eventos/${id}`);
            return;
          }
          setEvent(eventData);

          // Observação de blindagem: o frontend usa estes dados apenas para visualização/UX.
          // A fonte oficial do cálculo financeiro é o snapshot gerado no backend.
          const { data: companyData, error: companyError } = await supabase
            .from("companies")
            .select("platform_fee_percent, asaas_pix_ready_production, asaas_pix_ready_sandbox")
            .eq("id", eventData.company_id)
            .single();

          if (companyError) {
            toast.error(
              "Não foi possível carregar a taxa da plataforma da empresa.",
            );
            navigate(`/eventos/${id}`);
            return;
          }
          setCompanyPlatformFeePercent(Number(companyData.platform_fee_percent ?? 0));
          setCompanyPixStatus({
            productionReady: Boolean(companyData.asaas_pix_ready_production),
            sandboxReady: Boolean(companyData.asaas_pix_ready_sandbox),
          });

          // Fetch event fees
          const { data: feesData } = await supabase
            .from("event_fees")
            .select("name, fee_type, value, is_active")
            .eq("event_id", id!)
            .eq("is_active", true)
            .order("sort_order");
          setEventFees((feesData ?? []) as EventFeeInput[]);

          const { data: ticketTypesData } = await supabase
            .from("event_ticket_types")
            .select("id, name, price, is_active")
            .eq("event_id", id!)
            .order("sort_order");

          const activeTypes = (ticketTypesData ?? [])
            .filter((row: EventTicketTypeRow) => row.is_active)
            .map((row: EventTicketTypeRow) => ({
              id: row.id,
              name: row.name,
              price: Number(row.price ?? 0),
              is_active: Boolean(row.is_active),
            }));

          // Retrocompatibilidade: evento legado sem tipos usa preço base como tipo único padrão.
          setEventTicketTypes(
            activeTypes.length > 0
              ? activeTypes
              : [{
                  id: CHECKOUT_FALLBACK_TICKET_TYPE_ID,
                  name: "Adulto",
                  price: Number(eventData.unit_price ?? 0),
                  is_active: true,
                }],
          );

          // Fetch category prices if enabled
          if (eventData.use_category_pricing) {
            const { data: catPrices } = await supabase
              .from("event_category_prices")
              .select("category, price")
              .eq("event_id", id!);
            setCategoryPrices(
              (catPrices ?? []).map((cp: EventCategoryPriceRow) => ({
                category: cp.category,
                price: Number(cp.price),
              })),
            );
          }
        }
        if (tripRes.data) setTrip(tripRes.data as Trip);
        if (locationRes.data) setLocation(locationRes.data as BoardingLocation);

        // Comentário de suporte: liberamos o layout da tela assim que dados básicos chegam,
        // evitando tela vazia na primeira abertura enquanto os assentos reais ainda sincronizam.
        setLoading(false);

        if (tripRes.data) {
          const currentTrip = tripRes.data as Trip;
          const vehicleId = currentTrip.vehicle_id;

          // Comentário de causa raiz: antes a página ficava bloqueada até terminar toda a sequência
          // (carregar/criar assentos + status). Em rede lenta, o usuário via "vazio" na 1ª entrada.
          // Aqui exibimos um layout base imediato e depois sincronizamos assentos reais/status.

          const { data: existingSeats, error: seatsError } = await supabase
            .from("seats")
            .select("*")
            .eq("vehicle_id", vehicleId)
            .order("floor", { ascending: true })
            .order("row_number", { ascending: true })
            .order("column_number", { ascending: true });

          if (seatsError) {
            throw seatsError;
          }

          if (!isActive()) return;

          if (existingSeats && existingSeats.length > 0) {
            // Comentário P0: usar assentos materializados no banco — fonte única de verdade.
            // Filtrar seats técnicos (_legacy_/_tmp_) como proteção defensiva.
            const validSeats = (existingSeats as Seat[]).filter(
              (s) =>
                !s.label.startsWith("_legacy_") && !s.label.startsWith("_tmp_"),
            );
            setSeats(validSeats as Seat[]);
          } else {
            // Comentário P0: sem fallback de geração local. Assentos devem ser sincronizados
            // via /admin/frota (syncSeatsFromSnapshot). Exibir erro amigável.
            setSeatStatusError(
              "Layout do veículo ainda não foi configurado. Entre em contato com o organizador.",
            );
          }

          await fetchOccupiedSeats(tripId, isActive);
        }
      } catch (error) {
        console.error("Erro ao carregar checkout:", error);
        setGeneratingSeats(false);
        setSeatStatusError("Não foi possível carregar o mapa de assentos.");
      } finally {
        if (isActive()) {
          setLoading(false);
        }
      }
    };

    fetchData();

    return () => {
      active = false;
    };
  }, [id, tripId, locationId, navigate, fetchOccupiedSeats]);

  // Realtime + refresh on focus: garante que o mapa público reflita compras/locks
  // de outros usuários sem exigir reload manual. Atende ao cenário em que o cliente
  // volta para o checkout após pagar e a poltrona ainda parecia "livre".
  useEffect(() => {
    if (!tripId) return;

    const refresh = () => {
      fetchOccupiedSeats(tripId, () => true);
    };

    const channel = supabase
      .channel(`seat-availability-${tripId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tickets', filter: `trip_id=eq.${tripId}` },
        refresh,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'seat_locks', filter: `trip_id=eq.${tripId}` },
        refresh,
      )
      .subscribe();

    const onVisibility = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', refresh);

    return () => {
      supabase.removeChannel(channel);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', refresh);
    };
  }, [tripId, fetchOccupiedSeats]);

  const handleRetrySeatStatus = async () => {
    if (!tripId) return;
    await fetchOccupiedSeats(tripId, () => true);
  };

  // Revalidate seats against the database (tickets + seat_locks), returns true if all OK
  const revalidateSeats = async (): Promise<boolean> => {
    if (!tripId) return false;

    let occRes;
    try {
      occRes = await getTripSeatOccupancyRpc({ tripId: tripId, context: 'public_checkout' });
    } catch (_error) {
      toast.error("Erro ao verificar disponibilidade. Tente novamente.");
      return false;
    }

    const occRows = (occRes.rows ?? []) as {
      seat_id: string | null;
      is_blocked: boolean | null;
    }[];

    const currentBlocked = occRows
      .filter((r) => r.seat_id && r.is_blocked)
      .map((r) => r.seat_id as string);

    const currentOccupied = occRows
      .filter((r) => r.seat_id && !r.is_blocked)
      .map((r) => r.seat_id as string);

    setBlockedSeatIds(currentBlocked);
    setOccupiedSeatIds(currentOccupied);

    // Check which selected seats are now occupied
    const unavailableSeatIds = new Set([...currentOccupied, ...currentBlocked]);

    const conflicting = selectedSeats.filter((seatId) =>
      unavailableSeatIds.has(seatId),
    );
    if (conflicting.length > 0) {
      const remaining = selectedSeats.filter(
        (seatId) => !unavailableSeatIds.has(seatId),
      );
      setSelectedSeats(remaining);
      toast.error(
        "Alguns assentos que você selecionou já foram vendidos. Escolha outros.",
      );
      return false;
    }

    return true;
  };

  // Init passengers array when advancing to step 2
  const handleAdvanceToPassengers = async () => {
    if (selectedSeats.length !== quantity) {
      toast.error(
        `Selecione exatamente ${quantity} assento${quantity > 1 ? "s" : ""}`,
      );
      return;
    }

    // Revalidate before advancing
    setSubmitting(true);
    const valid = await revalidateSeats();
    setSubmitting(false);

    if (!valid) return;

    const defaultType = eventTicketTypes[0] ?? {
      id: CHECKOUT_FALLBACK_TICKET_TYPE_ID,
      name: "Adulto",
      price: Number(event?.unit_price ?? 0),
      is_active: true,
    };
    // Comentário de preservação mobile: ao voltar para a etapa de assentos e continuar novamente,
    // mantemos os dados já digitados por índice/assento em vez de recriar tudo vazio.
    setPassengers((previousPassengers) =>
      selectedSeats.map((_, index) => previousPassengers[index] ?? {
        name: "",
        cpf: "",
        phone: "",
        ticket_type_id: defaultType.id,
        ticket_type_name: defaultType.name,
        ticket_type_price: defaultType.price,
      }),
    );
    setPassengerBenefitSnapshots((previousSnapshots) =>
      selectedSeats.map((_, index) => previousSnapshots[index] ?? null),
    );
    setErrors({});
    setPayerIndex(0);
    setOpenPassengerIdx(0);
    setStep(2);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Get seat label by id
  const seatLabelMap = useMemo(() => {
    const map: Record<string, string> = {};
    seats.forEach((s) => {
      map[s.id] = s.label;
    });
    return map;
  }, [seats]);

  // Update passenger field
  const updatePassenger = (
    index: number,
    field: keyof PassengerData,
    value: string,
  ) => {
    setPassengers((prev) => {
      const copy = [...prev];
      if (field === "cpf") {
        copy[index] = { ...copy[index], cpf: formatCpfMask(value) };
        // Regra da fase 1: alteração de CPF invalida snapshot de benefício do passageiro.
        setPassengerBenefitSnapshots((prevSnapshots) => {
          if (!prevSnapshots[index]) return prevSnapshots;
          const next = [...prevSnapshots];
          next[index] = null;
          return next;
        });
      } else if (field === "phone") {
        copy[index] = { ...copy[index], phone: formatPhoneMask(value) };
      } else {
        copy[index] = { ...copy[index], [field]: value };
      }
      return copy;
    });
    setErrors((prev) => {
      const copy = { ...prev };
      delete copy[`${index}_${field}`];
      return copy;
    });
  };

  // Validate passengers
  const validatePassengers = (): boolean => {
    const newErrors: Record<string, string> = {};
    const cpfs = new Set<string>();
    const expectedPassengers = selectedSeats.length;

    if (passengers.length !== expectedPassengers || expectedPassengers !== quantity) {
      newErrors.checkout =
        "A quantidade de passageiros não confere com os assentos selecionados";
    }

    passengers.forEach((p, i) => {
      if (!p.name.trim() || p.name.trim().length < 3) {
        newErrors[`${i}_name`] = "Nome deve ter pelo menos 3 caracteres";
      }
      const rawCpf = p.cpf.replace(/\D/g, "");
      if (!rawCpf || rawCpf.length !== 11) {
        newErrors[`${i}_cpf`] = "CPF deve ter 11 dígitos";
      } else if (!isValidCpf(rawCpf)) {
        newErrors[`${i}_cpf`] = "CPF inválido";
      } else if (cpfs.has(rawCpf)) {
        newErrors[`${i}_cpf`] = "CPF já utilizado nesta compra";
      } else {
        cpfs.add(rawCpf);
      }
    });

    // Validate payer has valid CPF
    const payerCpf = passengers[payerIndex]?.cpf.replace(/\D/g, "");
    if (!payerCpf || !isValidCpf(payerCpf)) {
      newErrors[`${payerIndex}_cpf`] =
        "O responsável pelo pagamento precisa ter CPF válido";
    }

    if (Object.keys(newErrors).length > 0) {
      console.warn("[checkout] passenger_validation_failed", {
        stage: "validate_passengers_before_insert",
        flow_origin: "public_checkout",
        environment: import.meta.env.MODE,
        paymentEnvironment: runtimePaymentEnvironment ?? null,
        companyId: event?.company_id ?? null,
        eventId: event?.id ?? null,
        expectedPassengers,
        selectedSeatsCount: selectedSeats.length,
        submittedPassengers: passengers.length,
        payerIndex,
        invalidPassengers: passengers.map((passenger, index) => ({
          index,
          seatId: selectedSeats[index] ?? null,
          missingFields: getMissingPassengerFields(passenger),
          cpfMasked: maskCpfForLog(passenger.cpf),
          phoneProvided: passenger.phone.replace(/\D/g, "").length > 0,
          ticketTypeOrigin: resolveTicketTypeOriginForLog(passenger.ticket_type_id),
        })).filter((row) => row.missingFields.length > 0),
        errorKeys: Object.keys(newErrors),
      });
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const resolvePassengerBenefitSnapshots = async (): Promise<
    Array<PassengerBenefitSnapshot | null>
  > => {
    if (!event) return [];

    const snapshots = await Promise.all(
      passengers.map(async (passenger, index) => {
        const seatId = selectedSeats[index];
        const typePrice = Number(passenger.ticket_type_price ?? 0);
        const originalPrice = roundCurrency(typePrice > 0 ? typePrice : getSeatPrice(seatId));

        const fallbackSnapshot: PassengerBenefitSnapshot = {
          benefit_program_id: null,
          benefit_program_name: null,
          benefit_type: null,
          benefit_value: null,
          original_price: originalPrice,
          discount_amount: 0,
          final_price: originalPrice,
          benefit_applied: false,
          pricing_rule_version: BENEFIT_PRICING_RULE_VERSION,
        };

        try {
          const resolved = await resolvePassengerBenefitPrice({
            companyId: event.company_id,
            eventId: event.id,
            cpf: passenger.cpf,
            originalPrice,
          });

          // Log temporário de diagnóstico: trilha do benefício escolhido por passageiro no checkout público.
          if (import.meta.env.DEV || window.localStorage.getItem("DEBUG_BENEFITS_CHECKOUT") === "1") {
            console.info("[benefits-debug] passenger_snapshot_resolved", {
              stage: "resolvePassengerBenefitSnapshots",
              flow_origin: "public_checkout",
              eventId: event.id,
              companyId: event.company_id,
              seatId,
              passengerIndex: index,
              cpfMasked: maskCpfForLog(passenger.cpf),
              originalPrice: roundCurrency(resolved.originalPrice),
              benefitApplied: resolved.benefitApplied,
              benefitProgramId: resolved.benefitProgramId,
              benefitProgramName: resolved.benefitProgramName,
              benefitType: resolved.benefitType,
              benefitValue: resolved.benefitValue,
              discountAmount: roundCurrency(resolved.discountAmount),
              finalPrice: roundCurrency(resolved.finalPrice),
            });
          }

          return {
            benefit_program_id: resolved.benefitProgramId,
            benefit_program_name: resolved.benefitProgramName,
            benefit_type: resolved.benefitType,
            benefit_value: resolved.benefitValue,
            original_price: roundCurrency(resolved.originalPrice),
            discount_amount: roundCurrency(resolved.discountAmount),
            final_price: roundCurrency(resolved.finalPrice),
            benefit_applied: resolved.benefitApplied,
            pricing_rule_version:
              resolved.pricingRuleVersion || BENEFIT_PRICING_RULE_VERSION,
          };
        } catch (error) {
          // Regra de ouro do checkout: benefício é opcional e jamais pode bloquear venda.
          // Em erro técnico (RLS/query/timeout), seguimos com preço base e log detalhado.
          console.error("[checkout] benefit_validation_fallback_applied", {
            stage: "passengers_to_payment_transition",
            context: "resolvePassengerBenefitSnapshots",
            flow_origin: "public_checkout",
            environment: import.meta.env.MODE,
            eventId: event.id,
            companyId: event.company_id,
            seatId,
            passengerIndex: index,
            cpfMasked: maskCpfForLog(passenger.cpf),
            reason: "eligibility_lookup_failed",
            cause: error instanceof Error ? error.message : String(error),
          });
          return fallbackSnapshot;
        }
      }),
    );

    return snapshots;
  };

  const calculateTotalsFromSnapshots = (
    snapshots: Array<PassengerBenefitSnapshot | null>,
  ) => {
    if (!event) {
      return {
        originalSubtotal: 0,
        benefitTotalDiscount: 0,
        subtotalAfterBenefits: 0,
        totalFees: 0,
        grossAmount: 0,
      };
    }

    const effectiveSnapshots = snapshots.filter(
      (snapshot): snapshot is PassengerBenefitSnapshot => snapshot !== null,
    );


    const originalSubtotal = roundCurrency(
      effectiveSnapshots.reduce((sum, snapshot) => sum + snapshot.original_price, 0),
    );
    const benefitTotalDiscount = roundCurrency(
      effectiveSnapshots.reduce((sum, snapshot) => sum + snapshot.discount_amount, 0),
    );
    const subtotalAfterBenefits = roundCurrency(
      effectiveSnapshots.reduce((sum, snapshot) => sum + snapshot.final_price, 0),
    );

    // Cálculo PRD 07: taxas progressivas devem ser somadas POR PASSAGEIRO (igual ao motor backend
    // em supabase/functions/_shared/checkout-financial-integrity.ts). Não usar média — para
    // múltiplos passageiros em faixas distintas (ex.: 700 + 520) a média gera divergência
    // arredondada e quebra a validação de integridade financeira no create-asaas-payment.
    const passToCustomer = event.pass_platform_fee_to_customer && hasConfiguredPlatformFee;
    const passengerUnitPrices = effectiveSnapshots.map((snapshot) => snapshot.final_price);
    const eventFeesTotal = roundCurrency(
      passengerUnitPrices.reduce((sum, unitPrice) => sum + calculateFees(unitPrice, eventFees).totalFees, 0),
    );
    // Mesma ordem do motor oficial: taxa/teto por passageiro, soma e piso total de R$ 5,00.
    // Taxas adicionais do evento seguem fora da base da taxa da plataforma.
    const platformFeeTotal = passToCustomer ? calculatePlatformFeeTotal(passengerUnitPrices) : 0;
    const totalFees = roundCurrency(eventFeesTotal + platformFeeTotal);
    const grossAmount = roundCurrency(subtotalAfterBenefits + totalFees);

    return {
      originalSubtotal,
      benefitTotalDiscount,
      subtotalAfterBenefits,
      totalFees,
      grossAmount,
    };
  };

  const preserveCheckoutFailureTrace = (params: {
    saleId: string;
    stage: string;
    errorCode: string | null;
    errorMessage: string;
  }) => {
    const trace = {
      sale_id: params.saleId,
      company_id: event?.company_id ?? null,
      payment_environment: runtimePaymentEnvironment ?? null,
      payment_method: paymentMethod,
      timestamp: new Date().toISOString(),
      error_code: params.errorCode,
      message: params.errorMessage,
      stage: params.stage,
    };

    // Comentário de suporte: persistimos apenas diagnóstico mínimo em sessionStorage
    // para preservar rastreabilidade local antes do rollback apagar a venda.
    try {
      sessionStorage.setItem(
        "smartbus:last_checkout_payment_failure",
        JSON.stringify(trace),
      );
    } catch (storageError) {
      console.warn("[checkout] failure trace storage unavailable", {
        sale_id: params.saleId,
        stage: params.stage,
        error: storageError instanceof Error
          ? storageError.message
          : String(storageError),
      });
    }

    // Comentário de suporte: log estruturado em console para captura imediata
    // do sale_id e correlação operacional durante reprodução controlada.
    console.error("[checkout] payment_failure_trace_before_rollback", trace);
  };

  // Submit purchase — new flow: seat_locks + sale_passengers + pendente_pagamento + new tab
  const handleSubmit = async () => {
    if (!validatePassengers()) {
      const firstErrorKey = Object.keys(errors)[0];
      if (firstErrorKey) {
        const idx = parseInt(firstErrorKey.split("_")[0]);
        setOpenPassengerIdx(idx);
      }
      return;
    }
    if (!event || !trip || !location) return;

    if (eventTermsError || loadingEventTerms) {
      toast.error(
        "Não foi possível carregar os termos deste evento. Tente novamente em instantes.",
      );
      return;
    }

    if (eventTermsRequireAcceptance && !eventTermsAccepted) {
      toast.error("Para continuar, aceite os termos obrigatórios deste evento.");
      return;
    }

    if (!intermediationAccepted) {
      toast.error(CHECKOUT_RESPONSIBILITY_VALIDATION_MESSAGE);
      return;
    }

    if (paymentMethod === "pix" && runtimePaymentEnvironment && !isPixReadyForCurrentEnvironment) {
      toast.error(
        "Pix indisponível para esta empresa no momento. Escolha cartão de crédito para concluir a compra.",
      );
      setPaymentMethod("credit_card");
      return;
    }

    // Em contexto "instalado" (PWA standalone, WebView, TWA, iOS standalone),
    // abrir o Asaas em nova aba joga o usuário para o navegador externo e o
    // autoRedirect do Asaas volta nesse navegador — não no app. Nesses casos
    // navegamos na mesma "aba" para preservar a imersão de aplicativo.
    const isInstalledAppContext = (() => {
      if (typeof window === "undefined") return false;
      try {
        const mqStandalone = window.matchMedia?.("(display-mode: standalone)")?.matches ?? false;
        const mqMinimalUi = window.matchMedia?.("(display-mode: minimal-ui)")?.matches ?? false;
        const iosStandalone = (window.navigator as unknown as { standalone?: boolean }).standalone === true;
        const ua = window.navigator.userAgent || "";
        const isAndroidWebView = /\bwv\b/.test(ua) || /; wv\)/.test(ua);
        return mqStandalone || mqMinimalUi || iosStandalone || isAndroidWebView;
      } catch {
        return false;
      }
    })();

    // Comentário de suporte: em navegador comum abrimos a aba de pagamento ainda
    // no clique do usuário para evitar bloqueio de pop-up após as etapas
    // assíncronas do checkout. Em app instalado, usamos a mesma aba.
    const preOpenedPaymentTab = isInstalledAppContext ? null : window.open("", "_blank");
    if (preOpenedPaymentTab) {
      renderPaymentPreparingTab(preOpenedPaymentTab);
    }

    setSubmitting(true);
    setPaymentCheckoutStatus("preparing");
    setManualCheckoutUrl(null);

    // Revalidate seats before creating sale
    const seatsValid = await revalidateSeats();
    if (!seatsValid) {
      setStep(1);
      window.scrollTo({ top: 0, behavior: "smooth" });
      preOpenedPaymentTab?.close();
      setSubmitting(false);
      setPaymentCheckoutStatus("idle");
      return;
    }

    // Re-check capacity
    const { data: availableSeats } = await supabase.rpc(
      "get_trip_available_capacity",
      {
        trip_uuid: tripId!,
      },
    );

    if (availableSeats !== null && quantity > availableSeats) {
      toast.error(
        `Apenas ${availableSeats} vaga${availableSeats !== 1 ? "s" : ""} disponível`,
      );
      preOpenedPaymentTab?.close();
      setSubmitting(false);
      setPaymentCheckoutStatus("idle");
      return;
    }

    const shouldCreateReturn = mandatoryRoundTrip || Boolean(returnTripId);

    if (mandatoryRoundTrip && !returnTripId) {
      toast.error("Este evento exige ida e volta. Volte e selecione a volta.");
      preOpenedPaymentTab?.close();
      setSubmitting(false);
      setPaymentCheckoutStatus("idle");
      return;
    }

    if (shouldCreateReturn && returnTripId) {
      const { data: returnAvailable } = await supabase.rpc(
        "get_trip_available_capacity",
        {
          trip_uuid: returnTripId,
        },
      );

      if (returnAvailable !== null && quantity > returnAvailable) {
        toast.error(
          `Volta com apenas ${returnAvailable} vaga${returnAvailable !== 1 ? "s" : ""} disponível`,
        );
        preOpenedPaymentTab?.close();
        setSubmitting(false);
        setPaymentCheckoutStatus("idle");
        return;
      }
    }

    const payer = passengers[payerIndex];
    const termsAcceptancePayer =
      payer ?? passengers.find((passenger) => passenger.name.trim());
    const termsAcceptancePayload = eventTerms.length > 0
      ? {
          accepted: eventTermsAccepted || !eventTermsRequireAcceptance,
          accepted_term_version_ids: eventTerms.map(
            (term) => term.termVersionId,
          ),
          accepted_terms: eventTerms.map((term) => ({
            term_id: term.termId,
            term_version_id: term.termVersionId,
            title: term.title,
            term_type: term.termType,
            version_number: term.versionNumber,
            content_hash: term.contentHash,
            content_snapshot: term.content,
            summary_snapshot: term.summary,
          })),
          accepted_by_name: termsAcceptancePayer?.name.trim() || null,
          accepted_by_cpf:
            termsAcceptancePayer?.cpf.replace(/\D/g, "") || null,
          accepted_by_phone:
            termsAcceptancePayer?.phone.replace(/\D/g, "") || null,
        }
      : null;

    // Captura e valida o vínculo de vendedor vindo de `?ref=` no fluxo público.
    // Correção: usamos RPC SECURITY DEFINER para não depender de SELECT direto em `sellers`,
    // que é bloqueado por RLS para usuários anônimos.
    let validatedSellerId: string | null = null;
    if (sellerRef) {
      const { data: resolvedSellerId, error: sellerResolveError } =
        await supabase.rpc("resolve_event_seller_ref", {
          p_seller_id: sellerRef,
          p_company_id: event.company_id,
        });

      if (sellerResolveError) {
        // Suporte: manter log explícito ajuda a auditar falhas de atribuição sem quebrar a compra.
        console.warn(
          "Falha ao validar seller_ref no checkout:",
          sellerResolveError,
        );
      } else if (resolvedSellerId) {
        validatedSellerId = resolvedSellerId;
      }
    }

    let snapshotsToPersist = passengerBenefitSnapshots;
    const hasResolvedSnapshots =
      snapshotsToPersist.length === passengers.length &&
      snapshotsToPersist.every((snapshot) => snapshot !== null);
    if (!hasResolvedSnapshots) {
      snapshotsToPersist = await resolvePassengerBenefitSnapshots();
      if (snapshotsToPersist.length !== passengers.length) {
        // Fallback final: se algo inesperado quebrar o shape, mantemos venda com o preço do tipo selecionado antes de recorrer ao preço base.
        snapshotsToPersist = selectedSeats.map((seatId, i) => {
          const typePrice = Number(passengers[i]?.ticket_type_price ?? 0);
          const basePrice = roundCurrency(typePrice > 0 ? typePrice : getSeatPrice(seatId));
          return {
            benefit_program_id: null,
            benefit_program_name: null,
            benefit_type: null,
            benefit_value: null,
            original_price: basePrice,
            discount_amount: 0,
            final_price: basePrice,
            benefit_applied: false,
            pricing_rule_version: BENEFIT_PRICING_RULE_VERSION,
          } satisfies PassengerBenefitSnapshot;
        });
        console.error("[checkout] benefit_snapshot_shape_fallback", {
          stage: "submit_before_sale_insert",
          context: "handleSubmit",
          flow_origin: "public_checkout",
          environment: import.meta.env.MODE,
          eventId: event.id,
          companyId: event.company_id,
          expectedPassengers: passengers.length,
          receivedSnapshots: snapshotsToPersist.length,
          reason: "snapshot_length_mismatch",
        });
      }
      if (snapshotsToPersist.length !== passengers.length) {
        preOpenedPaymentTab?.close();
        setSubmitting(false);
        setPaymentCheckoutStatus("idle");
        return;
      }
      setPassengerBenefitSnapshots(snapshotsToPersist);
    }

    const totals = calculateTotalsFromSnapshots(snapshotsToPersist);
    const grossAmount = totals.grossAmount;
    const benefitTotalDiscount = totals.benefitTotalDiscount;

    // Log temporário de diagnóstico: confirma payload financeiro/snapshot antes de persistir venda.
    if (import.meta.env.DEV || window.localStorage.getItem("DEBUG_BENEFITS_CHECKOUT") === "1") {
      console.info("[benefits-debug] submit_snapshot_and_totals", {
        stage: "submit_before_sale_insert",
        flow_origin: "public_checkout",
        eventId: event.id,
        companyId: event.company_id,
        passengers: snapshotsToPersist.map((snapshot, idx) => ({
          passengerIndex: idx,
          cpfMasked: maskCpfForLog(passengers[idx]?.cpf ?? ""),
          benefit_applied: snapshot?.benefit_applied ?? false,
          benefit_program_name: snapshot?.benefit_program_name ?? null,
          discount_amount: snapshot?.discount_amount ?? 0,
          final_price: snapshot?.final_price ?? 0,
        })),
        totals,
      });
    }

    // === Step 1: Create sale with pendente_pagamento status ===
    const { data: sale, error: saleError } = await supabase
      .from("sales")
      .insert({
        event_id: id!,
        trip_id: tripId!,
        boarding_location_id: locationId!,
        seller_id: validatedSellerId,
        customer_name: payer.name.trim(),
        customer_cpf: payer.cpf.replace(/\D/g, ""),
        customer_phone: payer.phone.replace(/\D/g, ""),
        quantity,
        unit_price: event.unit_price ?? 0,
        gross_amount: grossAmount,
        benefit_total_discount: benefitTotalDiscount,
        status: "pendente_pagamento" as const,
        payment_method: paymentMethod,
        // Lastro de aceite: registramos data/hora para auditoria da ciência do comprador no checkout público.
        intermediation_responsibility_accepted: true,
        intermediation_responsibility_accepted_at: new Date().toISOString(),
        company_id: event.company_id,
        // Etapa 2: o ambiente nasce explícito na venda antes da cobrança Asaas.
        payment_environment: runtimePaymentEnvironment,
      })
      .select()
      .single();

    if (saleError || !sale) {
      console.error("[checkout] sale_insert_failed", {
        stage: "insert_sale_before_seat_locks",
        flow_origin: "public_checkout",
        paymentEnvironment: runtimePaymentEnvironment ?? null,
        paymentMethod,
        eventId: event.id,
        companyId: event.company_id,
        expectedPassengers: quantity,
        submittedPassengers: passengers.length,
        selectedSeatsCount: selectedSeats.length,
        error: saleError ? {
          code: saleError.code,
          message: saleError.message,
          details: saleError.details,
          hint: saleError.hint,
        } : null,
      });
      const isRlsError =
        saleError?.code === "42501" ||
        saleError?.message?.includes("row-level security");
      const msg = isRlsError
        ? "Este evento não está disponível para compra online no momento."
        : "Erro ao finalizar compra. Tente novamente.";
      toast.error(msg);
      preOpenedPaymentTab?.close();
      setSubmitting(false);
      setPaymentCheckoutStatus("idle");
      return;
    }

    // === Step 2: Create temporary seat locks (15 min expiry) already linked to the sale ===
    const lockExpiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const seatLockInserts = selectedSeats.map((seatId) => ({
      trip_id: tripId!,
      seat_id: seatId,
      sale_id: sale.id,
      company_id: event.company_id,
      expires_at: lockExpiresAt,
    }));

    const { error: lockError } = await supabase
      .from("seat_locks")
      .insert(seatLockInserts);

    if (lockError) {
      console.error("[checkout] seat_locks_insert_failed", {
        stage: "insert_seat_locks_after_sale",
        flow_origin: "public_checkout",
        paymentEnvironment: runtimePaymentEnvironment ?? null,
        paymentMethod,
        saleId: sale.id,
        eventId: event.id,
        companyId: event.company_id,
        expectedPassengers: quantity,
        submittedPassengers: passengers.length,
        selectedSeatsCount: selectedSeats.length,
        seatIds: selectedSeats,
        error: {
          code: lockError.code,
          message: lockError.message,
          details: lockError.details,
          hint: lockError.hint,
        },
      });
      await supabase.from("sales").delete().eq("id", sale.id);
      if (lockError.code === "23505") {
        toast.error(
          "Um ou mais assentos já estão sendo reservados por outro comprador. Escolha outros.",
        );
        await fetchOccupiedSeats(tripId!, () => true);
      } else {
        toast.error(
          "Erro ao reservar assentos temporariamente. Tente novamente.",
        );
      }
      preOpenedPaymentTab?.close();
      setSubmitting(false);
      setPaymentCheckoutStatus("idle");
      return;
    }

    // === Step 3: Create sale_passengers (staging for webhook ticket generation) ===
    const passengerInserts = selectedSeats.map((seatId, i) => ({
      // Snapshot por passageiro para auditoria da regra de benefício da fase 1.
      ...(() => {
        const snapshot = snapshotsToPersist[i];
        if (!snapshot) {
          const typePrice = Number(passengers[i]?.ticket_type_price ?? 0);
          const basePrice = roundCurrency(typePrice > 0 ? typePrice : getSeatPrice(seatId));
          return {
            benefit_program_id: null,
            benefit_program_name: null,
            benefit_type: null,
            benefit_value: null,
            original_price: basePrice,
            discount_amount: 0,
            final_price: basePrice,
            benefit_applied: false,
            pricing_rule_version: BENEFIT_PRICING_RULE_VERSION,
          };
        }
        return snapshot;
      })(),
      sale_id: sale.id,
      seat_id: seatId,
      seat_label: seatLabelMap[seatId] || String(i + 1),
      passenger_name: passengers[i].name.trim(),
      passenger_cpf: passengers[i].cpf.replace(/\D/g, ""),
      passenger_phone: passengers[i].phone.replace(/\D/g, "") || null,
      trip_id: tripId!,
      sort_order: i,
      company_id: event.company_id,
      ticket_type_id: resolvePersistedTicketTypeId(passengers[i].ticket_type_id),
      ticket_type_name: passengers[i].ticket_type_name || "Adulto",
      ticket_type_price: Number(passengers[i].ticket_type_price ?? 0),
    }));

    // Add return trip passengers if applicable
    if (shouldCreateReturn && returnTripId) {
      passengers.forEach((passenger, i) => {
        passengerInserts.push({
          sale_id: sale.id,
          seat_id: null as string | null,
          seat_label: `VOLTA-${i + 1}`,
          passenger_name: passenger.name.trim(),
          passenger_cpf: passenger.cpf.replace(/\D/g, ""),
          passenger_phone: passenger.phone.replace(/\D/g, "") || null,
          trip_id: returnTripId,
          sort_order: selectedSeats.length + i,
          company_id: event.company_id,
          ticket_type_id: resolvePersistedTicketTypeId(passengers[i].ticket_type_id),
          ticket_type_name: passengers[i].ticket_type_name || "Adulto",
          ticket_type_price: Number(passengers[i].ticket_type_price ?? 0),
          // Trecho complementar de volta: nesta fase o valor cobrado já está
          // consolidado na ida; mantemos snapshot zerado para não duplicar o total.
          benefit_program_id: null,
          benefit_program_name: null,
          benefit_type: null,
          benefit_value: null,
          original_price: 0,
          discount_amount: 0,
          final_price: 0,
          benefit_applied: false,
          pricing_rule_version: BENEFIT_PRICING_RULE_VERSION,
        });
      });
    }

    const invalidPassengerPayload = passengerInserts
      .map((row, index) => ({
        index,
        missingFields: [
          !row.sale_id ? "sale_id" : null,
          !row.trip_id ? "trip_id" : null,
          !row.company_id ? "company_id" : null,
          !row.seat_label ? "seat_label" : null,
          !row.passenger_name ? "passenger_name" : null,
          !row.passenger_cpf || row.passenger_cpf.length !== 11 ? "passenger_cpf" : null,
          !Number.isFinite(Number(row.original_price)) ? "original_price" : null,
          !Number.isFinite(Number(row.final_price)) ? "final_price" : null,
        ].filter((field): field is string => Boolean(field)),
      }))
      .filter((row) => row.missingFields.length > 0);

    if (invalidPassengerPayload.length > 0) {
      console.error("[checkout] sale_passengers_payload_invalid", {
        stage: "validate_sale_passengers_payload_before_insert",
        flow_origin: "public_checkout",
        paymentEnvironment: runtimePaymentEnvironment ?? null,
        paymentMethod,
        saleId: sale.id,
        eventId: event.id,
        companyId: event.company_id,
        expectedPassengers: quantity,
        submittedPassengers: passengerInserts.length,
        outboundTripPassengers: selectedSeats.length,
        returnTripPassengers: shouldCreateReturn && returnTripId ? passengers.length : 0,
        invalidPassengerPayload,
      });
      await supabase.from("seat_locks").delete().eq("sale_id", sale.id);
      await supabase.from("sales").delete().eq("id", sale.id);
      toast.error("Erro ao registrar dados dos passageiros. Revise os dados e tente novamente.");
      preOpenedPaymentTab?.close();
      setSubmitting(false);
      setPaymentCheckoutStatus("idle");
      return;
    }

    const { error: passengersError } = await supabase
      .from("sale_passengers")
      .insert(passengerInserts);

    if (passengersError) {
      console.error("[checkout] sale_passengers_insert_failed", {
        stage: "insert_sale_passengers",
        flow_origin: "public_checkout",
        saleId: sale.id,
        eventId: event.id,
        companyId: event.company_id,
        tripId,
        returnTripId: shouldCreateReturn ? returnTripId : null,
        error: {
          code: passengersError.code,
          message: passengersError.message,
          details: passengersError.details,
          hint: passengersError.hint,
        },
        passengers: passengers.map((passenger, index) => ({
          index,
          seatId: selectedSeats[index] ?? null,
          seatLabel: seatLabelMap[selectedSeats[index]] ?? null,
          cpfMasked: maskCpfForLog(passenger.cpf),
          phoneMasked: maskPhoneForLog(passenger.phone),
          ticketTypeOrigin: resolveTicketTypeOriginForLog(passenger.ticket_type_id),
          persistedTicketTypeId: resolvePersistedTicketTypeId(passenger.ticket_type_id),
          ticketTypeName: passenger.ticket_type_name || "Adulto",
          ticketTypePrice: Number(passenger.ticket_type_price ?? 0),
        })),
      });
      // Rollback
      await supabase.from("seat_locks").delete().eq("sale_id", sale.id);
      await supabase.from("sales").delete().eq("id", sale.id);
      toast.error("Erro ao registrar dados dos passageiros. Tente novamente.");
      preOpenedPaymentTab?.close();
      setSubmitting(false);
      setPaymentCheckoutStatus("idle");
      return;
    }

    // === Step 4: Create Asaas payment and open in new tab ===
    try {
      const { data: checkoutData, error: checkoutError } =
        await supabase.functions.invoke("create-asaas-payment", {
          body: {
            sale_id: sale.id,
            payment_method: paymentMethod,
            payment_environment: runtimePaymentEnvironment,
            terms_acceptance: termsAcceptancePayload,
          },
        });

      if (!checkoutError && checkoutData?.url) {
        console.info(
          "Checkout público: cobrança Asaas gerada, iniciando abertura da fatura",
          {
            saleId: sale.id,
            paymentMethod,
            hasPreOpenedPaymentTab: Boolean(preOpenedPaymentTab),
          },
        );
        // Reaproveita a aba já aberta no clique para não cair em bloqueio de pop-up.
        if (preOpenedPaymentTab) {
          preOpenedPaymentTab.location.href = checkoutData.url;
        } else {
          const openedTab = window.open(checkoutData.url, "_blank");
          if (!openedTab) {
            // Comentário de suporte: fallback manual para quando o navegador bloquear a abertura automática.
            setManualCheckoutUrl(checkoutData.url);
            setPaymentCheckoutStatus("popup_blocked");
            setSubmitting(false);
            toast.error(
              "Não conseguimos abrir a cobrança automaticamente. Toque em 'Abrir cobrança agora'.",
            );
            return;
          }
        }
        setSubmitting(false);
        setPaymentCheckoutStatus("idle");
        // Navigate to waiting/confirmation screen in current tab
        navigate(`/confirmacao/${sale.id}`);
        return;
      }

      // Parse error response
      let errorBody = checkoutData;
      if (checkoutError && !errorBody) {
        try {
          errorBody = await (checkoutError as CheckoutErrorWithContext).context?.json?.();
        } catch {
          /* ignore parse failure */
        }
      }

      const errorCode = errorBody?.error_code ?? errorBody?.error;
      const errorMessage = errorBody?.message ?? errorBody?.error;

      if (errorCode === "no_asaas_account") {
        // Company has no Asaas — fallback to reservation (keep as pendente)
        console.log("Asaas not configured, falling back to confirmation");
        preOpenedPaymentTab?.close();
        setSubmitting(false);
        setPaymentCheckoutStatus("idle");
        navigate(`/confirmacao/${sale.id}`);
        return;
      }

      if (
        errorCode === "terms_acceptance_required" ||
        errorCode === "terms_acceptance_persist_failed" ||
        errorCode === "terms_acceptance_validate_failed"
      ) {
        console.error("[checkout] terms_acceptance_payment_blocked", {
          stage: "terms_acceptance_insert",
          saleId: sale.id,
          eventId: event.id,
          companyId: event.company_id,
          termVersionIds: eventTerms.map((term) => term.termVersionId),
          errorCode,
          errorMessage,
        });
        await supabase.from("seat_locks").delete().eq("sale_id", sale.id);
        await supabase.from("sale_passengers").delete().eq("sale_id", sale.id);
        await supabase.from("sales").delete().eq("id", sale.id);
        toast.error(
          "Não foi possível registrar o aceite dos termos deste evento. Tente novamente.",
        );
        preOpenedPaymentTab?.close();
        setSubmitting(false);
        setPaymentCheckoutStatus("idle");
        return;
      }

      if (errorCode === "company_asaas_unauthorized") {
        console.error("[checkout] company_asaas_unauthorized", {
          saleId: sale.id,
          eventId: event.id,
          companyId: event.company_id,
        });
        await supabase.from("seat_locks").delete().eq("sale_id", sale.id);
        await supabase.from("sale_passengers").delete().eq("sale_id", sale.id);
        await supabase.from("sales").delete().eq("id", sale.id);
        toast.error(
          "Pagamentos desta empresa estão temporariamente indisponíveis. Entre em contato com o organizador do evento.",
        );
        preOpenedPaymentTab?.close();
        setSubmitting(false);
        setPaymentCheckoutStatus("idle");
        return;
      }

      // Generic error — rollback everything
      preserveCheckoutFailureTrace({
        saleId: sale.id,
        stage: "create_asaas_payment_response_error",
        errorCode: typeof errorCode === "string" ? errorCode : null,
        errorMessage:
          typeof errorMessage === "string" && errorMessage.trim().length > 0
            ? errorMessage
            : "Erro ao iniciar pagamento. Tente novamente.",
      });

      toast.error(
        errorMessage || "Erro ao iniciar pagamento. Tente novamente.",
      );
      // Não deletar sale/sale_passengers em falhas de integridade financeira:
      // precisamos do snapshot para diagnóstico em /admin/diagnostico-pagamentos.
      // Liberamos apenas os assentos (seat_locks) e marcamos a venda como cancelada.
      await supabase.from("seat_locks").delete().eq("sale_id", sale.id);
      await supabase
        .from("sales")
        .update({ status: "cancelado" })
        .eq("id", sale.id);
      preOpenedPaymentTab?.close();
      setSubmitting(false);
      setPaymentCheckoutStatus("error");
      return;
    } catch (err) {
      // Network error or edge function unavailable — fallback to confirmation
      preserveCheckoutFailureTrace({
        saleId: sale.id,
        stage: "create_asaas_payment_invoke_exception",
        errorCode: "checkout_payment_invoke_exception",
        errorMessage: err instanceof Error ? err.message : String(err),
      });

      console.log(
        "Asaas checkout not available, falling back to confirmation:",
        err,
      );
      preOpenedPaymentTab?.close();
      setSubmitting(false);
      setPaymentCheckoutStatus("idle");
      navigate(`/confirmacao/${sale.id}`);
    }
  };

  // Format the departure info for display
  const displayTime = departureTime ? departureTime.slice(0, 5) : null;

  // ---- Render ----

  if (loading) {
    return (
      <PublicLayout>
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Carregando...</p>
        </div>
      </PublicLayout>
    );
  }

  if (!event || !trip || !location) {
    return (
      <PublicLayout>
        <div className="max-w-lg mx-auto px-4 py-8 text-center">
          <p className="text-muted-foreground mb-4">
            Dados inválidos para esta compra.
          </p>
          <Button onClick={() => navigate("/eventos")}>Ver eventos</Button>
        </div>
      </PublicLayout>
    );
  }

  return (
    <PublicLayout>
      <div className="max-w-lg mx-auto px-4 py-6 space-y-6 pb-32">
        {/* Header with back & step indicator */}
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0"
            onClick={() => {
              if (step > 1) {
                setStep((currentStep) => currentStep - 1);
                window.scrollTo({ top: 0, behavior: "smooth" });
              } else {
                navigate(-1);
              }
            }}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-lg font-bold">
              {step === 1
                ? "Escolha seus assentos"
                : step === 2
                  ? "Dados dos passageiros"
                  : "Escolha a forma de pagamento"}
            </h1>
            <p className="text-xs text-muted-foreground">Etapa {step} de 3</p>
          </div>
        </div>

        {/* Event summary */}
        <EventSummaryCard event={event} compact />

        {/* Purchase info strip */}
        <div className="flex items-center gap-3 text-sm text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
          <div className="flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5" />
            <span className="truncate">{location.name}</span>
          </div>
          {displayTime && (
            <>
              <Separator orientation="vertical" className="h-4" />
              <div className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                <span>{displayTime}</span>
              </div>
            </>
          )}
          <Separator orientation="vertical" className="h-4" />
          <div className="flex items-center gap-1.5">
            <Ticket className="h-3.5 w-3.5" />
            <span>{quantity}x</span>
          </div>
        </div>

        {/* Resumo compacto: mantém transparência de preço sem competir com o conteúdo principal. */}
        <Collapsible
          open={isSummaryExpanded}
          onOpenChange={setIsSummaryExpanded}
        >
          <div className="rounded-lg border bg-card px-3 py-2">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground truncate">
                Total:{" "}
                <span className="font-semibold text-foreground">
                  {formatCurrencyBRL(checkoutSummary.grandTotal)}
                </span>{" "}
                • Passagens: {selectedSeats.length || quantity} • Assento:{" "}
                {seatLabels.length > 0 ? seatLabels.join(", ") : "—"}
              </p>
              <CollapsibleTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                >
                  {isSummaryExpanded ? "Ocultar detalhes" : "Ver detalhes"}
                </Button>
              </CollapsibleTrigger>
            </div>

            <CollapsibleContent className="pt-2 space-y-1.5">
              <div className="flex justify-between gap-3 text-sm">
                <span className="text-muted-foreground">Embarque</span>
                <span className="font-medium text-right">
                  {location.name}
                  {displayTime ? ` • ${displayTime}` : ""}
                </span>
              </div>
              <div className="flex justify-between gap-3 text-sm">
                <span className="text-muted-foreground">
                  Assento{seatLabels.length > 1 ? "s" : ""}
                </span>
                <span className="font-medium text-right">
                  {seatLabels.length > 0
                    ? seatLabels.join(", ")
                    : "Não selecionado"}
                </span>
              </div>
              <div className="flex justify-between gap-3 text-sm">
                <span className="text-muted-foreground">Passagens</span>
                <span className="font-medium text-right">
                  {selectedSeats.length || quantity}
                </span>
              </div>
              {eventTicketTypes.length > 1 && (() => {
                const counts = passengers.reduce<Record<string, number>>((acc, p) => {
                  const name = p.ticket_type_name || "Padrão";
                  acc[name] = (acc[name] ?? 0) + 1;
                  return acc;
                }, {});
                const entries = Object.entries(counts);
                if (entries.length === 0) return null;
                return (
                  <div className="flex justify-between gap-3 text-sm">
                    <span className="text-muted-foreground">Tipos</span>
                    <span className="font-medium text-right">
                      {entries.map(([name, qty]) => `${qty}× ${name}`).join(" · ")}
                    </span>
                  </div>
                );
              })()}
              {checkoutSummary.hasBenefitsApplied ? (
                <>
                  {/* Regra visual: só mostramos “Subtotal com benefício” quando houver desconto real aplicado. */}
                  <div className="flex justify-between gap-3 text-sm">
                    <span className="text-muted-foreground">Subtotal original</span>
                    <span className="font-medium text-right">
                      {formatCurrencyBRL(checkoutSummary.originalSubtotal)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3 text-sm">
                    <span className="text-muted-foreground">Benefício aplicado</span>
                    <span className="font-medium text-right">
                      {checkoutSummary.benefitDescription}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3 text-sm">
                    <span className="text-muted-foreground">Desconto benefício</span>
                    <span className="font-medium text-right text-emerald-700">
                      - {formatCurrencyBRL(checkoutSummary.benefitDiscountTotal)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3 text-sm">
                    <span className="text-muted-foreground">Subtotal com benefício</span>
                    <span className="font-medium text-right">
                      {formatCurrencyBRL(checkoutSummary.subtotalAfterBenefits)}
                    </span>
                  </div>
                </>
              ) : (
                <div className="flex justify-between gap-3 text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-medium text-right">
                    {formatCurrencyBRL(checkoutSummary.subtotalAfterBenefits)}
                  </span>
                </div>
              )}
              {checkoutSummary.hasFeeLines && (
                <div className="flex justify-between gap-3 text-sm">
                  <span className="text-muted-foreground">
                    Taxas
                  </span>
                  <span className="font-medium text-right">
                    {formatCurrencyBRL(checkoutSummary.totalFees)}
                  </span>
                </div>
              )}
              <div className="flex justify-between gap-3 text-sm font-semibold border-t pt-2">
                <span>Total</span>
                <span>{formatCurrencyBRL(checkoutSummary.grandTotal)}</span>
              </div>
            </CollapsibleContent>
          </div>
        </Collapsible>

        {/* ============ STEP 1: Seat Selection ============ */}
        {step === 1 && (
          <>
            {seatStatusError && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
                <p className="text-destructive font-medium">
                  {seatStatusError}
                </p>
                <p className="text-muted-foreground text-xs mt-1">
                  Você pode tentar novamente sem sair desta tela.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={handleRetrySeatStatus}
                  disabled={loadingSeatStatus}
                >
                  {loadingSeatStatus ? "Tentando..." : "Tentar novamente"}
                </Button>
              </div>
            )}

            <SeatMap
              seats={seats}
              occupiedSeatIds={occupiedSeatIds}
              blockedSeatIds={blockedSeatIds}
              maxSelection={quantity}
              selectedSeats={selectedSeats}
              onSelectionChange={setSelectedSeats}
              floors={trip.vehicle?.floors ?? 1}
              seatsLeftSide={
                trip.vehicle?.seats_left_side ??
                (trip.vehicle?.type === "van" ? 2 : 2)
              }
              seatsRightSide={
                trip.vehicle?.seats_right_side ??
                (trip.vehicle?.type === "van" ? 1 : 2)
              }
              loadingStatus={loadingSeatStatus || generatingSeats}
              interactionDisabled={generatingSeats}
            />

            <div className="h-1" />
          </>
        )}

        {/* ============ STEP 2: Passenger Data (Accordion) ============ */}
        {step === 2 && (
          <>
            {/* Selected seats summary */}
            <div className="flex flex-wrap gap-1.5">
              {selectedSeats.map((seatId) => (
                <span
                  key={seatId}
                  className="inline-flex items-center gap-1 bg-primary/10 text-primary text-xs font-medium px-2 py-1 rounded-md"
                >
                  Assento {seatLabelMap[seatId]}
                </span>
              ))}
            </div>

            {/* Passenger accordion */}
            <div className="space-y-2">
              {passengers.map((passenger, idx) => {
                const isComplete = isPassengerComplete(passenger);
                const seatLabel = seatLabelMap[selectedSeats[idx]];
                const isOpen = openPassengerIdx === idx;
                const passengerSnapshot = passengerBenefitSnapshots[idx];
                const hasError = Object.keys(errors).some((k) =>
                  k.startsWith(`${idx}_`),
                );

                return (
                  <Collapsible
                    key={selectedSeats[idx]}
                    open={isOpen}
                    onOpenChange={(open) =>
                      setOpenPassengerIdx(open ? idx : null)
                    }
                  >
                    <CollapsibleTrigger className="flex items-center justify-between w-full px-4 py-3 bg-card border rounded-lg hover:bg-muted/30 transition-colors text-left">
                      <div className="flex items-center gap-2 min-w-0">
                        <User className="h-4 w-4 text-primary shrink-0" />
                        <span className="text-sm font-medium truncate">
                          Assento {seatLabel} —{" "}
                          {passenger.name.trim() || "Pendente"}
                        </span>
                        {eventTicketTypes.length > 1 && passenger.ticket_type_name && (
                          <Badge variant="outline" className="text-[10px] shrink-0">
                            {passenger.ticket_type_name}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {hasError ? (
                          <Badge
                            variant="destructive"
                            className="text-[10px] px-1.5 py-0"
                          >
                            <AlertCircle className="h-3 w-3 mr-0.5" />
                            Erro
                          </Badge>
                        ) : isComplete ? (
                          <Badge className="bg-green-100 text-green-700 border-green-200 text-[10px] px-1.5 py-0">
                            <CheckCircle2 className="h-3 w-3 mr-0.5" />
                            OK
                          </Badge>
                        ) : (
                          <Badge
                            variant="secondary"
                            className="bg-amber-100 text-amber-700 border-amber-200 text-[10px] px-1.5 py-0"
                          >
                            Pendente
                          </Badge>
                        )}
                        {isOpen ? (
                          <ChevronUp className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    </CollapsibleTrigger>

                    <CollapsibleContent className="px-4 pb-4 pt-2 border border-t-0 rounded-b-lg bg-card space-y-3">
                      {eventTicketTypes.length > 1 && (
                        <div className="space-y-1.5">
                          <Label className="text-sm font-medium">Tipo de passagem *</Label>
                          <Select
                            value={passenger.ticket_type_id}
                            onValueChange={(value) => {
                              const selectedType = eventTicketTypes.find((item) => item.id === value);
                              if (!selectedType) return;
                              // Ajuste de reatividade: mudança de tipo precisa refletir no total imediatamente
                              // e invalida snapshot anterior para evitar usar benefício calculado com preço antigo.
                              setPassengerBenefitSnapshots((prev) => {
                                if (!prev[idx]) return prev;
                                const next = [...prev];
                                next[idx] = null;
                                return next;
                              });
                              setPassengers((prev) => prev.map((row, rowIdx) => rowIdx === idx ? {
                                ...row,
                                ticket_type_id: selectedType.id,
                                ticket_type_name: selectedType.name,
                                ticket_type_price: selectedType.price,
                              } : row));
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione o tipo" />
                            </SelectTrigger>
                            <SelectContent>
                              {eventTicketTypes.map((type) => (
                                <SelectItem key={type.id} value={type.id}>
                                  {type.name} — {formatCurrencyBRL(type.price)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <p className="text-xs text-muted-foreground">
                            Define o valor cobrado deste passageiro.
                          </p>
                        </div>
                      )}
                      <div className="space-y-1.5">
                        <Label htmlFor={`name-${idx}`} className="text-sm">
                          Nome completo
                        </Label>
                        <Input
                          id={`name-${idx}`}
                          value={passenger.name}
                          onChange={(e) =>
                            updatePassenger(idx, "name", e.target.value)
                          }
                          placeholder="Nome do passageiro"
                          maxLength={100}
                        />
                        {errors[`${idx}_name`] && (
                          <p className="text-xs text-destructive">
                            {errors[`${idx}_name`]}
                          </p>
                        )}
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor={`cpf-${idx}`} className="text-sm">
                          CPF
                        </Label>
                        <Input
                          id={`cpf-${idx}`}
                          value={passenger.cpf}
                          onChange={(e) =>
                            updatePassenger(idx, "cpf", e.target.value)
                          }
                          placeholder="000.000.000-00"
                          inputMode="numeric"
                          autoComplete="off"
                          maxLength={14}
                        />
                        {errors[`${idx}_cpf`] && (
                          <p className="text-xs text-destructive">
                            {errors[`${idx}_cpf`]}
                          </p>
                        )}
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor={`phone-${idx}`} className="text-sm">
                          Telefone (opcional)
                        </Label>
                        <Input
                          id={`phone-${idx}`}
                          value={passenger.phone}
                          onChange={(e) =>
                            updatePassenger(idx, "phone", e.target.value)
                          }
                          placeholder="(00) 00000-0000"
                          inputMode="tel"
                          autoComplete="tel"
                          maxLength={15}
                        />
                      </div>
                      {passengerSnapshot?.benefit_applied && (
                        <div className="rounded-md border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-xs space-y-1">
                          <p className="font-medium text-emerald-800">
                            Benefício aplicado
                          </p>
                          <p className="text-emerald-900">
                            {passengerSnapshot.benefit_program_name}
                          </p>
                          <div className="flex items-center justify-between gap-2 text-emerald-900">
                            <span>Desconto</span>
                            <span className="font-medium">
                              - {formatCurrencyBRL(passengerSnapshot.discount_amount)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-2 text-emerald-900">
                            <span>Preço original</span>
                            <span>{formatCurrencyBRL(passengerSnapshot.original_price)}</span>
                          </div>
                          <div className="flex items-center justify-between gap-2 text-emerald-900">
                            <span>Preço final</span>
                            <span className="font-semibold">
                              {formatCurrencyBRL(passengerSnapshot.final_price)}
                            </span>
                          </div>
                        </div>
                      )}
                    </CollapsibleContent>
                  </Collapsible>
                );
              })}
            </div>

            {/* Payer selection */}
            {passengers.length > 1 && (
              <div className="space-y-3 bg-muted/30 rounded-lg p-4 border">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <User className="h-4 w-4 text-primary" />
                  Responsável pelo pagamento
                </h3>
                <RadioGroup
                  value={String(payerIndex)}
                  onValueChange={(v) => setPayerIndex(Number(v))}
                  className="space-y-2"
                >
                  {passengers.map((p, idx) => {
                    const seatLabel = seatLabelMap[selectedSeats[idx]];
                    const displayName = p.name.trim() || "Não preenchido";
                    const displayCpf = p.cpf || "—";
                    return (
                      <label
                        key={idx}
                        className="flex items-center gap-3 p-3 rounded-lg border bg-card cursor-pointer hover:bg-muted/30 transition-colors"
                      >
                        <RadioGroupItem value={String(idx)} />
                        <div className="text-sm min-w-0">
                          <div className="font-medium truncate">
                            Assento {seatLabel} — {displayName}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            CPF: {displayCpf}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </RadioGroup>
              </div>
            )}

            <div className="h-1" />
          </>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-base font-semibold">
                Escolha a forma de pagamento
              </h2>
              <p className="text-sm text-muted-foreground">
                Selecione como deseja concluir a compra.
              </p>
            </div>

            <RadioGroup
              value={paymentMethod}
              onValueChange={(value) =>
                setPaymentMethod(value as PaymentMethod)
              }
              className="grid gap-3 md:grid-cols-2"
            >
              <label className={`flex items-start gap-3 p-4 rounded-lg border bg-card transition-colors has-[:checked]:border-primary has-[:checked]:ring-2 has-[:checked]:ring-primary/20 ${isPixReadyForCurrentEnvironment ? "cursor-pointer hover:bg-muted/30" : "cursor-not-allowed opacity-60"}`}>
                <RadioGroupItem
                  value="pix"
                  className="mt-1"
                  disabled={!isPixReadyForCurrentEnvironment}
                />
                <div className="space-y-1">
                  <p className="font-semibold">Pix</p>
                  <p className="text-sm text-muted-foreground">
                    {isPixReadyForCurrentEnvironment
                      ? "Pagamento instantâneo via Pix."
                      : "Indisponível no momento para a empresa deste evento."}
                  </p>
                </div>
              </label>

              <label className="flex items-start gap-3 p-4 rounded-lg border bg-card cursor-pointer hover:bg-muted/30 transition-colors has-[:checked]:border-primary has-[:checked]:ring-2 has-[:checked]:ring-primary/20">
                <RadioGroupItem value="credit_card" className="mt-1" />
                <div className="space-y-1">
                  <p className="font-semibold">Cartão de crédito</p>
                  <p className="text-sm text-muted-foreground">
                    Pagamento seguro com cartão de crédito.
                  </p>
                </div>
              </label>
            </RadioGroup>
            {!isPixReadyForCurrentEnvironment && runtimePaymentEnvironment && (
              <p className="text-xs text-amber-700">
                O Pix foi temporariamente desabilitado para este evento porque a conta da empresa ainda não está pronta para recebimento no ambiente atual.
              </p>
            )}

            <EventTermsAcceptanceCard
              terms={eventTerms}
              loading={loadingEventTerms}
              error={eventTermsError}
              accepted={eventTermsAccepted}
              onAcceptedChange={setEventTermsAccepted}
            />

            {/* Aceite explícito obrigatório: reforça transparência sobre papel da plataforma e responsabilidade operacional da organizadora. */}
            <div
              className={`rounded-lg border p-4 space-y-2 ${!intermediationAccepted ? "border-orange-500/40 bg-orange-500/5" : "bg-card"}`}
            >
              <div className="flex items-start gap-3">
                <Checkbox
                  id="intermediation-acceptance"
                  checked={intermediationAccepted}
                  onCheckedChange={(checked) =>
                    setIntermediationAccepted(checked === true)
                  }
                  className="mt-0.5"
                />
                <div className="space-y-1">
                  <Label
                    htmlFor="intermediation-acceptance"
                    className="cursor-pointer leading-snug"
                  >
                    {getCheckoutResponsibilityAcceptanceLabel(eventCompanyName)}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {CHECKOUT_RESPONSIBILITY_HELPER_TEXT}
                  </p>
                  <Link
                    to="/politica-de-intermediacao"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary underline underline-offset-2"
                  >
                    Ler política de intermediação e responsabilidade
                  </Link>
                </div>
              </div>
            </div>

            {submitting && (
              <div className="rounded-md border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-900 space-y-1">
                <p className="font-medium">
                  Estamos preparando os detalhes da sua cobrança
                </p>
                <p>Isso pode levar alguns segundos. Não feche esta tela.</p>
              </div>
            )}

            {paymentCheckoutStatus === "popup_blocked" && manualCheckoutUrl && (
              <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-3 text-sm text-amber-900 space-y-2">
                <p className="font-medium">
                  A abertura automática foi bloqueada no navegador.
                </p>
                <p>Toque no botão abaixo para abrir a cobrança manualmente.</p>
                <Button
                  type="button"
                  onClick={() => {
                    const openedTab = window.open(manualCheckoutUrl, "_blank");
                    if (!openedTab) {
                      toast.error(
                        "Ainda não foi possível abrir a cobrança. Verifique o bloqueio de pop-ups e tente novamente.",
                      );
                      return;
                    }
                    setManualCheckoutUrl(null);
                    setPaymentCheckoutStatus("idle");
                  }}
                >
                  Abrir cobrança agora
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Barra fixa mobile: total sempre visível + CTA principal + atalho discreto para o detalhamento. */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85">
        <div className="max-w-lg mx-auto px-4 py-2.5 space-y-1.5">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">
                Total {formatCurrencyBRL(checkoutSummary.grandTotal)}
              </p>
              <p className="text-[11px] text-muted-foreground truncate">
                {seatLabels.length > 0
                  ? `Assento ${seatLabels.join(", ")}`
                  : "Assento não selecionado"}
              </p>
            </div>

            {step === 1 ? (
              <Button
                className="h-10 px-4"
                disabled={
                  selectedSeats.length !== quantity ||
                  generatingSeats ||
                  submitting
                }
                onClick={handleAdvanceToPassengers}
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Continuar"
                )}
              </Button>
            ) : step === 2 ? (
              <Button
                className="h-10 px-4"
                disabled={submitting}
                onClick={async () => {
                  if (!validatePassengers()) {
                    const firstErrorKey = Object.keys(errors)[0];
                    if (firstErrorKey) {
                      const idx = parseInt(firstErrorKey.split("_")[0]);
                      setOpenPassengerIdx(idx);
                    }
                    return;
                  }

                  setSubmitting(true);
                  // Regra oficial da fase 1: decisão do benefício ocorre na transição
                  // Passageiros -> Pagamento para garantir previsibilidade auditável.
                  const resolvedSnapshots = await resolvePassengerBenefitSnapshots();
                  setSubmitting(false);
                  // Regra de negócio obrigatória: mesmo se benefício falhar tecnicamente,
                  // o checkout deve continuar com fallback seguro (sem desconto) usando o tipo selecionado.
                  const snapshotsForStep =
                    resolvedSnapshots.length === passengers.length
                      ? resolvedSnapshots
                      : selectedSeats.map((seatId, index) => {
                          const typePrice = Number(passengers[index]?.ticket_type_price ?? 0);
                          const basePrice = roundCurrency(typePrice > 0 ? typePrice : getSeatPrice(seatId));
                          return {
                            benefit_program_id: null,
                            benefit_program_name: null,
                            benefit_type: null,
                            benefit_value: null,
                            original_price: basePrice,
                            discount_amount: 0,
                            final_price: basePrice,
                            benefit_applied: false,
                            pricing_rule_version: BENEFIT_PRICING_RULE_VERSION,
                          } satisfies PassengerBenefitSnapshot;
                        });

                  if (resolvedSnapshots.length !== passengers.length) {
                    // Fallback explícito na transição Passageiros -> Pagamento:
                    // inconsistência de snapshot nunca pode travar o avanço do checkout.
                    console.error("[checkout] benefit_snapshot_shape_fallback", {
                      stage: "passengers_to_payment_transition",
                      context: "step_transition",
                      flow_origin: "public_checkout",
                      environment: import.meta.env.MODE,
                      eventId: event?.id,
                      companyId: event?.company_id,
                      expectedPassengers: passengers.length,
                      receivedSnapshots: resolvedSnapshots.length,
                      reason: "snapshot_length_mismatch",
                    });
                  }

                  setPassengerBenefitSnapshots(snapshotsForStep);
                  setStep(3);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Continuar"
                )}
              </Button>
            ) : (
              <Button
                className="h-10 px-4"
                disabled={
                  submitting ||
                  !intermediationAccepted ||
                  isEventTermsPaymentBlocked
                }
                onClick={handleSubmit}
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Continuar para pagamento"
                )}
              </Button>
            )}
          </div>


          {step === 3 && eventTermsRequireAcceptance && !eventTermsAccepted && (
            <p className="text-[11px] font-medium text-orange-700">
              Para continuar, aceite os termos obrigatórios deste evento.
            </p>
          )}

          <button
            type="button"
            className="text-xs text-muted-foreground underline underline-offset-2"
            onClick={() => setIsSummaryExpanded((prev) => !prev)}
          >
            {isSummaryExpanded ? "Ocultar resumo" : "Ver resumo"}
          </button>
        </div>
      </div>
    </PublicLayout>
  );
}
