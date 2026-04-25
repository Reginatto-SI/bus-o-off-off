# PRD — Tela `/eventos/:id/checkout` (Checkout público)

## 1. Objetivo
Permitir que o comprador conclua a compra de passagens de um evento com seleção de assentos, cadastro de passageiros, aceite de responsabilidade, criação de venda e abertura da cobrança Asaas, mantendo rastreabilidade operacional e rollback em falhas críticas.

## 2. Contexto no sistema
- **Venda:** cria `sales` com status inicial `pendente_pagamento`, cria `sale_passengers` e `seat_locks`.
- **Pagamento:** chama edge function `create-asaas-payment` e redireciona para `/confirmacao/:id`.
- **Empresa:** usa `event.company_id` para carregar configuração de Pix/fee e persistir `company_id` em locks/venda/passageiros.
- **Usuário:** fluxo público sem login; valida CPF/telefone/nome no frontend e aplica RLS no backend para escrita permitida.

## 3. Fluxo REAL da tela
1. Lê parâmetros de rota/query (`id`, `trip`, `location`, `quantity`, `ref`, `time`, `return_trip`). Sem `id/trip/location`, redireciona para `/eventos`.
2. Carrega `events`, `trips`, `boarding_locations`, taxa/config da empresa e taxas do evento; se `allow_online_sale=false`, bloqueia compra e volta para detalhe do evento.
3. Carrega assentos reais de `seats` por veículo (sem geração local de assento). Se não existir layout, exibe erro operacional de configuração.
4. Busca assentos ocupados em `tickets` + `seat_locks` ativos e marca também assentos de vendas `bloqueado` separadamente.
5. Etapa 1: usuário seleciona exatamente a quantidade de assentos e o sistema revalida disponibilidade/capacidade via banco (`tickets`, `seat_locks`, RPC `get_trip_available_capacity`).
6. Etapa 2: usuário informa passageiros; tela valida nome mínimo, CPF válido/único e responsável pagador.
7. Etapa 3: usuário escolhe pagamento (`pix`/`credit_card`), aceita termo de intermediação e envia.
8. No submit: revalida assentos/capacidade (ida e volta quando aplicável), resolve `sellerRef` via RPC `resolve_event_seller_ref`, resolve snapshots de benefício por passageiro, cria `seat_locks` (15 min), cria `sales`, vincula `sale_id` nos locks e grava `sale_passengers`.
9. Invoca `create-asaas-payment` com `sale_id`, `payment_method` e `payment_environment`; com URL válida, abre cobrança (aba já pré-aberta) e navega para `/confirmacao/:saleId`.
10. Em erro sem conta Asaas (`no_asaas_account`) ou exceção de rede da edge, mantém fallback para `/confirmacao/:saleId`; em erro genérico de resposta da edge, faz rollback completo (`sale_passengers`, `seat_locks`, `sales`).

## 4. Regras de negócio (CRÍTICO)
- Compra só prossegue com evento em venda online (`allow_online_sale=true`).
- Quantidade de assentos selecionados deve ser exatamente igual a `quantity`.
- Cada passageiro exige nome válido, CPF válido e CPF não repetido na mesma compra.
- Aceite de intermediação é obrigatório antes de submeter.
- Pix é desabilitado automaticamente se ambiente atual não estiver pronto (`asaas_pix_ready_*` da empresa).
- `seat_locks` expiram em 15 minutos e são criados antes da venda para garantir exclusividade temporária.
- Venda nasce com `status='pendente_pagamento'`, `company_id`, `payment_method` e `payment_environment` explícitos.
- Benefício não bloqueia venda: em erro de elegibilidade/snapshot, checkout usa preço base e registra log técnico.
- Em evento com `transport_policy='ida_volta_obrigatorio'`, sem `return_trip` a venda é bloqueada.

## 5. Integrações envolvidas
- **Supabase tabelas:** `events`, `trips`, `boarding_locations`, `companies`, `event_fees`, `event_category_prices`, `seats`, `tickets`, `seat_locks`, `sales`, `sale_passengers`.
- **Supabase RPC:** `get_trip_available_capacity`, `resolve_event_seller_ref`.
- **Edge function:** `create-asaas-payment`.
- **Bibliotecas de regra:** `calculateFees`, `resolvePassengerBenefitPrice`, `useRuntimePaymentEnvironment`, `intermediationPolicy`.

## 6. Estados possíveis
- **Carregando inicial:** `loading=true`.
- **Erro de dados base:** evento/viagem/local inválidos, mapa de assentos indisponível.
- **Etapa 1/2/3:** seleção de assentos, dados de passageiros, pagamento.
- **Submissão:** `submitting=true`, `paymentCheckoutStatus='preparing'`.
- **Popup bloqueado:** `paymentCheckoutStatus='popup_blocked'` com link manual.
- **Erro de checkout:** `paymentCheckoutStatus='error'` com rollback e toast.
- **Fallback operacional:** segue para confirmação quando pagamento não pode ser iniciado naquele momento.

## 7. Cenários de falha
| Cenário | Impacto | Ação esperada |
|---|---|---|
| Evento sem venda online | Compra bloqueada | Toast + navega para `/eventos/:id` |
| Assento concorrente/ocupado | Seleção inválida | Remove assentos conflitantes, pede nova seleção |
| Falha ao criar `seat_locks` (23505) | Reserva temporária não criada | Toast de concorrência + recarrega ocupação |
| Falha ao inserir `sales` | Venda não criada | Rollback de locks + toast de indisponibilidade/erro |
| Falha ao inserir `sale_passengers` | Dados incompletos | Rollback de venda/locks + toast |
| `create-asaas-payment` sem URL com erro genérico | Sem cobrança utilizável | Salva trace local + rollback completo |
| `create-asaas-payment` com `no_asaas_account` | Sem cobrança Asaas | Mantém venda pendente e segue para confirmação |
| Exceção de rede na edge | Cobrança não aberta | Mantém venda pendente e segue para confirmação |

## 8. Riscos operacionais
- Janela entre criação da venda e abertura efetiva da cobrança pode gerar pendências operacionais.
- Bloqueio de pop-up no navegador exige ação manual do usuário para abrir cobrança.
- Dependência de cleanup assíncrono para convergir pendências após expiração de lock.

## 9. Logs e diagnóstico
- **Frontend console:** `Erro ao carregar checkout`, `Seat lock error`, `Sale error`, `Passengers error`, `[checkout] payment_failure_trace_before_rollback`, logs `[benefits-debug]`.
- **Persistência local temporária:** `sessionStorage.smartbus:last_checkout_payment_failure` guarda `sale_id`, estágio e erro antes de rollback.
- **Banco para auditoria:** `seat_locks`, `sales`, `sale_passengers`, `tickets`.
- **Função de pagamento:** inspecionar execução/retorno de `create-asaas-payment` para `sale_id`.

## 10. Dúvidas pendentes
- Política formal de SLA para limpeza de `pendente_pagamento` expirado: **não identificado no código atual**.
- Estratégia automática de recuperação quando popup é bloqueado e usuário sai da tela: **não identificado no código atual**.
