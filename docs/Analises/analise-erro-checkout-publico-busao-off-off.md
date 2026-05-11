# Análise — Erro ao registrar passageiros no checkout público da BUSÃO OFF OFF

Data da análise: 2026-05-11
Escopo: diagnóstico estático/rastreável no repositório, sem alteração de código funcional.

## 1. Resumo executivo do problema

O erro exibido no checkout público — **“Erro ao registrar dados dos passageiros. Tente novamente.”** — acontece no frontend imediatamente após a venda ser criada e antes da chamada da Edge Function `create-asaas-payment`.

A causa raiz provável, com base no código e no schema versionado, é que eventos sem tipos de passagem recebem no checkout público um tipo sintético com `id = "__default_base_type__"`. Esse valor é persistido em `sale_passengers.ticket_type_id`, coluna criada como `uuid null`. Como `"__default_base_type__"` não é UUID, o insert em `sale_passengers` deve falhar no Postgres/PostgREST com erro equivalente a:

```text
invalid input syntax for type uuid: "__default_base_type__"
```

Esse diagnóstico explica por que a venda manual funciona: no fluxo administrativo, quando não há tipo real cadastrado, `ticketTypeId` permanece `null` e é gravado como `null` em `tickets.ticket_type_id`, sem enviar identificador sintético para coluna UUID.

## 2. Fontes oficiais consultadas

### PRDs Asaas

- `docs/PRD/Asaas/02-asaas-fluxo-checkout-e-venda.md`: define o fluxo oficial do checkout: criar `seat_locks`, criar `sales`, criar `sale_passengers` e só depois invocar `create-asaas-payment`.
- `docs/PRD/Asaas/03-asaas-webhook-e-confirmacao.md`: confirma que confirmação/webhook dependem de venda e cobrança já vinculadas ao Asaas; não é o estágio observado neste erro.
- `docs/PRD/Asaas/05-asaas-configuracao-empresa-e-validacao.md`: usado para separar problemas de configuração Asaas de problemas anteriores à criação da cobrança.
- `docs/PRD/Asaas/06-asaas-operacao-erros-e-diagnostico.md`: orienta investigação por logs estruturados, `sale_integration_logs`, diagnóstico de vendas e distinção entre erro de criação de cobrança e erro de fluxo de venda.

### PRDs/telas relacionados

- `docs/PRD/Telas/prd-public-checkout.md`.
- `docs/PRD/Telas/prd-admin-vendas.md`.
- `docs/manual-operacional-smartbus-br/09-realizar-venda-manual-administrativo.md`.
- Análises existentes em `docs/Analises` relacionadas a Asaas, diagnóstico de vendas, cobrança duplicada, integração e fluxo único.

## 3. Fluxo real executado no checkout público

No arquivo `src/pages/public/Checkout.tsx`, o fluxo do botão **Continuar para pagamento** é implementado em `handleSubmit`.

Ordem real observada:

1. Valida passageiros, CPF do pagador, aceite de intermediação e readiness de Pix quando aplicável.
2. Revalida assentos contra `tickets` e `seat_locks`.
3. Calcula snapshots financeiros/benefícios por passageiro.
4. Cria `seat_locks` com `trip_id`, `seat_id`, `company_id` e `expires_at`.
5. Cria `sales` com `status = 'pendente_pagamento'`, `payment_method`, `company_id`, `payment_environment`, totais e dados do comprador.
6. Atualiza `seat_locks.sale_id` com o `sale.id` recém-criado.
7. Monta `passengerInserts` e tenta inserir em `sale_passengers`.
8. Somente se o insert de `sale_passengers` for bem-sucedido, invoca `supabase.functions.invoke("create-asaas-payment")`.

## 4. Ponto exato da falha

A falha ocorre no passo 7, neste insert:

```ts
const { error: passengersError } = await supabase
  .from("sale_passengers")
  .insert(passengerInserts);
```

Quando `passengersError` existe, o código:

1. imprime `console.error("Passengers error:", passengersError)`;
2. remove os `seat_locks` vinculados à venda;
3. tenta apagar a venda recém-criada;
4. exibe o toast genérico **“Erro ao registrar dados dos passageiros. Tente novamente.”**;
5. encerra o fluxo com `return`.

Consequência: a falha acontece **depois da criação de `sales`** e **antes da chamada de `create-asaas-payment`**.

## 5. Arquivos, funções e trechos envolvidos

### Checkout público

