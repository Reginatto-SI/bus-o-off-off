

## Plano: Padronizar Envio de E-mails via Resend

### Diagnóstico confirmado
- `generateLink` no `create-user` e `admin-user-auth-support` gera links mas NÃO envia e-mail
- O `auth-email-hook` já usa Resend corretamente, mas só é acionado por fluxos nativos do Supabase Auth (signup direto, resetPasswordForEmail), não por `generateLink`
- `RESEND_API_KEY` já está configurada como secret

### Arquitetura proposta

```text
┌─────────────────────────────┐
│  Edge Function              │
│  (create-user /             │
│   admin-user-auth-support)  │
│                             │
│  1. generateLink(type)      │
│  2. sendAuthEmail(Resend)   │  ← NOVO helper compartilhado
│  3. log em email_send_log   │
│  4. retorno claro           │
└─────────────────────────────┘
```

### Etapas de implementação

**1. Criar helper compartilhado `_shared/auth-email-resend.ts`**
- Função `sendAuthEmailViaResend({ to, type, actionLink, userName })`
- Monta HTML com templates inline por tipo (signup, recovery, magiclink)
- Envia via Resend API usando `RESEND_API_KEY`
- Registra resultado em `email_send_log` (recipient_email, template_name, status, error_message)
- Remetente: `SmartBus BR <noreply@smartbusbr.com.br>` (já usado no auth-email-hook)

**2. Ajustar `create-user/index.ts`**
- Após criar usuário e vincular role, gerar link de signup com `generateLink({ type: 'signup' })`
- Extrair `action_link` do resultado
- Chamar `sendAuthEmailViaResend` com tipo `signup`
- Incluir resultado do envio no response (sent/failed + warning se falhar)

**3. Ajustar `admin-user-auth-support/index.ts`**
- Nas ações `send_recovery`, `resend_confirmation` e `generate_magic_link`:
  - Após `generateLink`, extrair `action_link`
  - Chamar `sendAuthEmailViaResend` com o tipo correspondente
  - Retornar status detalhado do envio
- Mensagens de erro contextualizadas (nunca genéricas)

**4. Corrigir build errors nos testes**
- Adicionar `allow_manual_reservations` como campo obrigatório nos mocks de Company em `asaasIntegrationStatus.test.ts` e `src/test/asaasIntegrationStatus.test.ts`

**5. Deploy das Edge Functions**
- Deploy de `create-user` e `admin-user-auth-support`

### O que NÃO muda
- Fluxo visual do frontend `/admin/usuarios`
- Estrutura de roles, auth, multiempresa
- `auth-email-hook` existente (continua funcionando para fluxos nativos)
- Tabela `email_send_log` (já existe com estrutura adequada)

