# Correção mínima segura — webhook Asaas ignorando eventos externos ao escopo SmartBus

## O que foi alterado

Foi aplicada uma mudança localizada em `supabase/functions/asaas-webhook/index.ts` para ajustar a ordem de triagem:

1. **Nova triagem conservadora antes da resolução de ambiente**
   - Classifica como fora do escopo SmartBus quando:
     - `externalReference` ausente/vazio, ou
     - `externalReference` fora dos padrões oficiais (`uuid` ou `platform_fee_<uuid>`).
2. **Nesses casos, resposta agora é `200` com `ignored=true`**
   - Não retorna mais `400 Sale environment unresolved` para evento claramente externo.
3. **Registro auditável obrigatório**
   - `incident_code: webhook_event_outside_smartbus_scope`
   - inclui `eventType`, `paymentId`, `externalReference`, `account.id` (quando disponível) e `reason`.
4. **Fluxo SmartBus válido foi preservado**
   - referências válidas continuam seguindo para resolução de `payment_environment`, validação de token e processamento normal.

## Por que foi alterado

O problema observado era operacional: eventos sem vínculo de venda SmartBus estavam caindo em `400` antes da triagem de ignore, gerando retry/penalização da fila no Asaas.

A correção aplica a menor mudança segura para:
- evitar pausa de fila por eventos externos,
- manter comportamento previsível e auditável,
- não relaxar validações para eventos SmartBus válidos,
- não introduzir lógica paralela por ambiente/host.

## Arquivos impactados

- `supabase/functions/asaas-webhook/index.ts`
- `analise-87-correcao-webhook-asaas-ignore-eventos-externos.md`

## Risco de regressão

- **Baixo** para checkout e confirmação de pagamento, pois não houve alteração em `create-asaas-payment`, `verify-payment-status` ou `finalizeConfirmedPayment`.
- **Baixo/médio** apenas se algum fluxo legítimo enviar `externalReference` fora do padrão esperado (o que hoje seria fora do contrato oficial SmartBus).
- Mitigação: logs com `incident_code` dedicado para auditoria rápida.

## Checklist objetivo de validação manual

### 1) Evento SmartBus válido continua funcionando
- [x] Validado por inspeção estática: referências `uuid` e `platform_fee_<uuid>` continuam para fluxo normal do webhook.
- [ ] Validar em ambiente: enviar webhook com `externalReference` de venda real e confirmar processamento normal.

### 2) Evento sem `externalReference` não pausa mais fila
- [x] Validado por inspeção estática: agora retorna `200` com `ignored=true` e `incident_code`.
- [ ] Validar em ambiente: reenviar payload sem `externalReference` e confirmar ausência de retry penalizante.

### 3) Evento fora do escopo SmartBus retorna `200`
- [x] Validado por inspeção estática: `externalReference` inválida para padrão SmartBus cai em ignore com `200`.
- [ ] Validar em ambiente: testar com `externalReference` não-UUID e confirmar retorno.

### 4) Logs ficam claros e auditáveis
- [x] Validado por inspeção estática: grava `sale_integration_logs` com `incident_code=webhook_event_outside_smartbus_scope`.
- [ ] Validar em ambiente: consultar logs e confirmar presença de `eventType/paymentId/externalReference/account.id/reason`.

### 5) Não houve alteração indevida no fluxo de pagamento real
- [x] Validado por inspeção estática: nenhuma mudança em checkout, verify e finalização compartilhada.
- [ ] Validar em ambiente: rodada completa de compra + confirmação via webhook e fallback.
