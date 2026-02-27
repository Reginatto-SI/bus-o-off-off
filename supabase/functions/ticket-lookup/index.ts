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

    if (!event_id || typeof event_id !== "string") {
      return new Response(
        JSON.stringify({ error: "event_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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
      .select("*, sale:sales(*, event:events(*), boarding_location:boarding_locations(*)), trip:trips(*, vehicle:vehicles(type, plate), driver:drivers!trips_driver_id_fkey(name))")
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

    // 2. Filter by event
    const filtered = ticketRows.filter((t: any) => t.trip?.event_id === event_id);

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
        .select("id, name, trade_name, logo_url, city, state, primary_color, cnpj, phone, whatsapp, address, slogan")
        .in("id", companyIds);

      for (const c of companyRows ?? []) {
        companyMap.set(c.id, c);
      }
    }

    // 4. Fetch event fees
    const { data: feesData } = await supabaseAdmin
      .from("event_fees")
      .select("*")
      .eq("event_id", event_id)
      .eq("is_active", true);

    const eventFees = (feesData || []).map((f: any) => ({
      name: f.name,
      fee_type: f.fee_type,
      value: f.value,
      is_active: true,
    }));

    // 5. Fetch boarding departure times for each ticket
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

      // Return only the fields the frontend needs — no raw sale record
      // saleId e stripeCheckoutSessionId retornados para o frontend poder
      // exibir o ID da passagem e verificar o status de pagamento no Stripe.
      results.push({
        ticketId: t.id,
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
        boardingLocationName: t.sale?.boarding_location?.name || "",
        boardingLocationAddress: t.sale?.boarding_location?.address || "",
        boardingDepartureTime,
        boardingDepartureDate,
        saleStatus: t.sale?.status || "reservado",
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
      });
    }

    return new Response(
      JSON.stringify({ tickets: results, eventFees }),
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
