# Auditoria — split do sócio global (venda 89356bbb)

## Diagnóstico comprovado

O payload de `create-asaas-payment` é montado por
`resolveAsaasSplitRecipients`. Na versão que processou o incidente, o histórico
Git (`c506f41`) mostra a consulta a `socios_split` com
`.eq("company_id", params.companyId)`. O cadastro administrado em
`/admin/socios` é global; portanto, a consulta retornou zero sócios para a
empresa vendedora e redirecionou o terço do sócio à SmartBus. Isso explica
exatamente o payload observado: SmartBus 3,34%, representante 1,67%, sem wallet
do sócio.

O filtro foi retirado do runtime em `00f24c0`, mas ainda havia duas
interpretações conflitantes: o resolvedor exigia `status = ativo`, e a
distribuição/snapshot era calculada antes de conhecer a elegibilidade real do
sócio. Assim, o snapshot podia registrar R$ 6,00 para o sócio mesmo quando o
resolvedor o excluía do payload.

## Banco, schema e RLS

O schema versionado nasceu com `socios_split.company_id` e políticas por
empresa. A migration `20260728120617_...` tornou `company_id` legado/nulo,
restringiu a tela global a developer e concedeu acesso ao `service_role`. A Edge
Function cria o cliente administrativo com service role, logo RLS não foi a
causa do backend. Uma consulta REST anônima em 2026-07-30 retornou `[]`/HTTP 200,
confirmando que o cadastro não é publicamente enumerável (comportamento
esperado), mas não permite auditar valores de produção sem credencial de
serviço. Os arquivos externos `Schema Todas as Tabelas.csv`, `Todas as RLS do
Projeto.csv` e `Texto colado(15).txt` não estavam presentes no workspace; os
dados do incidente usados aqui são os fornecidos na tarefa.

Por essa limitação, não se afirma por inferência o status atual, a wallet
sandbox ou a existência de registros antigos. A wallet de produção informada
na tarefa não foi hardcoded. A confirmação operacional do registro deve ser
feita por developer em `/admin/socios` ou via consulta autenticada de produção.

## Fluxos e consistência

- Venda pública e manual usam o mesmo `feeCalculator` no frontend e chegam ao
  motor `platform-fee-engine` nas Edge Functions.
- `create-asaas-payment` e `create-platform-fee-checkout` reutilizam o mesmo
  resolvedor de recebedores.
- Simulações visuais ainda são um espelho TypeScript do motor Edge; testes de
  contrato protegem as faixas, mínimo e teto.
- O webhook não foi alterado: ele consome o snapshot congelado.
- O ledger do representante usa o snapshot persistido, razão pela qual a
  composição deve ser resolvida antes de gravá-lo.

## Percentual Asaas e conciliação do incidente

Os R$ 18,00 são a taxa comercial (5% de R$ 360,00). A implementação converte
cada valor absoluto em percentual do bruto por `amountToGrossPercent`, com duas
casas: R$ 6,00 / R$ 360,00 = 1,67%. Sem sócio, a plataforma absorveu sua parte,
resultando em 3,34%. Esses percentuais somam 5,01%; sobre R$ 360,00 seriam
aproximadamente R$ 18,04 antes das regras do gateway.

O retorno total de R$ 17,64 não pode ser atribuído com segurança à base líquida
do gateway apenas com os artefatos disponíveis: o valor é compatível com uma
base de cerca de R$ 352,10, mas o log/retorno detalhado do Asaas não está no
repositório. A conciliação deve comparar `netValue`, taxas do gateway e valores
por wallet no painel/API Asaas; isso é uma hipótese operacional, não causa
comprovada.

## Correção e riscos

O resolvedor agora busca o sócio global sem empresa e considera exclusivamente
a wallet do ambiente. Representantes são validados pelo vínculo congelado em
`sales.representative_id` e pela wallet do ambiente; a cobertura de
`representative_company_links` deve ser auditada antes de endurecer essa condição. O motor implementa os quatro cenários antes de
gerar payload e snapshot, e os logs registram base, mínimo/teto, elegibilidade,
cenário, valores e exclusões.

Não houve migration, alteração de RLS, landing page, webhook ou movimentação
financeira retroativa. Risco residual: a produção precisa ter a versão corrigida
da Edge Function implantada e o cadastro deve ser conferido com acesso de
developer.

## Venda histórica e compensação

Não automatizar compensação nem modificar a venda. O financeiro deve primeiro
conciliar o extrato Asaas, validar contrato/contabilidade, registrar aprovação e
então, se aplicável, executar manualmente um repasse de R$ 6,00 ao sócio com
referência explícita à venda e comprovante, sem reutilizar o checkout.

