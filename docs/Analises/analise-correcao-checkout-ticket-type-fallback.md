# Análise de correção — Checkout público com fallback de tipo de passagem

Data da correção: 2026-05-11

## 1. Causa raiz confirmada

A falha do checkout público para eventos sem tipos de passagem cadastrados estava no payload de `sale_passengers`.

Quando não havia registros ativos em `event_ticket_types`, o checkout criava corretamente um fallback visual/local para manter a UI e o cálculo pelo preço base do evento. Esse fallback usava o identificador sintético `__default_base_type__`.

O problema era que esse identificador sintético também era enviado para `sale_passengers.ticket_type_id`, coluna que aceita apenas UUID ou `null`. Assim, eventos simples/legados sem tipo real podiam falhar no insert dos passageiros antes da chamada de `create-asaas-payment`.

## 2. Arquivos alterados

- `src/pages/public/Checkout.tsx`
  - adiciona helpers locais para identificar UUID real, fallback sintético e mascarar telefone em logs;
  - mantém o fallback visual/local do checkout público;
  - normaliza `ticket_type_id` para `null` antes de persistir quando o valor não é UUID real;
  - melhora o log técnico do erro de insert em `sale_passengers` sem expor CPF/telefone completos.

## 3. Explicação da correção

A correção é mínima e localizada no checkout público:

1. O fallback `__default_base_type__` continua existindo para controlar estado local e exibição da UI.
2. Antes do insert em `sale_passengers`, o checkout valida se `ticket_type_id` é um UUID real.
3. Se for UUID real, persiste o valor normalmente.
4. Se for fallback sintético, vazio ou qualquer string não UUID, persiste `null`.
5. Os snapshots financeiros continuam preservados:
   - `ticket_type_name`;
   - `ticket_type_price`;
   - `original_price`;
   - `final_price`;
   - descontos/benefícios;
   - versão da regra de preço.

A correção não altera venda manual, Asaas, split, wallet, taxas, RLS ou schema.

## 4. Antes/depois do comportamento

### Antes

Para evento sem tipo de passagem, o checkout montava o passageiro com:

```json
{
  "ticket_type_id": "__default_base_type__",
  "ticket_type_name": "Adulto",
  "ticket_type_price": 80
}
```

Esse valor era enviado diretamente para `sale_passengers.ticket_type_id` e podia ser rejeitado pelo banco por não ser UUID.

### Depois

Para evento sem tipo de passagem, o estado local ainda pode conter o fallback visual, mas o payload persistido passa a ser:

```json
{
  "ticket_type_id": null,
  "ticket_type_name": "Adulto",
  "ticket_type_price": 80
}
```

Para evento com tipo real cadastrado, o UUID real continua sendo persistido em `sale_passengers.ticket_type_id`.

## 5. Diagnóstico/logs aprimorados

O log técnico do erro de passageiros agora registra:

- estágio `insert_sale_passengers`;
- origem `public_checkout`;
- `saleId`, `eventId`, `companyId`, `tripId` e `returnTripId`;
- código/mensagem/detalhes/hint do erro retornado pelo Supabase;
- lista de passageiros com:
  - índice;
  - assento;
  - CPF mascarado;
  - telefone mascarado;
  - origem do tipo (`real_uuid`, `fallback_base_type`, `empty`, `invalid_non_uuid`);
  - `ticket_type_id` que seria persistido após normalização;
  - nome e preço do tipo.

A mensagem para o usuário permanece genérica para não expor detalhe técnico.

## 6. Riscos evitados

- Não foi alterado o tipo da coluna `ticket_type_id`.
- Não foi relaxada política RLS.
- Não houve workaround específico para BUSÃO OFF OFF.
- Não houve alteração em `create-asaas-payment`.
- Não houve alteração em split, wallet, taxas ou ambiente Asaas.
- Não houve alteração no fluxo administrativo de venda manual.
- O fallback visual continua disponível para eventos simples/legados.

## 7. Testes realizados

Testes/checks executados localmente:

- `npx eslint src/pages/public/Checkout.tsx` — passou no arquivo alterado.
- `npm run build` — passou.
- `npm run lint` — executado, mas falhou por débitos preexistentes fora do escopo (ex.: `no-explicit-any` em múltiplos arquivos administrativos/edge functions e `no-require-imports` em `tailwind.config.ts`).
- `npm test` — executado, mas falhou por divergências preexistentes em testes de `asaasIntegrationStatus`, sem relação com o checkout público alterado.
- `npm test -- --runInBand` — tentativa inválida; Vitest não aceita a opção Jest `--runInBand`.
- `git diff --check` — sem problemas de whitespace.
- `git status --short` — usado para conferir o conjunto final de arquivos alterados.

Validações por leitura de código:

- Evento sem tipo de passagem: `__default_base_type__` é mantido na UI, mas `sale_passengers.ticket_type_id` recebe `null`.
- Evento com tipo real: UUID válido continua sendo persistido.
- Venda manual administrativa: nenhum arquivo do fluxo admin foi alterado.
- Evento sem serviço vinculado: o fluxo de passagem não depende de serviço para criar `sale_passengers`.
- Chamada Asaas: permanece no mesmo ponto do fluxo, depois do insert bem-sucedido em `sale_passengers`.
- Rollback em erro: permanece executando remoção de `seat_locks` e tentativa de remoção de `sales` quando o insert de passageiros falha.

## 8. Pendências

- Validar em ambiente integrado/Supabase real o checkout público da BUSÃO OFF OFF para confirmar:
  - registro de `sale_passengers` com `ticket_type_id = null`;
  - preservação de `ticket_type_name` e `ticket_type_price`;
  - chamada subsequente de `create-asaas-payment`;
  - geração da cobrança para cartão e Pix conforme configuração da empresa.
- Validar uma empresa que já vende normalmente para confirmar ausência de regressão com tipos de passagem reais.
