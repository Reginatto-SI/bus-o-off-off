import { useState, useEffect, useMemo, useCallback } from "react";
import {
  useParams,
  useNavigate,
  useSearchParams,
  Link,
} from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Event, Trip, BoardingLocation, Seat } from "@/types/database";
import { calculateFees, type EventFeeInput } from "@/lib/feeCalculator";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { EventSummaryCard } from "@/components/public/EventSummaryCard";
import { SeatMap } from "@/components/public/SeatMap";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  const [platformFeePercent, setPlatformFeePercent] = useState<number | null>(
    null,
  );
  const [companyPixStatus, setCompanyPixStatus] = useState<{
    productionReady: boolean;
    sandboxReady: boolean;
  } | null>(null);
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

  // Helper: get price for a seat based on category pricing
  const getSeatPrice = (seatId: string): number => {
    if (!event) return 0;
    if (!(event as any).use_category_pricing) return event.unit_price ?? 0;
    const seat = seats.find((s) => s.id === seatId);
    if (!seat) return event.unit_price ?? 0;
    const catPrice = categoryPrices.find((cp) => cp.category === seat.category);
    return catPrice?.price ?? event.unit_price ?? 0;
  };

  const usesCategoryPricing = Boolean((event as any)?.use_category_pricing);
  const eventCompanyName =
    (event as any)?.company?.trade_name ||
    (event as any)?.company?.name ||
    "empresa organizadora";
  const hasMixedPrices =
    usesCategoryPricing &&
    selectedSeats.length > 0 &&
    new Set(selectedSeats.map(getSeatPrice)).size > 1;

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

  // Comentário de suporte: consolidamos os números do resumo em um único memo para evitar
  // divergência visual entre as etapas sem alterar as regras atuais de cálculo.
  const checkoutSummary = useMemo(() => {
    if (!event || platformFeePercent == null) {
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
    const originalSeatsTotal = usesCategoryPricing
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

    const avgUnitPrice = selectedCount > 0
      ? seatsSubtotalAfterBenefits / selectedCount
      : (event.unit_price ?? 0);

    const breakdown = calculateFees(avgUnitPrice, eventFees, {
      passToCustomer: event.pass_platform_fee_to_customer,
      feePercent: platformFeePercent,
    });

    const totalFees = roundCurrency(breakdown.totalFees * selectedCount);
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
      hasFeeLines: breakdown.fees.length > 0,
      hasBenefitsApplied: roundCurrency(totalBenefitDiscount) > 0,
      benefitDescription,
    };
  }, [
    event,
    platformFeePercent,
    selectedSeats,
    usesCategoryPricing,
    eventFees,
    seats,
    categoryPrices,
    passengerBenefitSnapshots,
  ]);
  const fetchOccupiedSeats = useCallback(
    async (tripUuid: string, isActive: () => boolean) => {
      setLoadingSeatStatus(true);
      setSeatStatusError(null);

      try {
        // Fetch tickets AND active seat_locks for this trip
        const [ticketsRes, locksRes] = await Promise.all([
          supabase
            .from("tickets")
            .select("seat_id, sale_id")
            .eq("trip_id", tripUuid),
          supabase
            .from("seat_locks")
            .select("seat_id")
            .eq("trip_id", tripUuid)
            .gt("expires_at", new Date().toISOString()),
        ]);

        if (ticketsRes.error) throw ticketsRes.error;

        if (!isActive()) return;

        const ticketRows = (ticketsRes.data ?? []) as {
          seat_id: string | null;
          sale_id: string | null;
        }[];
        const saleIds = ticketRows
          .map((t) => t.sale_id)
          .filter(Boolean) as string[];

        // Identify admin blocks (BLOQUEIO sales)
        let blockedSales = new Set<string>();
        if (saleIds.length > 0) {
          const { data: blockedSalesData } = await supabase
            .from("sales")
            .select("id")
            .in("id", saleIds)
            .eq("status", "bloqueado");
          blockedSales = new Set(
            (blockedSalesData ?? []).map((s: { id: string }) => s.id),
          );
        }

        const blockedSeats = ticketRows
          .filter((t) => t.seat_id && t.sale_id && blockedSales.has(t.sale_id))
          .map((t) => t.seat_id as string);

        // Occupied = tickets (non-blocked) + active seat_locks
        const occupiedFromTickets = ticketRows
          .filter(
            (t) => t.seat_id && (!t.sale_id || !blockedSales.has(t.sale_id)),
          )
          .map((t) => t.seat_id as string);

        const occupiedFromLocks = (locksRes.data ?? []).map(
          (l: any) => l.seat_id as string,
        );

        const allOccupied = [
          ...new Set([...occupiedFromTickets, ...occupiedFromLocks]),
        ];

        setBlockedSeatIds(blockedSeats);
        setOccupiedSeatIds(allOccupied);
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

          // Fonte de verdade: taxa da empresa dona do evento (sem fallback silencioso).
          const { data: companyData, error: companyError } = await supabase
            .from("companies")
            .select("platform_fee_percent, asaas_pix_ready_production, asaas_pix_ready_sandbox")
            .eq("id", eventData.company_id)
            .single();

          if (companyError || companyData?.platform_fee_percent == null) {
            toast.error(
              "Não foi possível carregar a taxa da plataforma da empresa.",
            );
            navigate(`/eventos/${id}`);
            return;
          }
          setPlatformFeePercent(Number(companyData.platform_fee_percent));
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

          // Fetch category prices if enabled
          if ((eventData as any).use_category_pricing) {
            const { data: catPrices } = await supabase
              .from("event_category_prices")
              .select("category, price")
              .eq("event_id", id!);
            setCategoryPrices(
              (catPrices ?? []).map((cp: any) => ({
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
            const validSeats = existingSeats.filter(
              (s: any) =>
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

  const handleRetrySeatStatus = async () => {
    if (!tripId) return;
    await fetchOccupiedSeats(tripId, () => true);
  };

  // Revalidate seats against the database (tickets + seat_locks), returns true if all OK
  const revalidateSeats = async (): Promise<boolean> => {
    if (!tripId) return false;

    const [ticketsRes, locksRes] = await Promise.all([
      supabase.from("tickets").select("seat_id, sale_id").eq("trip_id", tripId),
      supabase
        .from("seat_locks")
        .select("seat_id")
        .eq("trip_id", tripId)
        .gt("expires_at", new Date().toISOString()),
    ]);

    if (ticketsRes.error) {
      toast.error("Erro ao verificar disponibilidade. Tente novamente.");
      return false;
    }

    const ticketRows = (ticketsRes.data ?? []) as {
      seat_id: string | null;
      sale_id: string | null;
    }[];
    const saleIds = ticketRows
      .map((t) => t.sale_id)
      .filter(Boolean) as string[];

    let blockedSales = new Set<string>();
    if (saleIds.length > 0) {
      const { data: blockedSalesData } = await supabase
        .from("sales")
        .select("id")
        .in("id", saleIds)
        .eq("status", "bloqueado");
      blockedSales = new Set(
        (blockedSalesData ?? []).map((s: { id: string }) => s.id),
      );
    }

    const currentBlocked = ticketRows
      .filter((t) => t.seat_id && t.sale_id && blockedSales.has(t.sale_id))
      .map((t) => t.seat_id as string);

    const occupiedFromTickets = ticketRows
      .filter((t) => t.seat_id && (!t.sale_id || !blockedSales.has(t.sale_id)))
      .map((t) => t.seat_id as string);

    const occupiedFromLocks = (locksRes.data ?? []).map(
      (l: any) => l.seat_id as string,
    );

    const currentOccupied = [
      ...new Set([...occupiedFromTickets, ...occupiedFromLocks]),
    ];

    setBlockedSeatIds(currentBlocked);
    setOccupiedSeatIds(currentOccupied);

    // Check which selected seats are now occupied
    const conflicting = selectedSeats.filter((seatId) =>
      currentOccupied.includes(seatId),
    );
    if (conflicting.length > 0) {
      const remaining = selectedSeats.filter(
        (seatId) => !currentOccupied.includes(seatId),
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

    setPassengers(selectedSeats.map(() => ({ name: "", cpf: "", phone: "" })));
    setPassengerBenefitSnapshots(selectedSeats.map(() => null));
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
        const originalPrice = roundCurrency(getSeatPrice(seatId));

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
    if (!event || platformFeePercent == null) {
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
    const passengerCount = effectiveSnapshots.length;

    const originalSubtotal = roundCurrency(
      effectiveSnapshots.reduce((sum, snapshot) => sum + snapshot.original_price, 0),
    );
    const benefitTotalDiscount = roundCurrency(
      effectiveSnapshots.reduce((sum, snapshot) => sum + snapshot.discount_amount, 0),
    );
    const subtotalAfterBenefits = roundCurrency(
      effectiveSnapshots.reduce((sum, snapshot) => sum + snapshot.final_price, 0),
    );

    const avgFinalPrice =
      passengerCount > 0 ? subtotalAfterBenefits / passengerCount : 0;
    const feeBreakdown = calculateFees(avgFinalPrice, eventFees, {
      passToCustomer: event.pass_platform_fee_to_customer,
      feePercent: platformFeePercent,
    });
    const totalFees = roundCurrency(feeBreakdown.totalFees * passengerCount);
    const grossAmount = roundCurrency(subtotalAfterBenefits + totalFees);

    return {
      originalSubtotal,
      benefitTotalDiscount,
      subtotalAfterBenefits,
      totalFees,
      grossAmount,
    };
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

    // Comentário de suporte: abrimos a aba de pagamento ainda no clique do usuário
    // para evitar bloqueio de pop-up após as etapas assíncronas do checkout.
    const preOpenedPaymentTab = window.open("", "_blank");
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

    // Regra oficial: totais da venda são derivados do snapshot por passageiro.
    if (platformFeePercent == null) {
      toast.error("Taxa da plataforma da empresa indisponível.");
      preOpenedPaymentTab?.close();
      setSubmitting(false);
      setPaymentCheckoutStatus("idle");
      return;
    }

    let snapshotsToPersist = passengerBenefitSnapshots;
    const hasResolvedSnapshots =
      snapshotsToPersist.length === passengers.length &&
      snapshotsToPersist.every((snapshot) => snapshot !== null);
    if (!hasResolvedSnapshots) {
      snapshotsToPersist = await resolvePassengerBenefitSnapshots();
      if (snapshotsToPersist.length !== passengers.length) {
        // Fallback final: se algo inesperado quebrar o shape, mantemos venda com preço base.
        snapshotsToPersist = selectedSeats.map((seatId) => {
          const basePrice = roundCurrency(getSeatPrice(seatId));
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

    // === Step 1: Create temporary seat locks (15 min expiry) ===
    const lockExpiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const seatLockInserts = selectedSeats.map((seatId) => ({
      trip_id: tripId!,
      seat_id: seatId,
      company_id: event.company_id,
      expires_at: lockExpiresAt,
    }));

    const { error: lockError } = await supabase
      .from("seat_locks")
      .insert(seatLockInserts);

    if (lockError) {
      console.error("Seat lock error:", lockError);
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

    // === Step 2: Create sale with pendente_pagamento status ===
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
      console.error("Sale error:", saleError);
      // Rollback seat locks
      await supabase
        .from("seat_locks")
        .delete()
        .in("seat_id", selectedSeats)
        .eq("trip_id", tripId!);
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

    // Update seat locks with sale_id
    await supabase
      .from("seat_locks")
      .update({ sale_id: sale.id })
      .in("seat_id", selectedSeats)
      .eq("trip_id", tripId!);

    // === Step 3: Create sale_passengers (staging for webhook ticket generation) ===
    const passengerInserts = selectedSeats.map((seatId, i) => ({
      // Snapshot por passageiro para auditoria da regra de benefício da fase 1.
      ...(() => {
        const snapshot = snapshotsToPersist[i];
        if (!snapshot) {
          const basePrice = roundCurrency(getSeatPrice(seatId));
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
    }));

    // Add return trip passengers if applicable
    if (shouldCreateReturn && returnTripId) {
      passengers.forEach((passenger, i) => {
        passengerInserts.push({
          sale_id: sale.id,
          seat_id: null as any,
          seat_label: `VOLTA-${i + 1}`,
          passenger_name: passenger.name.trim(),
          passenger_cpf: passenger.cpf.replace(/\D/g, ""),
          passenger_phone: passenger.phone.replace(/\D/g, "") || null,
          trip_id: returnTripId,
          sort_order: selectedSeats.length + i,
          company_id: event.company_id,
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

    const { error: passengersError } = await supabase
      .from("sale_passengers")
      .insert(passengerInserts);

    if (passengersError) {
      console.error("Passengers error:", passengersError);
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
          errorBody = await (checkoutError as any).context?.json?.();
        } catch {
          /* ignore parse failure */
        }
      }

      const errorCode = errorBody?.error_code;
      const errorMessage = errorBody?.error;

      if (errorCode === "no_asaas_account") {
        // Company has no Asaas — fallback to reservation (keep as pendente)
        console.log("Asaas not configured, falling back to confirmation");
        preOpenedPaymentTab?.close();
        setSubmitting(false);
        setPaymentCheckoutStatus("idle");
        navigate(`/confirmacao/${sale.id}`);
        return;
      }

      // Generic error — rollback everything
      toast.error(
        errorMessage || "Erro ao iniciar pagamento. Tente novamente.",
      );
      await supabase.from("sale_passengers").delete().eq("sale_id", sale.id);
      await supabase.from("seat_locks").delete().eq("sale_id", sale.id);
      await supabase.from("sales").delete().eq("id", sale.id);
      preOpenedPaymentTab?.close();
      setSubmitting(false);
      setPaymentCheckoutStatus("error");
      return;
    } catch (err) {
      // Network error or edge function unavailable — fallback to confirmation
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
                  // o checkout deve continuar com fallback seguro (sem desconto).
                  const snapshotsForStep =
                    resolvedSnapshots.length === passengers.length
                      ? resolvedSnapshots
                      : selectedSeats.map((seatId) => {
                          const basePrice = roundCurrency(getSeatPrice(seatId));
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
                disabled={submitting || !intermediationAccepted}
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