## Refinamento de continuidade (pré-implantação)

A revisão do runtime encontrou caminhos bloqueantes que os comentários de
`fail-open` não cobriam: erro em `socios_split` lançava
`split_socio_query_failed` e retornava HTTP 500; secret da wallet da plataforma
ausente lançava `missing_platform_wallet` e retornava HTTP 500; qualquer exceção
do resolvedor retornava 409; e rejeição Asaas do item de split retornava 400 sem
recuperação. Além disso, `create-asaas-payment` e
`create-platform-fee-checkout` consultavam elegibilidade duas vezes.

O fluxo refinado consulta elegibilidade uma vez e degrada falha/ambiguidade
interna para recebedor ausente. Sem wallet da plataforma, não envia nenhum item
de split e registra toda a taxa calculada como pendente. Uma rejeição HTTP 4xx
explicitamente atribuída a split permite uma única nova tentativa sem `split`;
401/403, CPF, meio de pagamento, cartão e erros gerais não acionam recuperação.
Timeout, erro de rede ou corpo vazio nunca causam repetição cega: primeiro há
consulta por `externalReference`, e apenas um resultado inequívoco é reutilizado.

O vínculo adicional por `representative_company_links` introduzido no primeiro
commit foi removido desta correção. A tabela é a fonte declarada para o vínculo
automático de empresas novas, mas não há credencial de serviço neste workspace
para comprovar cobertura integral dos dados históricos em produção. A
alternativa mínima preserva `sales.representative_id`, que já é a associação
congelada da venda, e valida o registro/wallet do representante por ambiente.
Antes do deploy, uma consulta autenticada deve comparar representantes nas
vendas abertas com os vínculos; nenhuma condição mais restritiva será publicada
sem essa evidência.

`socios_split` pode conter registros históricos, embora exista índice único
apenas para `status = ativo`. Como status não define elegibilidade financeira,
dois registros com wallet no mesmo ambiente são ambíguos. O resolvedor não
escolhe arbitrariamente: degrada o sócio para ausente, registra incidente e
mantém a cobrança.

## Plano de implantação segura (não executado)

1. Publicar somente `create-asaas-payment` e
   `create-platform-fee-checkout`, que importam os `_shared` atualizados.
2. Não aplicar migration nem alterar RLS.
3. Em sandbox, validar os quatro cenários com valores e wallets controlados.
4. Simular indisponibilidade/ambiguidade de sócio, falha de representante,
   ausência da wallet da plataforma e rejeição explícita de split.
5. Com acesso developer/service role, conferir quantidade de sócios e wallets
   de produção/sandbox sem alterar registros.
6. Auditar `sales.representative_id`, `representatives` e
   `representative_company_links` das vendas recentes antes de endurecer vínculo.
7. Executar smoke test sandbox com uma venda controlada e conciliar payload,
   snapshot, resposta e logs antes de liberar produção.
8. Após publicação, acompanhar `payment_create_failed`,
   `split_degraded_reconciliation_pending`, `gateway_split_fallback_succeeded`,
   checkout sem `asaas_payment_id`, duplicidades e conversão de pagamentos.
9. Rollback imediato se aumentarem erros da função/checkouts sem cobrança,
   surgirem HTTP 500/409 por split, duplicidades, exclusões inesperadas,
   divergência snapshot/payload ou queda anormal de conversão.
10. Rollback: republicar os bundles das duas Edge Functions do commit anterior
    validado (mesmo `config.toml`/secrets), confirmar versão nos logs e repetir o
    smoke test. Não há banco para reverter.

A versão publicada atualmente permanece ativa. Nenhum deploy, cobrança, edição
de produção, migration, alteração de RLS ou repasse foi executado nesta tarefa.

## Comparação da suíte completa

A suíte foi executada no commit-base `2d2f3ac` em worktree isolada e no código
refinado. O base apresentou 89 testes aprovados e as mesmas 2 falhas em
`asaasIntegrationStatus` (91 testes); o refinamento apresentou 131 aprovados e
as mesmas 2 falhas (133 testes). Portanto, não houve nova falha: a diferença de
42 testes aprovados corresponde aos contratos financeiros adicionados.

## Auditoria da faixa por passagem individual

### Venda pública

`create-asaas-payment` carrega `sale_passengers`, filtra apenas linhas cujo
`trip_id` corresponde a `sales.trip_id`, resolve cada snapshot por
`resolvePassengerFinancialUnitPrice`, forma `passengerUnitPrices` e entrega essa
lista a `computeProgressiveFeeForPassengers`. O `grossAmount` é carregado antes
para validação de integridade, mas não é argumento de `resolveTierPercent` nem do
motor progressivo; depois do cálculo absoluto ele é usado por
`amountToGrossPercent` somente em campos legados de auditoria/snapshot; o split monetário não usa essa conversão.