Arquivo: `src/pages/public/Checkout.tsx`

Funções/trechos relevantes:

- Carregamento dos tipos de passagem e fallback sintético para evento sem tipo real.
- `handleAdvanceToPassengers`, que inicializa cada passageiro com o tipo padrão.
- `handleSubmit`, que cria `seat_locks`, `sales`, `sale_passengers` e depois chama `create-asaas-payment`.
- Tratamento de erro do insert em `sale_passengers`, que mostra o toast genérico.

### Venda manual administrativa

Arquivo: `src/components/admin/NewSaleModal.tsx`

Funções/trechos relevantes:

- `initPassengers`, que usa `null` quando não há tipo de passagem cadastrado.
- `handleConfirm`, que cria `sales` e depois `tickets`, sem usar `sale_passengers` como staging.

### Schema/RLS

Arquivos relevantes:

- `supabase/migrations/20260311010520_fc7a27bc-058e-418c-b4c9-289ec167e201.sql`:
  - cria `seat_locks`;
  - cria `sale_passengers`;
  - define RLS pública para insert em `sale_passengers` quando a venda pertence a evento `a_venda`.
- `supabase/migrations/20261107120000_create_event_ticket_types.sql`:
  - cria `event_ticket_types`;
  - adiciona `sale_passengers.ticket_type_id uuid null`.
- `supabase/migrations/20261103090000_add_benefit_snapshot_to_sales_and_passengers.sql`:
  - torna `sale_passengers.original_price` e `sale_passengers.final_price` obrigatórios.

### Edge Function Asaas

Arquivo: `supabase/functions/create-asaas-payment/index.ts`

Função:

- handler `serve(async (req) => ...)`.

Observação: pela ordem do frontend, esta função não deve ser chamada quando o insert em `sale_passengers` falha.

## 6. Payload enviado para criação da venda e dos passageiros

Dados sensíveis mascarados. IDs reais não estavam disponíveis no repositório; abaixo está o shape efetivo gerado pelo código para o cenário descrito.

### Insert em `sales`

```json
{
  "event_id": "<event_id_divinaexpo_2026>",
  "trip_id": "<trip_id_ida_vilma_alimentos_18h>",
  "boarding_location_id": "<boarding_location_id_vilma_alimentos>",
  "seller_id": null,
  "customer_name": "Edimar Reginato",
  "customer_cpf": "***<ultimos_4_digitos>",
  "customer_phone": "<telefone_sem_mascara_ou_vazio>",
  "quantity": 1,
  "unit_price": 80,
  "gross_amount": 88,
  "benefit_total_discount": 0,
  "status": "pendente_pagamento",
  "payment_method": "credit_card",
  "intermediation_responsibility_accepted": true,
  "intermediation_responsibility_accepted_at": "<ISO timestamp>",
  "company_id": "<company_id_busao_off_off>",
  "payment_environment": "sandbox|production"
}
```

### Insert em `sale_passengers` — payload problemático

```json
[
  {
    "sale_id": "<sale_id_criado_no_passo_anterior>",
    "seat_id": "<seat_id_assento_10>",
    "seat_label": "10",
    "passenger_name": "Edimar Reginato",
    "passenger_cpf": "***<ultimos_4_digitos>",
    "passenger_phone": "<telefone_sem_mascara_ou_null>",
    "trip_id": "<trip_id_ida_vilma_alimentos_18h>",
    "sort_order": 0,
    "company_id": "<company_id_busao_off_off>",
    "ticket_type_id": "__default_base_type__",
    "ticket_type_name": "Adulto",
    "ticket_type_price": 80,
    "benefit_program_id": null,
    "benefit_program_name": null,
    "benefit_type": null,
    "benefit_value": null,
    "original_price": 80,
    "discount_amount": 0,
    "final_price": 80,
    "benefit_applied": false,
    "pricing_rule_version": "beneficio_checkout_v1"
  }
]
```

Campo bloqueador provável: `ticket_type_id`.

Motivo: `sale_passengers.ticket_type_id` é `uuid null`, mas o checkout envia a string sintética `"__default_base_type__"` para eventos sem tipo real cadastrado.

## 7. Erro técnico real esperado em console/database

O código captura o erro técnico em:

```ts
console.error("Passengers error:", passengersError);
```

Como não há acesso aos logs de execução/Supabase nesta análise, o erro runtime ainda precisa ser confirmado em reprodução controlada. Porém, pela tipagem do schema e pelo payload construído, o erro técnico esperado é:

