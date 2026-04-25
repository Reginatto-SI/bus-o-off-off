# Análise 2 — Blindagem de reabertura para vendas legadas sem `asaas_payment_id`

## 1. Resumo executivo
Foi analisado o fluxo de **Reabrir cobrança** após a correção da etapa anterior e implementada uma blindagem mínima para vendas legadas sem `asaas_payment_id`.

A estratégia principal foi mantida sem alterações: quando há `asaas_payment_id`, a função consulta diretamente `GET /payments/{id}`.

A blindagem adicionada atua somente no cenário legado (`asaas_payment_id` ausente): busca controlada no Asaas por `externalReference = sale.id`, com regra determinística estrita, sem recriar cobrança, sem heurística e sem inferir ambiente por host.

---

## 2. Confirmação do padrão
Sim. O padrão oficial de criação confirma `externalReference = sale.id`:

- Em `supabase/functions/create-asaas-payment/index.ts`, o payload da cobrança envia `externalReference: sale.id`.
- O projeto também usa esse contrato no webhook para correlação da venda.

Portanto, `externalReference = sale.id` é uma referência oficial válida para fallback legado.

---

## 3. Estratégia adotada
Implementação concentrada em `supabase/functions/get-asaas-payment-link/index.ts`:

1. Carrega venda por `sale_id` e valida status reabrível (`pendente_pagamento`/`reservado`).
2. Resolve contexto com `company_id + payment_environment` da venda (mesma lógica de ambiente do fluxo principal).
3. **Caminho principal (inalterado):**
   - se `asaas_payment_id` existir, consulta `GET /payments/{asaas_payment_id}`.
4. **Fallback legado (novo, controlado):**
   - se `asaas_payment_id` não existir, consulta `GET /payments?externalReference={sale.id}&limit=10`.
   - aplica filtro estrito por `externalReference === sale.id`.
   - aceita somente **1 resultado inequívoco**.
   - se encontrar 1 cobrança válida, retorna `invoiceUrl` e persiste `asaas_payment_id` recuperado (somente se ainda estiver nulo).
5. Em qualquer ambiguidade ou ausência de correspondência, recusa com `reason` específico.

Sem criação de novo endpoint e sem alteração de checkout/webhook/verify.

---

## 4. Critério determinístico
A cobrança localizada por fallback só é aceita quando:

- busca por `externalReference = sale.id` retorna dados válidos;
- após filtro estrito por `externalReference` exato, há **exatamente 1** cobrança;
- cobrança contém `id` válido.

Regras de recusa explícita:

- `no_payment_found_by_external_reference` (nenhuma cobrança inequívoca)
- `multiple_payments_for_external_reference` (ambiguidade)
- `payment_missing_id_in_gateway_payload` (payload inconsistente)

Sem seleção por “mais provável” e sem heurística.

---

## 5. Arquivos alterados
1. `supabase/functions/get-asaas-payment-link/index.ts`
   - correção final da resolução de contexto (sem uso de propriedade inexistente `paymentContext.ok`)
   - fallback legado por `externalReference`
   - persistência defensiva de `asaas_payment_id` recuperado
   - novos motivos específicos (`reason`) e logs operacionais

2. `src/pages/public/Confirmation.tsx`
   - mensagens de erro específicas para os novos `reason` do fallback legado

---

## 6. Riscos avaliados

- **Duplicidade de cobrança:** não há risco novo, pois o fluxo não cria cobrança (somente leitura/consulta).
- **Fluxo paralelo:** não foi criado; é extensão do endpoint existente.
- **Ambiente incorreto:** mitigado por resolução via `payment_environment` da venda + credenciais da empresa.
- **Associação incorreta em legado:** mitigada por critério estrito de unicidade; em dúvida, recusa.
- **Impacto no checkout atual:** baixo, pois checkout não foi alterado.

---

## 7. Checklist de validação

- [ ] venda nova com `asaas_payment_id`
- [ ] venda legada sem `asaas_payment_id`
- [ ] venda legada com cobrança localizada por `externalReference`
- [ ] venda legada sem cobrança localizada
- [ ] venda com múltiplas cobranças possíveis
- [ ] venda com cobrança sem `invoiceUrl`
- [ ] sandbox
- [ ] produção
- [ ] empresa errada não deve acessar cobrança
- [ ] status pago/cancelado continuam não reabríveis

---

## 8. Resultado final

- **Fallback implementado:** sim.
- **Quando é usado:** apenas quando `asaas_payment_id` está ausente.
- **Quando se recusa a agir:** ausência de cobrança, múltiplas cobranças, contexto inválido, sem chave, payload inconsistente.
- **Persistência segura do `asaas_payment_id`:** sim, realizada de forma defensiva (`update ... is null`) para evitar sobrescrever vínculo já existente.