### Venda manual

`create-platform-fee-checkout` carrega os snapshots persistidos em `tickets`,
restringe-os à empresa e à viagem principal, resolve os mesmos preços individuais
com `resolvePassengerFinancialUnitPrice` e chama o mesmo
`computeProgressiveFeeForPassengers(passengerUnitPrices)`. Portanto, os dois
fluxos produzem a mesma taxa para a mesma lista de itens.

### Fonte do valor individual e adicionais

O resolvedor preservado usa o preço do tipo/pacote quando ele é positivo e não
há benefício; com benefício/desconto, usa `final_price`, com fallback para o
preço do tipo. Isso cobre tipos próprios (adulto, infantil, com/sem hotel ou
outro pacote) sem substituir o item pelo preço bruto da venda. Taxas adicionais
ativas de evento são calculadas separadamente na integridade financeira e podem
elevar a cobrança, mas não entram em `passengerUnitPrices`. Serviços somente
participam da faixa quando já compõem o snapshot financeiro individual; não foi
criada inferência ou soma paralela nesta auditoria.

Caso normativo confirmado pelo motor: `[100, 100, 100, 100, 100, 100]` produz
seis breakdowns de 6% e taxa absoluta de R$ 36,00. `[600]` produz um breakdown de
4% e R$ 24,00. O total bruto coincidente de R$ 600,00 não unifica os itens nem
escolhe a faixa.

## Auditoria bruto versus líquido do split Asaas

### Evidência oficial consultada

A documentação oficial do Asaas confirma que `percentualValue` aceita quatro
casas, mas é calculado sobre o valor **líquido** da cobrança. Também confirma que
`fixedValue` é um valor fixo por cobrança ou por parcela, limitado ao líquido, e
que a wallet da conta emissora não deve ser enviada. Em parcelamentos,
`fixedValue` é multiplicado pelas parcelas, enquanto `totalFixedValue` representa
o total a ser dividido pelo Asaas, inclusive com ajuste de centavos.

Fontes oficiais verificadas em 2026-07-30:

- https://docs.asaas.com/docs/split
- https://docs.asaas.com/docs/split-in-single-payments
- https://docs.asaas.com/docs/split-into-installments
- https://docs.asaas.com/reference/create-new-payment

Isso comprova a causa da venda de referência: `R$ 6 / R$ 360 = 1,67%` foi
aplicado pelo gateway ao líquido, logo não poderia preservar R$ 6. Mais casas
decimais reduziriam apenas arredondamento, não a diferença de base.

### Mapa encontrado antes da correção

- `asaas-split-continuity.ts` convertia os valores distribuídos para
  `percentualValue` sobre `grossAmount`.
- `create-asaas-payment` mapeava esses percentuais no split da cobrança pública,
  emitida com a API key da empresa.
- `create-platform-fee-checkout` recalculava percentuais sobre a cobrança da taxa,
  emitida com a API key da plataforma; corretamente não incluía a parcela da
  própria SmartBus como destino externo.
- `amountToGrossPercent` também é usado em logs/snapshots, mas após esta correção
  não monta recebedores Asaas.
- O código atual não envia `installmentCount`/`installmentValue`; cartão e Pix são
  cobranças avulsas. O helper central, contudo, fica protegido para um fluxo
  futuro comprovado: duas ou mais parcelas usam `totalFixedValue`.
- O diagnóstico administrativo já reconhece `fixedValue`; webhook e finalização
  consomem o snapshot e não recalculam o payload. O retorno completo da criação é
  preservado nos logs de integração para conciliação de campos retornados.

### Decisão implementada

Um único adaptador, `buildAsaasSplitPayload`, recebe distribuição absoluta,
wallets, emissora e parcelamento. Cobrança avulsa usa `fixedValue`; parcelamento
usa `totalFixedValue`; a emissora é omitida. Público e manual reutilizam esse
adaptador, mantendo o motor por passagem sem qualquer conhecimento do Asaas.

Exemplo anterior:

```json
{ "walletId": "wallet_socio", "percentualValue": 1.67 }
```

Exemplo corrigido para a venda à vista:

```json
{ "walletId": "wallet_socio", "fixedValue": 6.00 }
```

Wallet ausente confirmada gera redistribuição oficial e pendência zero. Consulta
incerta gera somente a parcela potencial: com taxa de R$ 18 e representante
confirmado, sócio incerto gera R$ 6 pendentes; ambos incertos geram R$ 12. Wallet
da plataforma ausente ou fallback sem split mantém R$ 18 pendentes.

### Regressão desta etapa