```text
code: "22P02"
message: "invalid input syntax for type uuid: \"__default_base_type__\""
details/context: coluna sale_passengers.ticket_type_id
```

Se a reprodução não mostrar `22P02`, a segunda linha de investigação deve ser RLS do insert em `sale_passengers`. Até o momento, a hipótese de RLS é menos provável porque:

- a política pública de `sale_passengers` permite insert quando existe `sales` vinculada a evento `a_venda`;
- o sintoma aparece especificamente em evento sem tipos de passagem;
- há divergência objetiva entre checkout público e venda manual para tipo ausente.

## 8. Comparação com a venda manual

| Aspecto | Checkout público | Venda manual admin | Impacto |
|---|---|---|---|
| Tabela intermediária | Insere `sale_passengers` antes do Asaas | Insere diretamente `tickets` | Fluxos não gravam a mesma tabela no mesmo momento |
| Status inicial | `pendente_pagamento` | `reservado` ou `bloqueado` | Esperado por regra de negócio |
| Chamada Asaas | Depois de `sale_passengers` | Não chama `create-asaas-payment` para gerar cobrança principal da passagem | Venda manual não chega no mesmo ponto |
| Tipo de passagem ausente | Cria fallback com `id = "__default_base_type__"` | Usa `ticketTypeId: null` quando não há tipo real | Divergência crítica |
| Campo gravado | `sale_passengers.ticket_type_id` recebe string não UUID | `tickets.ticket_type_id` recebe `null` | Explica por que manual funciona |
| Seat lock | Usa `seat_locks` temporários | Usa tickets/reservas administrativas | Esperado por regra de checkout |
| Rollback em erro de passageiro | Deleta `seat_locks` e tenta deletar `sales` | Erro cai no catch; não é o cenário reportado | Público apaga evidência principal da venda |

## 9. Validação do cenário sem tipos de passagem

O checkout público tenta tratar evento legado sem tipos cadastrados criando um tipo visual/fallback:

```ts
{
  id: "__default_base_type__",
  name: "Adulto",
  price: Number(eventData.unit_price ?? 0),
  is_active: true,
}
```

Esse fallback é adequado para UX e cálculo de preço, mas não é seguro para persistência em uma coluna UUID.

Conclusão: o cenário sem tipos de passagem está parcialmente tratado no frontend para exibição e cálculo, mas falha na persistência porque o ID sintético vaza para `sale_passengers.ticket_type_id`.

## 10. Validação do cenário sem serviços vinculados

Não foi encontrada dependência de serviço vinculado no fluxo público de passagem normal analisado.

- O checkout público de passagem monta `sales` e `sale_passengers`.
- Serviços aparecem em fluxo administrativo próprio com `sale_service_items`/`event_services`, não como requisito para `sale_passengers`.
- `sale_passengers` não possui `service_id` obrigatório no schema versionado consultado.

Conclusão: ausência de serviços vinculados não é a causa provável do erro reportado.

## 11. Validação de RLS, constraints e campos obrigatórios

### `sale_passengers`

Campos obrigatórios na criação original:

- `sale_id` not null;
- `seat_label` not null;
- `passenger_name` not null;
- `passenger_cpf` not null;
- `trip_id` not null;
- `sort_order` not null com default;
- `company_id` not null;
- `created_at` not null com default.

Campos obrigatórios adicionados posteriormente:

- `original_price` not null;
- `final_price` not null;
- `discount_amount` not null com default;
- `benefit_applied` not null com default;
- `pricing_rule_version` not null com default.

No payload público analisado, esses campos são preenchidos.

Campo opcional, mas tipado como UUID:

- `ticket_type_id uuid null`.

O problema provável não é ausência de campo obrigatório, e sim **tipo inválido em campo opcional UUID**.

### RLS de `sale_passengers`

A política pública de insert permite inserir quando existe venda (`sales`) vinculada a evento `a_venda`. Portanto, se a venda foi criada para o evento público em venda, a política tende a permitir o insert.

Ponto de atenção: a política não valida explicitamente `company_id` do passageiro contra `sales.company_id`; isso é uma consideração de hardening futuro, não a causa provável deste incidente.

### `sales`

O erro ocorre depois da criação da venda, porque o toast reportado pertence ao bloco posterior ao insert em `sale_passengers`. Se o problema fosse insert de `sales`, a mensagem seria “Erro ao finalizar compra. Tente novamente.” ou “Este evento não está disponível para compra online no momento.”.

