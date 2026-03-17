# Resumo da etapa

- Esta Etapa 2 centralizou a finalização de pagamento em uma rotina compartilhada usada por `asaas-webhook` e `verify-payment-status`.
- Objetivo: eliminar duplicidade crítica de regras de finalização (status pago, geração/reconciliação de tickets, limpeza de locks, tratamento de inconsistência).
- Resultado: ambos os fluxos agora delegam o núcleo da finalização para o mesmo helper (`finalizeConfirmedPayment`).

## Duplicidade foi eliminada?
Sim, para a parte crítica de finalização pós-confirmação de pagamento:
- atualização de status para `pago` (quando aplicável)
- geração/reconciliação de tickets
- validação de consistência (sem ticket => inconsistente)
- limpeza de `seat_locks`
- retorno estruturado e idempotente

---

# Arquivos alterados

1. `supabase/functions/_shared/payment-finalization.ts`
   - **Novo helper compartilhado**.
   - Responsável por:
     - criação/reconciliação de tickets (`createTicketsFromPassengersShared`)
     - finalização padronizada (`finalizeConfirmedPayment`)
     - validação de consistência (não permite sucesso saudável sem ticket)
     - limpeza de `seat_locks`
     - log homogêneo de finalização (quando configurado)

2. `supabase/functions/asaas-webhook/index.ts`
   - `processPaymentConfirmed` passa a delegar para `finalizeConfirmedPayment`.
   - Remove lógica paralela de confirmação + ticket + lock cleanup no webhook.

3. `supabase/functions/verify-payment-status/index.ts`
   - caminho de venda já `pago` delega para `finalizeConfirmedPayment` (modo reconciliação/idempotente)
   - caminho de confirmação Asaas também delega para `finalizeConfirmedPayment`
   - mantém responsabilidades próprias do verify (consulta Asaas e retorno de status)

---

# Antes vs depois

## Antes
- Webhook e verify tinham fluxos próprios, duplicados e com comportamentos assimétricos.
- Resultado operacional podia divergir entre entrada por webhook e entrada por verify.

## Depois
- Webhook e verify usam a **mesma rotina de finalização**.
- O comportamento crítico ficou padronizado para:
  - venda já processada
  - reconciliação de venda paga sem ticket
  - idempotência de chamadas repetidas
  - erro de inconsistência sem mascarar sucesso

---

# Pontos de idempotência

1. Verifica ticket existente antes de inserir (`tickets` por `sale_id`).
2. Se já existe ticket, não duplica criação (`skipped_existing`).
3. Chamada repetida (webhook duplicado/verify repetido) retorna estado previsível.
4. Limpeza de `seat_locks` é feita de forma segura por `sale_id`.

---

# Riscos mitigados

- Reduzido risco de divergência entre webhook e verify na finalização.
- Reduzido risco de “cada entrada finaliza de um jeito”.
- Reduzido risco de falso positivo sem ticket em caminhos duplicados de código.

---

# Limitações que ainda restam

- Não há job automático de reconciliação em lote (Etapa 3).
- Não há painel operacional dedicado de diagnóstico (Etapa 4).
- Observabilidade ainda pode evoluir para trilha mais rica por `sale_id` em timeline única.

---

# Recomendação objetiva

- **Sim**, é seguro avançar para a Etapa 3.
- Não há bloqueio técnico crítico para avançar.
- Próximo passo recomendado: reconciliação automática e recuperação de inconsistências históricas/pendentes.

---

# Checklist de validação (sandbox)

- [ ] Webhook confirma pagamento e gera ticket via rotina compartilhada
- [ ] Verify confirma pagamento e gera ticket via rotina compartilhada
- [ ] Venda já paga com ticket retorna estado idempotente saudável
- [ ] Venda paga sem ticket aciona reconciliação
- [ ] Repetição de webhook/verify não duplica ticket
- [ ] Limpeza de `seat_locks` ocorre sem efeito colateral
- [ ] Logs mínimos continuam registrando finalização e inconsistência
