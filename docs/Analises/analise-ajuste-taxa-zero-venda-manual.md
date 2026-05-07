# Análise — ajuste de taxa zero em venda manual

## 1. Diagnóstico do problema

A tela `/admin/vendas` carregava vendas filtradas por `company_id` da empresa ativa, mas a ação de taxa era decidida somente pelo estado salvo na venda (`platform_fee_status`) e pelo valor persistido em `platform_fee_amount`. Assim, uma venda manual criada com `platform_fee_status = 'pending'` e `platform_fee_amount = 5` continuava exibindo `Gerar taxa (R$ 5,00)`, mesmo quando a empresa ativa estava configurada em `/admin/empresa` com `platform_fee_percent = 0`.

A origem do valor indevido estava no fluxo de criação de venda manual (`NewSaleModal`): a função de cálculo aplicava o motor progressivo por passageiro e, se o resultado fosse positivo mas menor que R$ 5,00, elevava para o piso mínimo sem verificar a Taxa da Plataforma (%) da empresa.

## 2. Arquivos investigados

- `src/pages/admin/Sales.tsx`
  - Carregamento da listagem de vendas em `/admin/vendas`.
  - Filtro multiempresa por `activeCompanyId`.
  - Montagem do menu de ações, incluindo `Gerar taxa`.
  - Alteração manual de status da venda.
- `src/components/admin/NewSaleModal.tsx`
  - Criação de venda manual/reservada.
  - Cálculo de prévia da taxa da plataforma.
  - Persistência de `platform_fee_amount` e `platform_fee_status`.
- `src/pages/admin/Company.tsx`
  - Fonte operacional da configuração `platform_fee_percent` e `socio_split_percent` exibida na aba Pagamentos.
- `src/contexts/AuthContext.tsx`
  - Origem de `activeCompanyId` e `activeCompany` no contexto multiempresa.
- `src/lib/feeCalculator.ts`
  - Motor progressivo usado no frontend para taxa por passageiro.
- `src/lib/platformFeeCheckout.ts`
  - Wrapper frontend para a edge function de checkout da taxa.
- `supabase/functions/create-platform-fee-checkout/index.ts`
  - Backend responsável por criar/reutilizar cobrança avulsa da taxa de plataforma.
- `supabase/functions/create-asaas-payment/index.ts`
  - Fluxo de cobrança Asaas da venda principal e snapshots de split.
- `supabase/functions/_shared/platform-fee-engine.ts`
  - Motor oficial progressivo por passageiro.
- `supabase/functions/_shared/split-recipients-resolver.ts`
  - Resolução de split/sócio/representante.
- `supabase/migrations/20260313180000_fix_reserved_fee_transition_rule.sql`
  - Trigger que bloqueia marcação como pago quando `platform_fee_status` está pendente.

## 3. Regra atual encontrada no código

- `/admin/vendas` busca vendas com `sales.company_id = activeCompanyId`, portanto a listagem respeita a empresa ativa no carregamento.
- O menu de ações usava `platform_fee_status` diretamente:
  - `pending` sem `platform_fee_payment_id` exibia `Gerar taxa`.
  - `pending` com `platform_fee_payment_id` exibia `Consultar taxa`.
  - `failed` exibia `Reprocessar taxa`.
- A criação de venda manual calculava a taxa pelo motor progressivo (`calculatePlatformFee`) por passageiro e persistia:
  - `platform_fee_amount` com o valor calculado/ajustado;
  - `platform_fee_status = 'pending'` quando o valor era maior que zero.
- O cálculo de venda manual não verificava `activeCompany.platform_fee_percent` antes de aplicar a taxa mínima.
- A edge function `create-platform-fee-checkout` aplicava novamente o piso mínimo de R$ 5,00 para qualquer venda elegível com `platform_fee_amount` positivo, sem consultar `companies.platform_fee_percent` antes do ajuste.

## 4. Onde ocorre a aplicação indevida da taxa mínima

A aplicação indevida ocorria em dois pontos defensivos do mesmo fluxo:

1. **Frontend / criação da venda manual** — `NewSaleModal` aplicava `Math.max(valorCalculado, 5)` sempre que o motor progressivo retornava valor positivo, sem distinguir empresa isenta de empresa com taxa configurada.
2. **Backend / geração da cobrança avulsa** — `create-platform-fee-checkout` também elevava `platform_fee_amount` para R$ 5,00 antes de criar a cobrança Asaas, sem validar se `companies.platform_fee_percent` era zero.

