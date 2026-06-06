# Análise 1 — Checkout mobile: registro de passageiros

## 1. Resumo executivo do problema

Usuários do checkout público mobile relatavam a mensagem **“Erro ao registrar dados dos passageiros. Tente novamente.”** ao concluir a compra, tanto em Pix quanto em cartão. A investigação no código mostrou que essa mensagem é emitida exclusivamente quando o `insert` em `sale_passengers` falha, antes da chamada da edge function `create-asaas-payment`.

A correção aplicada foi mínima e localizada em `src/pages/public/Checkout.tsx`: preservar dados de passageiros ao voltar/avançar, validar formato/quantidade antes do insert, melhorar logs técnicos e criar `seat_locks` já vinculados à venda (`sale_id`) em vez de criar o lock sem venda e tentar atualizá-lo depois.

## 2. Evidência se o erro acontece antes ou depois de `create-asaas-payment`

O erro acontece **antes** de `create-asaas-payment`.

Evidência no fluxo do checkout público:

1. O checkout cria/valida dados locais dos passageiros.
2. Cria `sales`.
3. Cria `seat_locks`.
4. Monta e insere `sale_passengers`.
5. Se `sale_passengers` falha, exibe a mensagem reportada e retorna do fluxo.
6. Somente depois do sucesso em `sale_passengers` a função `create-asaas-payment` é invocada.

Portanto Pix/cartão não são a causa raiz dessa mensagem. A escolha do método de pagamento só é usada depois, na chamada da edge function de cobrança.

## 3. Arquivos investigados

### PRDs lidos

- `docs/PRD/Asaas/00-asaas-indice-geral.md`
- `docs/PRD/Asaas/01-asaas-visao-geral.md`
- `docs/PRD/Asaas/02-asaas-fluxo-checkout-e-venda.md`
- `docs/PRD/Asaas/03-asaas-webhook-e-confirmacao.md`
- `docs/PRD/Asaas/06-asaas-operacao-erros-e-diagnostico.md`
- `docs/PRD/Telas/prd-public-checkout.md`
- `docs/PRD/Telas/01-prd-telas-publicas.md`
- `docs/PRD/Telas/prd-public-confirmacao.md`
- `docs/PRD/Telas/prd-admin-vendas.md`

### Código e banco investigados

- `src/pages/public/Checkout.tsx`
- `src/components/public/SeatMap.tsx`
- `src/components/public/SeatButton.tsx`
- `src/integrations/supabase/types.ts`
- `supabase/migrations/20260311010520_fc7a27bc-058e-418c-b4c9-289ec167e201.sql`
- `supabase/migrations/20260521001243_efe8ea20-14c3-416d-83e5-e499f072d44d.sql`
- `supabase/functions/create-asaas-payment/index.ts` (apenas para confirmar fronteira do fluxo; não alterado)

## 4. Fluxo atual do checkout público até `sale_passengers`

Fluxo reconstruído no código após a correção:

1. Carrega evento, viagem, local de embarque, assentos, taxas e tipos de passagem.
2. Usuário seleciona quantidade/assentos.
3. Ao avançar para passageiros, revalida ocupação por RPC e prepara o array `passengers`.
4. Usuário preenche nome, CPF e telefone opcional.
5. Antes de ir ao pagamento, valida CPF/nome e resolve snapshots de benefício por passageiro.
6. Ao concluir, revalida assentos e capacidade.
7. Cria a venda em `sales` com `status = 'pendente_pagamento'` e `payment_environment` explícito.
8. Cria `seat_locks` já com `sale_id` da venda.
9. Monta o payload de `sale_passengers` com `sale_id`, `seat_id`, `seat_label`, dados do passageiro, `trip_id`, `company_id`, tipo de passagem e snapshot financeiro.
10. Insere em `sale_passengers`.
11. Apenas se o insert for bem-sucedido, chama `create-asaas-payment`.

## 5. Diferenças encontradas entre comportamento desktop e mobile

Não foram encontrados componentes separados para desktop e mobile na etapa de passageiros: a tela usa o mesmo estado React (`passengers`, `selectedSeats`, `payerIndex`) e os mesmos inputs.

As diferenças relevantes encontradas são de comportamento provável em dispositivos móveis:

