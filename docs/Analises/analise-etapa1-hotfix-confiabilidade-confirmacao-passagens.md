# Análise — Etapa 1 (Hotfix imediato)

## Objetivo da etapa
Aplicar correção cirúrgica para impedir falso positivo de pagamento confirmado sem passagem gerada e melhorar rastreabilidade do polling automático na confirmação pública.

## Alterações implementadas

### 1) `verify-payment-status` agora reconcilia venda já paga sem ticket
Arquivo: `supabase/functions/verify-payment-status/index.ts`

- Quando a venda já está com `status = pago`, a função **não retorna mais imediatamente**.
- Antes de responder sucesso, executa validação de existência de tickets.
- Se não houver tickets, tenta reconciliação imediata reaproveitando o fluxo já existente (`createTicketsFromPassengers`).
- Se continuar sem ticket após reconciliação, retorna **409** com:
  - `error_code: paid_sale_without_tickets`
  - `paymentStatus: inconsistente_sem_passagem`

### 2) `verify-payment-status` só finaliza pagamento confirmado como sucesso se ticket existir
Arquivo: `supabase/functions/verify-payment-status/index.ts`

- No caminho em que Asaas retorna `CONFIRMED/RECEIVED/RECEIVED_IN_CASH`, após atualizar venda para `pago`:
  - mantém tentativa de geração de tickets
  - limpa `seat_locks`
  - **revalida existência de tickets ao final**
- Se não houver ticket, retorna **409** com:
  - `error_code: ticket_generation_incomplete`
  - `paymentStatus: inconsistente_sem_passagem`

### 3) Polling da confirmação pública deixou de engolir erro
Arquivo: `src/pages/public/Confirmation.tsx`

- Removeu padrão silencioso de `catch(() => {})` na chamada automática de `verify-payment-status`.
- Mantida UX discreta (sem toast em loop), mas agora com `console.error` contextualizado:
  - `sale_id`
  - tentativa (`attempts`)
  - erro retornado/exceção

## Risco anterior
- O sistema podia reportar/propagar `paymentStatus: pago` sem ticket gerado.
- Isso permitia inconsistência crítica no fluxo principal (pagamento confirmado sem passagem/QR para o cliente).

## Comportamento após o hotfix

1. **Venda já paga + ticket existe** → resposta normal `pago`.
2. **Venda já paga + sem ticket** → tenta reconciliação.
3. **Reconciliação falha** → resposta explícita de inconsistência (sem sucesso falso).
4. **Confirmação via Asaas agora** → só responde como saudável se houver ticket ao final.
5. **Falha no polling automático** → erro técnico registrado no console para diagnóstico.

## O que fica para a Etapa 2
- Unificar rotina de finalização de pagamento entre webhook e verify em módulo único.
- Padronizar contrato de retorno e logs de finalização em ambos os fluxos.