### `seat_locks`

O fluxo já passou por criação de `seat_locks`; se falhasse ali, a mensagem seria “Erro ao reservar assentos temporariamente. Tente novamente.” ou conflito de assento.

## 12. Confirmação se `create-asaas-payment` é chamado ou não

Para o sintoma reportado, **não deve ser chamado**.

Evidência de fluxo:

- `create-asaas-payment` só é invocado após o insert de `sale_passengers` terminar sem erro.
- O toast reportado é emitido no bloco `if (passengersError)`, que executa `return` antes da chamada da Edge Function.

Portanto, não há evidência de falha Asaas neste caso específico. A cobrança Asaas não chega a ser solicitada.

## 13. Rollback parcial após a falha

Quando `sale_passengers` falha, o checkout público executa:

```ts
await supabase.from("seat_locks").delete().eq("sale_id", sale.id);
await supabase.from("sales").delete().eq("id", sale.id);
```

Interpretação:

- a venda é criada antes da falha;
- o frontend tenta remover `seat_locks` vinculados à venda;
- o frontend tenta apagar a venda;
- como `sale_passengers` não foi inserido, não há staging de passageiros para essa venda;
- `create-asaas-payment` não é chamado;
- `sale_integration_logs` da criação de cobrança não devem existir para essa tentativa.

Risco operacional: como o rollback é feito pelo cliente público, qualquer falha de RLS/permissão no delete de `sales` pode deixar venda órfã `pendente_pagamento` sem passageiros e sem `asaas_payment_id`. O código não checa o resultado desses deletes no bloco de rollback de passageiros.

## 14. Por que a venda manual funciona e o checkout público não

A venda manual não usa o mesmo staging de `sale_passengers` antes da cobrança. Ela cria a venda administrativa e insere `tickets` diretamente.

Além disso, no admin, quando não existe tipo real cadastrado, o passageiro é inicializado com:

```ts
 ticketTypeId: defaultType?.id ?? null
```

Se não houver `defaultType`, o valor persistido é `null`, que é compatível com coluna UUID nullable.

No checkout público, o fallback cria um ID textual sintético e esse ID é persistido como se fosse UUID real. Essa é a divergência concreta entre os fluxos.

## 15. Validação da empresa BUSÃO OFF OFF

Com os dados disponíveis no repositório, não é possível confirmar valores reais de configuração da empresa, como wallet, API key, ambiente ativo ou Pix readiness.

Mesmo assim, a tela chega ao passo de registrar passageiros e a mensagem exibida não pertence à Edge Function Asaas. Portanto:

- não há evidência de que a integração Asaas da empresa seja a causa deste erro;
- não há evidência de que wallet/split/API key estejam sendo avaliados nesta tentativa;
- essas configurações só seriam relevantes depois do insert bem-sucedido em `sale_passengers`.

## 16. Causa raiz provável

**Causa raiz provável:** o checkout público persiste `ticket_type_id = "__default_base_type__"` em `sale_passengers.ticket_type_id`, mas essa coluna é `uuid null`. O evento da BUSÃO OFF OFF não possui tipos de passagem cadastrados, então o fallback sintético é usado e causa erro de cast/validação no banco durante o insert de `sale_passengers`.

Cadeia causal:

1. Evento não possui `event_ticket_types` ativos.
2. Checkout cria fallback visual com `id = "__default_base_type__"`.
3. Passageiro recebe esse ID no estado local.
4. `sales` é criada com sucesso.
5. `sale_passengers.insert(passengerInserts)` envia `ticket_type_id = "__default_base_type__"`.
6. Banco rejeita o valor por não ser UUID.
7. Frontend captura `passengersError` e mostra toast genérico.
8. Fluxo retorna antes da Edge Function Asaas.

## 17. Riscos de corrigir sem entender a causa

- Relaxar RLS sem necessidade e abrir risco multi-tenant.
- Tornar `ticket_type_id` texto no banco e quebrar semântica de FK/UUID futura.
- Criar workaround específico para BUSÃO OFF OFF e deixar outros eventos legados vulneráveis.
- Alterar Asaas/split/API key sem relação com o ponto real da falha.
- Remover o rollback e gerar assentos presos ou vendas órfãs.
- Corrigir apenas o toast e manter falha silenciosa de persistência.