- O usuário mobile tende a usar mais a navegação por etapas/botão fixo inferior. O código antigo recriava o array `passengers` vazio sempre que voltava para assentos e avançava novamente.
- CPF e telefone não informavam `inputMode`, então o teclado mobile podia alternar para teclado textual, aumentando risco de entrada parcial/formatada de forma inesperada.
- O erro do insert de `sale_passengers` já tinha log técnico, mas faltavam validações e logs antes do insert para diferenciar payload incompleto, divergência de quantidade e falha real de banco.
- O fluxo antigo criava `seat_locks` sem `sale_id` e depois tentava fazer `update` para vincular a venda. Como a política pública original de `seat_locks` concede insert/select, mas não update para usuário anônimo, esse vínculo é frágil no checkout público. Se o lock permanece sem `sale_id`, o trigger de disponibilidade de `sale_passengers` pode interpretar o próprio lock do checkout como reserva conflitante.

## 6. Payload esperado para passageiros

Para cada passageiro de ida, o payload esperado em `sale_passengers` deve conter:

```ts
{
  sale_id: string,
  seat_id: string,
  seat_label: string,
  passenger_name: string,
  passenger_cpf: string, // 11 dígitos
  passenger_phone: string | null,
  trip_id: string,
  sort_order: number,
  company_id: string,
  ticket_type_id: string | null,
  ticket_type_name: string,
  ticket_type_price: number,
  benefit_program_id: string | null,
  benefit_program_name: string | null,
  benefit_type: string | null,
  benefit_value: number | null,
  original_price: number,
  discount_amount: number,
  final_price: number,
  benefit_applied: boolean,
  pricing_rule_version: string
}
```

Para volta obrigatória/complementar, o payload mantém o mesmo `sale_id`, `company_id`, dados do passageiro e `trip_id` de volta, com `seat_id = null`, `seat_label = VOLTA-n` e snapshot financeiro zerado para não duplicar cobrança.

## 7. Payload real observado/reconstruído no cenário mobile

Sem acesso aos logs de produção/Supabase nesta execução, o payload real foi reconstruído pelo código anterior:

- `passengerInserts` era gerado a partir de `selectedSeats.map(...)`.
- `sale_id`, `company_id`, `trip_id`, `seat_id`, `passenger_name`, `passenger_cpf`, telefone, tipo de passagem e snapshot eram preenchidos no frontend.
- O ponto frágil anterior era externo ao shape básico do passageiro: `seat_locks` eram criados sem `sale_id` e dependiam de um `update` posterior não validado. Se esse `update` falhasse por RLS/permissão, o insert de `sale_passengers` podia falhar por conflito com o próprio lock ativo.

A correção agora também valida o payload antes do insert e registra `invalidPassengerPayload` se algum campo obrigatório estiver ausente ou inválido.

## 8. Erro real retornado pelo banco, API, edge function ou frontend

O erro exato de produção não pôde ser consultado nesta execução porque não houve acesso aos logs remotos do Supabase/console dos usuários.

Evidência confirmada no frontend:

- A mensagem reportada pelo usuário é emitida somente no bloco `passengersError` após falha do `insert` em `sale_passengers`.
- Esse bloco retorna antes de `create-asaas-payment`.

Erro provável no banco a partir das constraints/triggers investigadas:

- Código SQLSTATE `23505` com mensagens como **“Assento reservado temporariamente neste trecho.”**, **“Assento já reservado neste trecho.”** ou **“Assento já ocupado neste trecho.”**, disparadas pelo trigger de disponibilidade de `sale_passengers`.
- Alternativamente, erro de RLS/permissão se algum payload de passageiro/venda não satisfizer as policies públicas.

Após a correção, logs internos passam a registrar etapa, ambiente, método, `company_id`, `event_id`, `sale_id` quando existir, quantidade esperada/enviada, campos ausentes e erro real retornado pelo banco.

## 9. Causa raiz provável ou confirmada

Causa raiz provável, com base no código e nas policies/migrations locais:

1. O checkout criava `seat_locks` antes da venda, sem `sale_id`.
2. Depois de criar `sales`, tentava atualizar `seat_locks.sale_id`.
3. A policy pública de `seat_locks` permite insert/select para eventos públicos, mas não há policy pública de update.
4. O update não tinha tratamento de erro.
5. Se o update não persistisse, o trigger de `sale_passengers` encontrava um lock ativo do mesmo assento com `sale_id` distinto/nulo e bloqueava o insert.
6. O frontend então exibia “Erro ao registrar dados dos passageiros”, antes de criar a cobrança Asaas.