A suíte completa foi comparada com o commit-base `12e44d3`: o base teve 115
testes aprovados e as mesmas 2 falhas conhecidas (117 totais); a correção de
valores fixos teve 139 aprovados e as mesmas 2 falhas (141 totais). Não houve
nova falha. Não foi executado teste sandbox, cobrança real ou deploy.

## Validação pré-deploy complementar (split fixo)

### Isolamento do representante

A fonte de vínculo operacional é `representative_company_links`: a migration de origem cria a tabela, mantém um vínculo único por empresa e o trigger `set_sale_representative_snapshot` congela em `sales.representative_id` o vínculo da própria `sales.company_id`. O trigger, entretanto, preserva um `representative_id` explícito vindo de fluxo administrativo; por isso o snapshot isolado não prova o vínculo. O resolvedor agora confirma simultaneamente `representative_id` e `company_id`. Falha de consulta ou ausência do vínculo degrada o representante, registra incidente e mantém a cobrança, sem cruzar empresas. Esse comportamento também protege vendas históricas inconsistentes sem alterar seus dados.

### Status posterior do split

A criação registra o payload efetivamente aceito e a resposta disponível no log de integração. `fixedValue`/`totalFixedValue` configurado não significa repasse concluído: `status`, `totalValue`, recusa ou cancelamento retornados pelo Asaas continuam sendo evidência posterior para o diagnóstico e conciliação. Pagamento da venda e emissão de tickets não dependem desse status interno. Não foi adicionada transferência automática nem foi alterado o webhook; se a API não devolver o estado dos splits na criação, a consulta autorizada posterior ao Asaas continua necessária.

### Consultas somente de leitura para a janela pré-deploy

Executar com credenciais autorizadas, revisar os nomes reais de secrets fora do SQL e **não** converter estas consultas em updates automáticos:

```sql
-- Empresas integradas que não informam wallet no mesmo ambiente.
select id, name, 'production' as environment from companies
where nullif(asaas_api_key_production, '') is not null and nullif(asaas_wallet_id_production, '') is null
union all
select id, name, 'sandbox' from companies
where nullif(asaas_api_key_sandbox, '') is not null and nullif(asaas_wallet_id_sandbox, '') is null;

-- Quantidade de configurações globais do sócio por ambiente.
select
  count(*) filter (where nullif(asaas_wallet_id_production, '') is not null) as production_wallet_rows,
  count(*) filter (where nullif(asaas_wallet_id_sandbox, '') is not null) as sandbox_wallet_rows
from socios_split;

-- Wallets globais duplicadas e, separadamente, ambientes com mais de uma candidata.
select environment, wallet_id, count(*)
from (
  select 'production' environment, asaas_wallet_id_production wallet_id from socios_split
  union all
  select 'sandbox', asaas_wallet_id_sandbox from socios_split
) wallets
where nullif(wallet_id, '') is not null
group by environment, wallet_id having count(*) > 1;

select environment, count(*) candidate_count
from (
  select 'production' environment from socios_split where nullif(asaas_wallet_id_production, '') is not null
  union all
  select 'sandbox' from socios_split where nullif(asaas_wallet_id_sandbox, '') is not null
) candidates group by environment having count(*) > 1;

-- Vendas com representante sem o vínculo correspondente à empresa.
select s.id, s.company_id, s.representative_id, s.created_at
from sales s
where s.representative_id is not null
  and not exists (
    select 1 from representative_company_links rcl
    where rcl.company_id = s.company_id and rcl.representative_id = s.representative_id
  )
order by s.created_at desc;

-- Representantes de vendas sem wallet no ambiente congelado.
select s.id, s.company_id, s.representative_id, s.payment_environment
from sales s join representatives r on r.id = s.representative_id
where (s.payment_environment = 'production' and nullif(r.asaas_wallet_id_production, '') is null)
   or (s.payment_environment = 'sandbox' and nullif(r.asaas_wallet_id_sandbox, '') is null);

-- Comparação da wallet SmartBus fornecida de forma segura como parâmetro, sem hardcode.
select c.id, c.name, 'production' as environment from companies c
where c.asaas_wallet_id_production = :smartbus_wallet_production
union all
select c.id, c.name, 'sandbox' from companies c
where c.asaas_wallet_id_sandbox = :smartbus_wallet_sandbox;
```

Checklist sandbox: confirmar uma única configuração global por ambiente; validar os quatro cenários; simular colisões de wallet da emissora; forçar rejeição exclusivamente de split; confirmar uma única recuperação sem `split`; consultar `externalReference` em resposta ambígua; comparar payload aceito, snapshot e log de pendência; somente então aprovar publicação das funções `create-asaas-payment` e `create-platform-fee-checkout`.