## 18. Correção mínima recomendada se a causa for confirmada

Sem aplicar agora, a correção mínima deve ser localizada no checkout público:

1. Manter o fallback `"__default_base_type__"` apenas como identificador de UI/estado local.
2. Na montagem de `passengerInserts`, persistir `ticket_type_id: null` quando o ID for sintético ou não for UUID válido.
3. Preservar `ticket_type_name: "Adulto"` e `ticket_type_price: event.unit_price` para snapshot financeiro.
4. Não alterar venda manual.
5. Não alterar RLS.
6. Não alterar regras Asaas.
7. Adicionar teste/regressão para evento sem `event_ticket_types` garantindo que `ticket_type_id` enviado ao banco seja `null`.

Exemplo conceitual da regra, sem implementação nesta análise:

```ts
const persistedTicketTypeId = isUuid(passengers[i].ticket_type_id)
  ? passengers[i].ticket_type_id
  : null;
```

## 19. Perguntas pendentes

1. Em reprodução real, o console mostra `Passengers error` com `code = 22P02` e mensagem de UUID inválido?
2. Após a falha, a venda é realmente apagada pelo rollback público ou permanece `pendente_pagamento` por bloqueio de RLS no delete?
3. Existe algum log em `sale_logs` para a venda criada antes do rollback? Pelo código do checkout público, não há insert explícito em `sale_logs` antes de `create-asaas-payment`.
4. A tela `/admin/diagnostico-vendas` mostra tentativas órfãs sem passageiros para esse evento?
5. Existem outros eventos legados sem tipos de passagem ativos vendendo no checkout público?

## 20. Checklist de testes antes do commit de correção futura

### Reproduções obrigatórias

- [ ] Checkout público de evento sem tipo de passagem: confirmar que `ticket_type_id` persistido é `null` e cobrança é criada.
- [ ] Checkout público de evento com tipo de passagem: confirmar que UUID real é persistido em `sale_passengers.ticket_type_id`.
- [ ] Checkout público sem serviço vinculado: confirmar venda normal sem depender de `sale_service_items`.
- [ ] Checkout público com serviço vinculado, se existir no sistema: confirmar que o fluxo de passagem não quebra e que serviço segue seu fluxo próprio.
- [ ] Venda manual administrativa de evento sem tipo de passagem: confirmar que continua criando venda/tickets.
- [ ] Venda manual administrativa de evento com tipo de passagem: confirmar snapshot de ticket type em `tickets`.
- [ ] Pix: confirmar bloqueio amigável quando Pix não está pronto e criação de cobrança quando pronto.
- [ ] Cartão de crédito: confirmar criação de cobrança Asaas.
- [ ] Empresa em sandbox: confirmar `sales.payment_environment = 'sandbox'` e logs coerentes.
- [ ] Outra empresa que já vende normalmente: confirmar ausência de regressão.
- [ ] Assento ocupado/bloqueado: confirmar conflito por `tickets`/`seat_locks`.
- [ ] Rollback em erro forçado de passageiros: confirmar que assento não fica preso e venda não fica órfã, ou registrar órfã no diagnóstico.
- [ ] Conferência em `/admin/diagnostico-vendas` ou tela equivalente: confirmar logs/estado em falhas antes e depois de `create-asaas-payment`.

### Evidências a coletar na correção futura

- [ ] Console do navegador com `Passengers error` antes da correção.
- [ ] Network payload do insert em `sale_passengers` antes/depois.
- [ ] Registro em `sale_passengers` após correção com `ticket_type_id = null` para fallback.
- [ ] Ausência de chamada `create-asaas-payment` antes da correção no caso com erro de passageiros.
- [ ] Presença de chamada `create-asaas-payment` após correção.
- [ ] `sale_integration_logs` apenas quando a Edge Function for efetivamente chamada.

## 21. Conclusão

O diagnóstico mais forte e rastreável é incompatibilidade de tipo no payload do checkout público para eventos sem tipos de passagem: o ID sintético `"__default_base_type__"` é útil como fallback de UI, mas não pode ser persistido em `sale_passengers.ticket_type_id uuid null`.

O erro ocorre após criar a venda e antes de chamar Asaas. A venda manual funciona porque não persiste o ID sintético; quando não há tipo real, usa `null`.

A correção deve ser mínima, geral para eventos sem tipos de passagem, preservando isolamento por `company_id`, RLS, fluxo Asaas e venda manual.
