import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

const SITE_NAME = 'SmartBus BR'
const FROM_EMAIL = 'SmartBus BR <noreply@smartbusbr.com.br>'
const SITE_URL = 'https://www.smartbusbr.com.br'

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

const EMAIL_SUBJECTS: Record<AuthEmailType, string> = {
  signup: 'Ative sua conta — SmartBus BR',
  recovery: 'Criar nova senha — SmartBus BR',
  magiclink: 'Seu link de acesso — SmartBus BR',
}

function buildEmailHtml(type: AuthEmailType, actionLink: string, _userName?: string): string {
  const configs: Record<AuthEmailType, { title: string; description: string; buttonText: string }> = {
    signup: {
      title: 'Bem-vindo ao SmartBus BR!',
      description: 'Sua conta foi criada. Clique no botão abaixo para ativar seu acesso e definir sua senha.',
      buttonText: 'Ativar minha conta',
    },
    recovery: {
      title: 'Redefinição de senha',
      description: 'Você solicitou a redefinição da sua senha. Clique no botão abaixo para criar uma nova senha.',
      buttonText: 'Redefinir senha',
    },
    magiclink: {
      title: 'Seu link de acesso',
      description: 'Clique no botão abaixo para acessar o sistema com este link de acesso único.',
      buttonText: 'Acessar agora',
    },
  }

  const cfg = configs[type]

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${cfg.title}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <tr>
            <td style="padding:32px 32px 0 32px;text-align:center;">
              <h1 style="margin:0 0 8px 0;font-size:22px;color:#18181b;font-weight:700;">${cfg.title}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 24px 32px;text-align:center;">
              <p style="margin:0 0 24px 0;font-size:15px;line-height:1.6;color:#52525b;">
                ${cfg.description}
              </p>
              <a href="${actionLink}" target="_blank" style="display:inline-block;background-color:#18181b;color:#ffffff;text-decoration:none;padding:12px 32px;border-radius:6px;font-size:15px;font-weight:600;">
                ${cfg.buttonText}
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 8px 32px;text-align:center;">
              <p style="margin:0;font-size:12px;color:#a1a1aa;">
                Se você não reconhece esta ação, ignore este e-mail.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 32px 24px 32px;text-align:center;">
              <p style="margin:0;font-size:12px;color:#a1a1aa;">
                ${SITE_NAME} — ${SITE_URL}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

function buildPlainText(type: AuthEmailType, actionLink: string): string {
  const configs: Record<AuthEmailType, string> = {
    signup: `Bem-vindo ao SmartBus BR!\n\nSua conta foi criada. Acesse o link abaixo para ativar seu acesso:\n\n${actionLink}\n\nSe você não reconhece esta ação, ignore este e-mail.\n\n${SITE_NAME} — ${SITE_URL}`,
    recovery: `Redefinição de senha — SmartBus BR\n\nVocê solicitou a redefinição da sua senha. Acesse o link abaixo para criar uma nova senha:\n\n${actionLink}\n\nSe você não solicitou isso, ignore este e-mail.\n\n${SITE_NAME} — ${SITE_URL}`,
    magiclink: `Seu link de acesso — SmartBus BR\n\nAcesse o link abaixo para entrar no sistema:\n\n${actionLink}\n\nSe você não solicitou isso, ignore este e-mail.\n\n${SITE_NAME} — ${SITE_URL}`,
  }
  return configs[type]
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

  try {
    const html = buildEmailHtml(type, actionLink, userName)
    const text = buildPlainText(type, actionLink)
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
