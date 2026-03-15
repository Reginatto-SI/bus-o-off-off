import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { event_id, cpf } = await req.json();
    const normalizedEventId = typeof event_id === "string" && event_id.trim().length > 0
      ? event_id
      : null;

    // Sanitise CPF: keep only digits, must be exactly 11
    const cpfDigits = (cpf || "").replace(/\D/g, "");
    if (cpfDigits.length !== 11) {
      return new Response(
        JSON.stringify({ error: "CPF must have exactly 11 digits" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // 1. Fetch tickets by CPF, joining sales + event + boarding_location + trip
    const { data: ticketRows, error: ticketError } = await supabaseAdmin
      .from("tickets")
      .select("*, sale:sales(*, event:events(*), boarding_location:boarding_locations(*)), trip:trips(*, vehicle:vehicles(type, plate, floors), driver:drivers!trips_driver_id_fkey(name))")
      .eq("passenger_cpf", cpfDigits);

    if (ticketError) {
      console.error("Ticket query error:", ticketError);
      return new Response(
        JSON.stringify({ error: "Failed to query tickets" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!ticketRows || ticketRows.length === 0) {
      return new Response(
        JSON.stringify({ tickets: [] }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Fluxo wizard por CPF: o filtro por evento passa a ser opcional para manter retrocompatibilidade.
    const filtered = normalizedEventId
      ? ticketRows.filter((t: any) => t.trip?.event_id === normalizedEventId)
      : ticketRows;

    if (filtered.length === 0) {
      return new Response(
        JSON.stringify({ tickets: [] }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Fetch company info for each unique company
    const companyIds = [
      ...new Set(
        filtered
          .map((t: any) => t?.sale?.event?.company_id)
          .filter(Boolean)
      ),
    ];

    const companyMap = new Map();
    if (companyIds.length > 0) {
      const { data: companyRows } = await supabaseAdmin
        .from("companies")
.select("id, name, trade_name, logo_url, city, state, primary_color, cnpj, phone, whatsapp, address, slogan, platform_fee_percent")
        .in("id", companyIds);

      for (const c of companyRows ?? []) {
        companyMap.set(c.id, c);
      }
    }

    // 4. Buscar taxas por todos os eventos retornados para suportar múltiplos resultados no mesmo CPF.
    const eventIds = [
      ...new Set(
        filtered
          .map((t: any) => t.trip?.event_id)
          .filter(Boolean)
      ),
    ];

    const { data: feesData } = eventIds.length > 0
      ? await supabaseAdmin
        .from("event_fees")
        .select("event_id, name, fee_type, value")
        .in("event_id", eventIds)
        .eq("is_active", true)
      : { data: [] };

    const eventFeesByEvent = (feesData || []).reduce((acc: Record<string, { name: string; fee_type: string; value: number; is_active: boolean }[]>, fee: any) => {
      const current = acc[fee.event_id] || [];
      current.push({
        name: fee.name,
        fee_type: fee.fee_type,
        value: fee.value,
        is_active: true,
      });
      acc[fee.event_id] = current;
      return acc;
    }, {});

    // 5. Fetch seat data (category, floor) for tickets that have seat_id
    const seatIds = filtered.map((t: any) => t.seat_id).filter(Boolean);
    const seatMap = new Map();
    if (seatIds.length > 0) {
      const { data: seatRows } = await supabaseAdmin
        .from("seats")
        .select("id, category, floor")
        .in("id", seatIds);
      for (const s of seatRows ?? []) {
        seatMap.set(s.id, { category: s.category || "convencional", floor: s.floor || 1 });
      }
    }

    // 6. Fetch boarding departure times for each ticket
    const results = [];
    for (const t of filtered) {
      let boardingDepartureTime = null;
      let boardingDepartureDate = null;

      if (t.sale) {
        const { data: ebl } = await supabaseAdmin
          .from("event_boarding_locations")
          .select("departure_time, departure_date")
          .eq("event_id", t.trip?.event_id)
          .eq("trip_id", t.trip_id)
          .eq("boarding_location_id", t.sale.boarding_location_id)
          .maybeSingle();

        boardingDepartureTime = ebl?.departure_time ?? null;
        boardingDepartureDate = ebl?.departure_date ?? null;
      }

      const companyId = t?.sale?.event?.company_id;
      const company = companyId ? companyMap.get(companyId) ?? null : null;

      const seatInfo = t.seat_id ? seatMap.get(t.seat_id) : null;

      // Return only the fields the frontend needs
      results.push({
        ticketId: t.id,
        ticketNumber: t.ticket_number || null,
        saleId: t.sale_id,
        stripeCheckoutSessionId: t.sale?.stripe_checkout_session_id || null,
        qrCodeToken: t.qr_code_token,
        passengerName: t.passenger_name,
        passengerCpf: t.passenger_cpf,
        seatLabel: t.seat_label,
        boardingStatus: t.boarding_status,
        eventName: t.sale?.event?.name || "",
        eventDate: t.sale?.event?.date || "",
        eventCity: t.sale?.event?.city || "",
        // Mantém modelagem por trecho, mas informa política para a camada de apresentação consolidar quando obrigatório.
        eventTransportPolicy: t.sale?.event?.transport_policy || "trecho_independente",
        eventId: t.trip?.event_id || null,
        boardingToleranceMinutes: t.sale?.event?.boarding_tolerance_minutes ?? null,
        boardingLocationName: t.sale?.boarding_location?.name || "",
        boardingLocationAddress: t.sale?.boarding_location?.address || "",
        boardingDepartureTime,
        boardingDepartureDate,
        saleStatus: t.sale?.status || "reservado",
        saleOrigin: t.sale?.sale_origin || null,
        purchaseConfirmedAt: t.sale?.payment_confirmed_at || ((t.sale?.status === "pago" && !t.sale?.asaas_payment_id) ? (t.sale?.platform_fee_paid_at || null) : null),
        unitPrice: t.sale?.unit_price ?? 0,
        companyName: company?.trade_name || company?.name || "",
        companyLogoUrl: company?.logo_url || null,
        companyCity: company?.city || null,
        companyState: company?.state || null,
        companyPrimaryColor: company?.primary_color || null,
        companyCnpj: company?.cnpj || null,
        companyPhone: company?.phone || null,
        companyWhatsapp: company?.whatsapp || null,
        companyAddress: company?.address || null,
        companySlogan: company?.slogan || null,
        vehicleType: t.trip?.vehicle?.type || null,
        vehiclePlate: t.trip?.vehicle?.plate || null,
        driverName: t.trip?.driver?.name || null,
        seatCategory: seatInfo?.category || null,
        seatFloor: seatInfo?.floor || null,
        vehicleFloors: t.trip?.vehicle?.floors || 1,
        passPlatformFeeToCustomer: Boolean(t.sale?.event?.pass_platform_fee_to_customer),
        platformFeePercent: company?.platform_fee_percent ?? null,
      });
    }

    const firstCompanyId = filtered[0]?.sale?.event?.company_id;

    // 7. Fetch commercial partners for ticket display
    let commercialPartners: { name: string; logo_url: string | null }[] = [];
    if (firstCompanyId) {
      const { data: partnersData } = await supabaseAdmin
        .from("commercial_partners")
        .select("name, logo_url")
        .eq("company_id", firstCompanyId)
        .eq("status", "ativo")
        .eq("show_on_ticket", true)
        .order("display_order", { ascending: true })
        .limit(6);
      commercialPartners = (partnersData || []).map((p: any) => ({ name: p.name, logo_url: p.logo_url }));
    }

    // 8. Fetch event sponsors for ticket display
    let eventSponsors: { name: string; logo_url: string | null }[] = [];
    if (normalizedEventId) {
      const { data: esData } = await supabaseAdmin
        .from("event_sponsors")
        .select("display_order, sponsor:sponsors(name, banner_url, status)")
        .eq("event_id", normalizedEventId)
        .eq("show_on_ticket", true)
        .order("display_order", { ascending: true })
        .limit(6);
      eventSponsors = (esData || [])
        .filter((es: any) => es.sponsor?.status === "ativo")
        .map((es: any) => ({ name: es.sponsor.name, logo_url: es.sponsor.banner_url }));
    }

    return new Response(
      JSON.stringify({ tickets: results, eventFeesByEvent, commercialPartners, eventSponsors }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in ticket-lookup:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
