import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { resolveEnvironmentFromHost } from "../_shared/runtime-env.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Expõe o ambiente operacional atual usando EXATAMENTE a mesma regra da API Asaas.
 *
 * Observação importante para suporte:
 * - Este endpoint não altera nenhuma decisão de backend.
 * - Ele apenas reflete a decisão oficial (resolveEnvironmentFromHost) para uso visual no header.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { env, host } = resolveEnvironmentFromHost(req);

    return new Response(
      JSON.stringify({
        payment_environment: env,
        host_detected: host,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("[get-runtime-payment-environment] failed", error);
    return new Response(
      JSON.stringify({ error: "Falha ao resolver ambiente operacional atual" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