## 5. Correção mínima proposta

- Usar a empresa ativa (`activeCompany.platform_fee_percent`) como trava de elegibilidade para taxa manual no frontend.
- Se `platform_fee_percent` for zero, `null`, vazio ou equivalente a zero:
  - a prévia da taxa manual retorna `0`;
  - a venda manual nasce com `platform_fee_status = 'not_applicable'`;
  - o menu de ações não mostra `Gerar taxa`, `Consultar taxa`, `Ver taxa paga` nem `Reprocessar taxa`;
  - a marcação manual como pago normaliza registros legados para `not_applicable`, evitando bloqueio do trigger de taxa pendente.
- Se `platform_fee_percent` for maior que zero:
  - manter o cálculo progressivo existente;
  - manter a regra de piso mínimo de R$ 5,00.
- No backend, consultar `companies.platform_fee_percent` antes de criar cobrança avulsa:
  - se a empresa for isenta, atualizar a venda para `not_applicable`/valor `0` e retornar resposta idempotente sem criar cobrança Asaas;
  - se a empresa tiver taxa maior que zero, manter a regra atual de mínimo.

## 6. Alterações realizadas

- `NewSaleModal` passou a ler `activeCompany.platform_fee_percent` e usar `hasConfiguredPlatformFee` como trava antes de calcular/aplicar o piso da taxa manual.
- A prévia visual da venda manual deixou de exibir seção de taxa quando a empresa ativa está isenta.
- `Sales.tsx` passou a ocultar ações e badges de taxa quando a empresa ativa está com comissão zero.
- `Sales.tsx` passou a tratar taxa zero como satisfeita para permitir `Marcar como Pago` sem bloquear venda manual/reservada.
- `Sales.tsx` normaliza registros legados de empresas isentas para `platform_fee_status = 'not_applicable'` e `platform_fee_amount = 0` ao marcar como pago.
- `create-platform-fee-checkout` passou a validar `companies.platform_fee_percent` antes da criação da cobrança e a encerrar o fluxo como isento quando o percentual é zero.
- `platformFeeCheckout.ts` passou a exibir a mensagem retornada pelo backend em respostas `waived`, evitando mensagem específica e incorreta de “abaixo do mínimo” para empresa com taxa zero.

## 7. Testes/validações recomendadas

1. Empresa 7 FEST com Taxa da Plataforma = `0%`:
   - confirmar em `/admin/empresa` que `Taxa da Plataforma (%)` está `0`;
   - criar venda manual/reservada;
   - confirmar que a venda não nasce com `platform_fee_status = 'pending'`;
   - confirmar que `/admin/vendas` não mostra `Gerar taxa` nem badge `Taxa pendente`;
   - confirmar que `Marcar como Pago` não é bloqueado por taxa pendente.
2. Empresa com Taxa da Plataforma maior que zero e passagem com taxa calculada maior/igual a R$ 5,00:
   - confirmar que a venda manual continua nascendo com `platform_fee_status = 'pending'`;
   - confirmar que `/admin/vendas` mostra `Gerar taxa` com o valor calculado.
3. Empresa com Taxa da Plataforma maior que zero e venda de valor baixo:
   - confirmar que a taxa calculada abaixo de R$ 5,00 continua sendo ajustada para R$ 5,00.
4. Empresa com Taxa do Sócio = `0%`:
   - confirmar que a venda não é bloqueada;
   - confirmar nos logs/snapshot de split que o sócio não recebe split quando não há percentual elegível.
5. Edge function:
   - chamar `create-platform-fee-checkout` para venda de empresa isenta e confirmar que não há criação de cobrança Asaas.

## 8. Riscos residuais

- Vendas legadas de empresas isentas que já possuam `platform_fee_payment_id` pago permanecem historicamente registradas; a correção evita novas cobranças e normaliza pendências ao marcar como pago, mas não executa saneamento em massa.
- O cálculo de empresas com taxa maior que zero mantém o motor progressivo existente por passageiro, em vez de substituir toda a regra pelo percentual comercial fixo da empresa. Isso foi mantido por segurança e escopo mínimo, pois a solicitação central era impedir cobrança quando a empresa está isenta e preservar o comportamento para empresas com taxa configurada.
- A validação manual completa depende de ambiente com dados reais/Supabase e não foi automatizada neste ajuste.
