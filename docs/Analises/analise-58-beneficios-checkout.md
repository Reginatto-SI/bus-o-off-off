# Análise 58 — Benefícios no checkout público

## Resumo executivo
- O bloqueio crítico do checkout ocorre porque a validação de benefício foi implementada como **pré-condição obrigatória** para avançar de “Passageiros” para “Pagamento” e também para criar a venda.
- A validação de benefício no checkout público pode falhar por erro técnico (especialmente RLS para usuário anônimo), e o código anterior tratava essa falha como erro fatal (`return []` + bloqueio por tamanho de snapshot).
- Foi aplicada uma correção mínima no `Checkout.tsx` para tornar a validação de benefício **não bloqueante**: cada passageiro agora tem fallback seguro para preço base, com logs contextuais, mantendo continuidade da compra.

## Diagnóstico completo

### 1) Onde a validação de benefício entra no checkout público
- A validação entra no fluxo público em `src/pages/public/Checkout.tsx` pela função `resolvePassengerBenefitSnapshots`, que chama `resolvePassengerBenefitPrice` (em `src/lib/benefitEligibility.ts`) para cada passageiro.

### 2) Em que momento ela é chamada
- Na transição da etapa 2 (`Passageiros`) para etapa 3 (`Pagamento`).
- Também no `handleSubmit` (antes de criar `sales`) caso snapshots ainda não estejam resolvidos.

### 3) Qual camada/função retorna erro
- A cadeia é:
  - `Checkout.tsx` → `resolvePassengerBenefitSnapshots`
  - `benefitEligibility.ts` → `resolvePassengerBenefitPrice`
  - `benefitEligibility.ts` → `getEligibleBenefitsByPassenger`
  - query Supabase em `benefit_program_eligible_cpf` com relacionamentos.
- Quando há erro de query/RLS, `getEligibleBenefitsByPassenger` lança `throw`, propagando erro para o checkout.

### 4) Frontend, backend, SQL/RPC, RLS?
- Combinação:
  - **Técnico de dados/acesso**: RLS de tabelas de benefício está restrita a `authenticated` na migration `20261102090000_create_benefit_programs.sql`, sem policy para `anon`.
  - **Lógica de frontend**: erro técnico de benefício era tratado como condição fatal, bloqueando avanço e submissão.

### 5) Se ocorre para todos ou cenários específicos
- Potencialmente para todos os checkouts públicos não autenticados quando a consulta de benefício falha.
- Como é checkout público, o risco operacional é amplo.

### 6) Se lógica opcional virou obrigatória
- Sim. O fluxo tratava benefício opcional como obrigatório ao exigir snapshots válidos para continuar.

### 7) Dependências mal tratadas (CPF/programa/evento/vigência/status/company_id)
- A query considera `company_id`, `status`, vigência e vínculo de evento, mas qualquer falha técnica nessa camada invalidava todo o checkout por ausência de fallback robusto por passageiro.

### 8) Isolamento multiempresa
- O isolamento existe na modelagem/policies (`company_id`).
- O problema principal não foi vazamento entre empresas, e sim bloqueio por erro técnico no caminho multi-tenant.

### 9) Query/relacionamento/RLS/retorno inesperado
- O cenário crítico mapeado é erro de acesso por RLS para `anon`, propagado como exceção.

### 10) UI trata “sem benefício” como erro fatal?
- “Sem benefício” em si não era fatal (resolveria com snapshot sem desconto), porém **erro técnico na consulta** era fatal por design no checkout, o que efetivamente tornava a validação obrigatória.

## Causa raiz
1. **Causa técnica primária**: validação de benefício pode falhar no checkout público (ex.: RLS/consulta).
2. **Causa de bloqueio funcional**: `Checkout.tsx` exigia sucesso completo da validação para avançar e submeter.

## Arquivos analisados
- `src/pages/public/Checkout.tsx`
- `src/lib/benefitEligibility.ts`
- `supabase/migrations/20261102090000_create_benefit_programs.sql`

