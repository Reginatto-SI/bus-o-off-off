# Correção — diagnóstico Pix com `account_id` local não bloqueante

## 1) Causa do bug

No fluxo novo do card, a ausência de `gateway_pix_ready` no payload era tratada no frontend como `false` por fallback implícito.

Com isso, em cenários de diagnóstico incompleto, a conclusão podia virar indevidamente:
- **"Pix indisponível: sem chave ACTIVE"**

Essa conclusão era precipitada quando ainda não havia evidência suficiente do gateway.

## 2) Arquivos alterados

- `supabase/functions/check-asaas-integration/index.ts`
- `src/components/admin/AsaasDiagnosticPanel.tsx`
- `src/pages/admin/Company.tsx`

## 3) Como ficou a nova lógica

### Backend (`check-asaas-integration`)
- Mantida a regra de `account_id` local ausente como **não bloqueante** para consulta operacional.
- Adicionado campo explícito de alerta cadastral local:
  - `local_metadata_warning`
- O payload continua trazendo diagnóstico operacional do gateway (Pix/conta/wallet/status) mesmo com ausência de `account_id` local, sempre que as consultas de leitura forem concluídas.

### Frontend (`AsaasDiagnosticPanel`)
- Removido fallback silencioso que convertia `gateway_pix_ready` ausente em `false`.
- Conclusão operacional agora respeita prioridade:
  1. erro real de consulta ao Asaas
  2. pendência cadastral local quando não há consolidação completa
  3. conclusão operacional baseada em dados reais do gateway
  4. divergência local x gateway
- Incluído bloco visual específico para **Pendência cadastral local** separado da conclusão operacional.

## 4) Como validar

1. Abrir `/admin/empresa` com usuário developer.
2. Expandir o card **Diagnóstico Asaas (developer)**.
3. Clicar em **Verificar Pix agora**.
4. Validar cenário com `account_id` local ausente:
   - aparece alerta de pendência cadastral local
   - diagnóstico do gateway é exibido quando disponível
   - não aparece "sem chave ACTIVE" sem evidência de gateway consolidada
5. Validar que `Reconfigurar webhook`, `Copiar diagnóstico Pix` e accordion JSON continuam disponíveis.

## 5) Confirmação de escopo

- Correção restrita ao diagnóstico/admin.
- Não houve alteração em checkout.
- Não houve alteração em create-payment.
- Não houve alteração em cartão de crédito.
- Não houve alteração em fluxo transacional.