Contribuintes mobile corrigidos:

- Recriação do array de passageiros ao voltar/avançar etapas, mais comum no uso mobile.
- Inputs sem `inputMode` para CPF/telefone, aumentando risco de dados parciais ou entrada menos adequada no teclado mobile.
- Falta de validação estrutural de quantidade/payload imediatamente antes do insert.

## 10. Correção mínima aplicada ou proposta

Correção aplicada em `src/pages/public/Checkout.tsx`:

- Preservar `passengers` e snapshots já preenchidos ao retornar para assentos e avançar novamente.
- Validar divergência entre quantidade esperada, assentos selecionados e passageiros antes do insert.
- Adicionar logs estruturados para validação de passageiros, criação da venda, criação de locks e payload de `sale_passengers`.
- Criar `sales` antes dos locks e inserir `seat_locks` já com `sale_id`, eliminando a dependência do update público em `seat_locks`.
- Validar `passengerInserts` antes do `insert` em `sale_passengers`.
- Adicionar `inputMode="numeric"` no CPF e `inputMode="tel"` no telefone.

Não foram alterados webhook, verify, split, `create-asaas-payment` ou regra financeira.

## 11. Riscos da correção

- A venda passa a ser criada antes dos locks. Se o lock falhar e o delete de rollback for barrado por RLS no ambiente remoto, pode restar venda pendente sem cobrança. O código já tinha rollbacks frontend semelhantes; recomenda-se validar policies/rotina de limpeza operacional.
- A correção reduz o risco de conflito com o próprio lock, mas não substitui transação backend atômica. Uma futura melhoria ideal seria RPC transacional para venda + locks + passageiros.
- Testes manuais reais em Android/iOS ainda são necessários para confirmar o comportamento em navegadores móveis específicos.

## 12. Checklist de testes manuais

- [ ] Desktop Chrome — compra com Pix.
- [ ] Desktop Chrome — compra com cartão.
- [ ] Mobile Chrome Android — compra com Pix.
- [ ] Mobile Chrome Android — compra com cartão.
- [ ] Mobile Safari iOS — compra com Pix, se possível.
- [ ] Mobile Safari iOS — compra com cartão, se possível.
- [ ] Venda com 1 passageiro.
- [ ] Venda com múltiplos passageiros.
- [ ] Passageiro com CPF preenchido.
- [ ] Passageiro com telefone preenchido.
- [ ] Campos obrigatórios vazios bloqueiam antes do insert e exibem mensagem adequada.
- [ ] Voltar para a etapa anterior no mobile e avançar novamente não apaga passageiros indevidamente.
- [ ] Não cria cobrança Asaas se `sale_passengers` falhar.
- [ ] Não deixa venda pendente sem cobrança sem log claro.
- [ ] Não libera assento/venda em duplicidade.

## 13. Checklist de testes automatizados recomendados

- [ ] Teste unitário para `validatePassengers` cobrindo quantidade divergente, CPF inválido e CPF duplicado.
- [ ] Teste de componente para preservar `passengers` ao voltar da etapa 2 para 1 e avançar novamente.
- [ ] Teste de integração mockando Supabase: `sale_passengers` falha ⇒ `create-asaas-payment` não é chamado.
- [ ] Teste de integração mockando Supabase: `seat_locks` recebe `sale_id` já no insert.
- [ ] Teste de regressão para Pix e cartão confirmando que ambos usam a mesma etapa de registro de passageiros.

## 14. Pontos que ainda precisam de validação

- Capturar o erro real nos logs Supabase/console mobile de produção para confirmar o SQLSTATE/mensagem exatos.
- Validar em dispositivo físico Android Chrome e iOS Safari.
- Confirmar se há job remoto de limpeza/cancelamento para vendas pendentes sem cobrança quando rollback frontend é bloqueado por RLS.
- Avaliar, em tarefa separada, se o checkout público deve migrar para uma RPC transacional de criação de venda/locks/passageiros para reduzir dependência de múltiplas chamadas anônimas.
