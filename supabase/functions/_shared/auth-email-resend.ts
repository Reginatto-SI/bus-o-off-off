import * as React from 'npm:react@18.3.1'
import { renderAsync } from 'npm:@react-email/components@0.0.22'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { SignupEmail } from './email-templates/signup.tsx'
import { MagicLinkEmail } from './email-templates/magic-link.tsx'
import { RecoveryEmail } from './email-templates/recovery.tsx'

const SITE_NAME = 'SmartBus BR'
const FROM_EMAIL = 'SmartBus BR <noreply@smartbusbr.com.br>'
const SITE_URL = 'https://www.smartbusbr.com.br'

const EMAIL_SUBJECTS: Record<string, string> = {
  signup: 'Ative sua conta — SmartBus BR',
  recovery: 'Criar nova senha — SmartBus BR',
  magiclink: 'Seu link de acesso — SmartBus BR',
}

const EMAIL_TEMPLATES: Record<string, React.ComponentType<any>> = {
  signup: SignupEmail,
  recovery: RecoveryEmail,
  magiclink: MagicLinkEmail,
}

export type AuthEmailType = 'signup' | 'recovery' | 'magiclink'

export interface SendAuthEmailParams {
  to: string
  type: AuthEmailType
  actionLink: string
  userName?: string
}

export interface SendAuthEmailResult {
  success: boolean
  error?: string
  resendId?: string
}

/**
 * Sends an auth email via Resend and logs the result to email_send_log.
 */
export async function sendAuthEmailViaResend(
  params: SendAuthEmailParams,
): Promise<SendAuthEmailResult> {
  const { to, type, actionLink, userName } = params

  const resendApiKey = Deno.env.get('RESEND_API_KEY')
  if (!resendApiKey) {
    await logEmailSend(to, type, 'failed', 'RESEND_API_KEY não configurada')
    return { success: false, error: 'RESEND_API_KEY não configurada' }
  }

  const EmailTemplate = EMAIL_TEMPLATES[type]
  if (!EmailTemplate) {
    await logEmailSend(to, type, 'failed', `Template desconhecido: ${type}`)
    return { success: false, error: `Template de e-mail desconhecido: ${type}` }
  }

  try {
    const templateProps = {
      siteName: SITE_NAME,
      siteUrl: SITE_URL,
      recipient: to,
      confirmationUrl: actionLink,
      token: '',
      email: to,
      newEmail: '',
    }

    const html = await renderAsync(React.createElement(EmailTemplate, templateProps))
    const text = await renderAsync(React.createElement(EmailTemplate, templateProps), {
      plainText: true,
    })

    const subject = EMAIL_SUBJECTS[type] || 'SmartBus BR — Notificação'

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
      console.error('[auth-email-resend] Resend API error', { status: res.status, body })
      await logEmailSend(to, type, 'failed', `Resend ${res.status}: ${errMsg}`)
      return { success: false, error: `Erro ao enviar e-mail via Resend: ${errMsg}` }
    }

    console.log('[auth-email-resend] E-mail enviado com sucesso', {
      type,
      email: to,
      resendId: body.id,
    })
    await logEmailSend(to, type, 'sent', null, body.id)
    return { success: true, resendId: body.id }
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Erro desconhecido no envio'
    console.error('[auth-email-resend] Exceção no envio', { type, email: to, error: msg })
    await logEmailSend(to, type, 'failed', msg)
    return { success: false, error: `Falha inesperada ao enviar e-mail: ${msg}` }
  }
}

/**
 * Logs the email send attempt to email_send_log table.
 * Failures here are non-blocking (best-effort).
 */
async function logEmailSend(
  recipientEmail: string,
  templateName: string,
  status: 'sent' | 'failed',
  errorMessage: string | null,
  messageId?: string,
): Promise<void> {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !supabaseServiceKey) return

    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    await supabase.from('email_send_log').insert({
      recipient_email: recipientEmail,
      template_name: templateName,
      status,
      error_message: errorMessage,
      message_id: messageId || null,
    })
  } catch (err) {
    console.error('[auth-email-resend] Falha ao registrar log de e-mail', err)
  }
}