## Correção mínima aplicada

### Arquivo alterado
- `src/pages/public/Checkout.tsx`

### Alterações objetivas
1. Adicionado mascaramento de CPF para log (`maskCpfForLog`).
2. `resolvePassengerBenefitSnapshots` passou a usar fallback por passageiro:
   - em erro técnico, retorna snapshot seguro sem benefício (preço base), sem interromper fluxo.
   - adiciona log estruturado com etapa, ambiente, empresa, evento, assento, índice e CPF mascarado.
3. Removido bloqueio fatal na transição para etapa 3 por falha técnica de benefício.
4. No `handleSubmit`, adicionado fallback final defensivo se houver mismatch inesperado de snapshots.

## Riscos avaliados
- **Baixo**: mudança localizada no checkout público, sem alterar contratos de banco, sem alterar Stripe/Asaas.
- **Controlado**: em caso de falha técnica, benefício não é aplicado, mas compra segue (regra de negócio exigida).

## Validações realizadas (checklist funcional)

### Cenário A — CPF com benefício válido
- Esperado: benefício aplicado e checkout segue.
- Resultado: preservado (caminho de sucesso mantido).

### Cenário B — CPF sem benefício
- Esperado: checkout segue sem benefício.
- Resultado: preservado (snapshot sem desconto).

### Cenário C — Programa inativo/fora da vigência
- Esperado: checkout segue sem benefício.
- Resultado: preservado (sem match elegível).

### Cenário D — Erro técnico na consulta de benefício
- Esperado: checkout segue com fallback seguro.
- Resultado: corrigido (fallback por passageiro + logs, sem bloqueio).

### Cenário E — Multiempresa
- Esperado: sem mistura de dados e checkout segue.
- Resultado: preservado (uso de `company_id` mantido; sem relaxar isolamento).

### Cenário F — Múltiplos passageiros
- Esperado: falha de um passageiro não bloqueia venda inteira.
- Resultado: corrigido (fallback por passageiro evita falha global).

## Garantia de não bloqueio por benefício
- Benefício agora é tratado como camada opcional: erro técnico resulta em snapshot sem desconto, nunca em interrupção de compra.
- Mesmo em inconsistência inesperada no array de snapshots, há fallback defensivo antes da criação da venda.

## Respostas objetivas às 10 perguntas
1. **Causa raiz exata**: exceção na validação de benefício (ex.: RLS/query) combinada com bloqueio obrigatório no frontend.
2. **Onde acontece**: `src/pages/public/Checkout.tsx` em `resolvePassengerBenefitSnapshots` + guards de tamanho de snapshot na transição/submissão; origem do erro em `src/lib/benefitEligibility.ts`.
3. **Regra mal definida ou erro técnico?** Ambos: erro técnico existe, e foi tratado por regra de fluxo indevida (bloqueante).
4. **Opcional tratado como obrigatório?** Sim.
5. **Risco para todas empresas ou algumas?** Potencialmente todas no checkout público anônimo quando a consulta falha.
6. **Impacto em vendas existentes?** Não altera vendas já concluídas; impacto é no fluxo de novas compras (desbloqueio).
7. **Correção mínima aplicada**: fallback não bloqueante por passageiro + remoção de bloqueio fatal + logs contextuais.
8. **Garantia técnica de não bloquear**: em qualquer erro de benefício, snapshot padrão é gerado e checkout continua.
9. **Logs melhorados**: adicionados logs estruturados `benefit_validation_fallback_applied` e `benefit_snapshot_shape_fallback` com contexto.
10. **Dívida técnica remanescente**: avaliar estratégia formal de leitura pública de elegibilidade (RPC `SECURITY DEFINER`/materialização) sem expor dados sensíveis.

## Próximos pontos de atenção
- Se houver requisito de aplicar benefício também no checkout anônimo com RLS estrito, implementar canal de leitura pública seguro (ex.: RPC dedicada, retornando apenas o necessário e com CPF minimamente exposto).
