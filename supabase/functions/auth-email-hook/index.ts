import * as React from 'npm:react@18.3.1'
import { renderAsync } from 'npm:@react-email/components@0.0.22'
import { SignupEmail } from '../_shared/email-templates/signup.tsx'
import { InviteEmail } from '../_shared/email-templates/invite.tsx'
import { MagicLinkEmail } from '../_shared/email-templates/magic-link.tsx'
import { RecoveryEmail } from '../_shared/email-templates/recovery.tsx'
import { EmailChangeEmail } from '../_shared/email-templates/email-change.tsx'
import { ReauthenticationEmail } from '../_shared/email-templates/reauthentication.tsx'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

// ── Configuration ──────────────────────────────────────────────────────
const SITE_NAME = 'SmartBus BR'
const FROM_EMAIL = 'SmartBus BR <noreply@smartbusbr.com.br>'

const EMAIL_SUBJECTS: Record<string, string> = {
  signup: 'Confirme seu e-mail — SmartBus BR',
  invite: 'Você foi convidado — SmartBus BR',
  magiclink: 'Seu link de acesso — SmartBus BR',
  recovery: 'Criar nova senha — SmartBus BR',
  email_change: 'Confirmação de alteração de e-mail — SmartBus BR',
  reauthentication: 'Seu código de verificação — SmartBus BR',
}

const EMAIL_TEMPLATES: Record<string, React.ComponentType<any>> = {
  signup: SignupEmail,
  invite: InviteEmail,
  magiclink: MagicLinkEmail,
  recovery: RecoveryEmail,
  email_change: EmailChangeEmail,
  reauthentication: ReauthenticationEmail,
}

// ── Resend sender ──────────────────────────────────────────────────────
async function sendViaResend(
  to: string,
  subject: string,
  html: string,
  text: string,
): Promise<{ success: boolean; error?: string; resendId?: string }> {
  const resendApiKey = Deno.env.get('RESEND_API_KEY')
  if (!resendApiKey) {
    return { success: false, error: 'RESEND_API_KEY não configurada' }
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [to],
      subject,
      html,
      text,
    }),
  })

  const body = await res.json()

  if (!res.ok) {
    const errMsg = body?.message || body?.error || JSON.stringify(body)
    console.error('Resend API error', { status: res.status, body })
    return { success: false, error: `Resend ${res.status}: ${errMsg}` }
  }

  return { success: true, resendId: body.id }
}

// ── Auth webhook handler ───────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const payload = await req.json()

    // Supabase Auth hook payload — the email type comes from different fields
    // depending on the hook version. We support both.
    const emailType =
      payload?.data?.action_type ||  // newer hook format
      payload?.action_type ||        // legacy format
      payload?.type                  // fallback
    const recipientEmail = payload?.data?.email || payload?.email
    const confirmationUrl = payload?.data?.url || payload?.url || ''
    const token = payload?.data?.token || payload?.token || ''
    const newEmail = payload?.data?.new_email || payload?.new_email || ''

    if (!emailType || !recipientEmail) {
      console.error('Payload inválido: tipo ou e-mail ausente', { emailType, recipientEmail })
      return new Response(
        JSON.stringify({ error: 'Payload inválido: tipo ou e-mail ausente' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    console.log('Auth email recebido', { emailType, email: recipientEmail })

    const EmailTemplate = EMAIL_TEMPLATES[emailType]
    if (!EmailTemplate) {
      console.error('Tipo de e-mail desconhecido', { emailType })
      return new Response(
        JSON.stringify({ error: `Tipo de e-mail desconhecido: ${emailType}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Build template props
    const templateProps = {
      siteName: SITE_NAME,
      siteUrl: 'https://www.smartbusbr.com.br',
      recipient: recipientEmail,
      confirmationUrl,
      token,
      email: recipientEmail,
      newEmail,
    }

    // Render HTML + plain text
    const html = await renderAsync(React.createElement(EmailTemplate, templateProps))
    const text = await renderAsync(React.createElement(EmailTemplate, templateProps), {
      plainText: true,
    })

    const subject = EMAIL_SUBJECTS[emailType] || 'SmartBus BR — Notificação'

    // Send via Resend
    const result = await sendViaResend(recipientEmail, subject, html, text)

    if (!result.success) {
      console.error('Falha ao enviar e-mail via Resend', {
        emailType,
        email: recipientEmail,
        error: result.error,
      })
      return new Response(
        JSON.stringify({ error: result.error }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    console.log('E-mail enviado com sucesso via Resend', {
      emailType,
      email: recipientEmail,
      resendId: result.resendId,
    })

    return new Response(
      JSON.stringify({ success: true, resendId: result.resendId }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error) {
    console.error('Erro no auth-email-hook:', error)
    const message = error instanceof Error ? error.message : 'Erro desconhecido'
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
