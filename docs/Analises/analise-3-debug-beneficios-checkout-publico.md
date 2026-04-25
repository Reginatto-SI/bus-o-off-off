# 1. Resumo executivo

## Onde o benefício está falhando
O benefício está morrendo **antes do resumo visual**, no momento em que o checkout público resolve o snapshot por passageiro (`resolvePassengerBenefitSnapshots`).

Quando a etapa de elegibilidade falha (erro de RPC) ou não retorna match, o fluxo força fallback para preço base (`discount_amount=0`, `final_price=original_price`, `benefit_applied=false`) e segue a compra.

## Causa raiz atual (alta confiança no ponto de falha)
A causa raiz observável no código do checkout público é:

- o pipeline trata qualquer falha técnica na elegibilidade como opcional e aplica fallback silencioso por passageiro;
- o resumo financeiro é derivado exclusivamente desses snapshots;
- portanto, quando o snapshot vem zerado, o resumo também vem zerado.

Em outras palavras: **não é um bug visual primário**; o resumo apenas reflete snapshot sem desconto.

> Nota importante: até este diagnóstico, faltava telemetria detalhada para provar em runtime se o motivo era “erro de RPC” vs “RPC sem match válido”. Foram adicionados logs temporários objetivos para fechar essa evidência no próximo teste real.

---

# 2. Evidência do fluxo

## 2.1 Chamada da RPC
`getEligibleBenefitsByPassenger` chama `supabase.rpc('get_benefit_eligibility_matches', ...)` com:

- `p_company_id`
- `p_event_id`
- `p_cpf` (normalizado)
- `p_reference_date`

Foi adicionado log temporário `eligibility_rpc_call` para registrar os parâmetros efetivos em runtime (com CPF mascarado).

## 2.2 Retorno da RPC
A função mapeia o retorno da RPC para `eligibleMatches`.

- Se houver erro de RPC, lança exceção.
- Se retornar vazio, `eligibleMatches` fica vazio.

Foram adicionados logs temporários:

- `eligibility_rpc_error`: código e mensagem de erro da RPC
- `eligibility_rpc_result`: quantidade de matches e metadados dos programas retornados

## 2.3 Cálculo do benefício
Pipeline de cálculo:

1. `resolvePassengerBenefitPrice`
2. `resolveBestBenefitForPassengerPrice`
3. `applyBenefitToPrice`

Se `matches.length === 0`, o resolvedor retorna sem benefício (`discountAmount=0`, `finalPrice=originalPrice`).

Foi adicionado log temporário `passenger_snapshot_resolved` para cada passageiro, registrando:

- benefício escolhido
- desconto calculado
- preço final calculado

## 2.4 Snapshot final e persistência
Antes de inserir `sales`/`sale_passengers`, o checkout calcula totais a partir dos snapshots.

Foi adicionado log temporário `submit_snapshot_and_totals` para registrar:

- snapshot por passageiro (`benefit_applied`, `benefit_program_name`, `discount_amount`, `final_price`)
- totais consolidados (`benefitTotalDiscount`, `subtotalAfterBenefits`, `grossAmount`)

## 2.5 Resumo visual
O resumo visual do checkout usa `checkoutSummary` derivado de `passengerBenefitSnapshots`.

Conclusão: se `passengerBenefitSnapshots` chegar zerado, o resumo mostrará valores sem benefício de forma consistente. Não há evidência de “desconto calculado corretamente e escondido apenas pela UI” no fluxo atual.

---

# 3. Causa raiz

## Arquivo
`src/pages/public/Checkout.tsx`

## Função
`resolvePassengerBenefitSnapshots` (transição passageiros -> pagamento e fallback antes de persistir)

## Condição do bug
No `catch` da resolução do benefício, qualquer falha técnica gera fallback obrigatório:

- `benefit_applied: false`
- `discount_amount: 0`
- `final_price: original_price`

Com isso, o benefício “morre” no runtime e o restante do fluxo apenas propaga esse snapshot sem desconto.

## Motivo
O checkout foi desenhado para nunca bloquear venda por falha de elegibilidade (regra de robustez), mas isso mascara a falha real em produção quando não há telemetria rica.

---

# 4. Correção mínima recomendada

Sem refatorar arquitetura:

1. **Rodar teste real com `DEBUG_BENEFITS_CHECKOUT=1` (localStorage)** e coletar logs.
2. Confirmar em evidência única qual cenário ocorre:
   - erro de RPC (ex.: função ausente, permissão, parâmetro inválido), ou
   - RPC sem match (company/event/cpf/vigência/status/vínculo).
3. Aplicar ajuste mínimo específico ao cenário confirmado (não genérico).

Se o log confirmar erro de RPC, a correção mínima deve atacar a causa do erro da chamada.
Se o log confirmar “sem match”, a correção mínima deve atacar a regra/dado específico (evento, vigência, status, CPF, vínculo).

---

# 5. Checklist de validação sugerido

1. **CPF elegível**
   - `eligibility_rpc_call` com `company_id/event_id/cpf` corretos
   - `eligibility_rpc_result.totalMatches > 0`
   - `passenger_snapshot_resolved.discountAmount > 0`
   - resumo com desconto

2. **CPF não elegível**
   - `eligibility_rpc_result.totalMatches = 0`
   - snapshot sem benefício
   - resumo sem desconto

3. **Programa “todos os eventos”**
   - match mesmo sem vínculo específico em `benefit_program_event_links`

4. **Programa por evento específico**
   - match apenas quando `event_id` estiver vinculado

5. **Resumo final**
   - validar `benefit_applied`, `benefit_program_name`, `discount_amount`, `final_price`

6. **Persistência**
   - `sales.benefit_total_discount` coerente com soma de `sale_passengers.discount_amount`
   - `sale_passengers` persistindo snapshot correto
