# Análise 25 — Remoção do legado Stripe

## 1. Resumo executivo

### Conclusão objetiva
O legado Stripe **não sustenta mais o fluxo operacional oficial de pagamento** do Smartbus BR no código auditado. O fluxo ativo e suportado é Asaas. Ainda assim, o repositório **não está totalmente livre de Stripe**: restam edge functions neutralizadas, colunas/tipos legados em `sales`, payloads públicos e telas administrativas que **ainda leem IDs Stripe históricos**, uma constraint de logs que ainda aceita `provider = 'stripe'`, resíduos em comentários/mensagens e documentação operacional antiga.

### Veredito principal
- **Dependência operacional real de Stripe hoje:** **não encontrei**, com base no código do repositório.
- **Dependência estrutural residual de Stripe hoje:** **sim**.
- **Risco de remoção cega:** **médio**, não por runtime Stripe ativo, mas porque há leituras históricas do schema/payload (`sales.stripe_*`, `stripeCheckoutSessionId`, exportações/diagnóstico) que ainda podem quebrar frontend, tipos e consultas se forem removidas sem sequência controlada.

### Tamanho real do legado
O legado Stripe remanescente está concentrado em 6 blocos:
1. **Runtime neutralizado, porém ainda presente no repositório** (`create-checkout-session`, `create-connect-account`, `stripe-webhook`).
2. **Schema/tipos legados em `sales`** (`stripe_checkout_session_id`, `stripe_payment_intent_id`, `stripe_transfer_id`).
3. **Payloads e telas que ainda leem esses campos** para diagnóstico/consulta histórica.
4. **Observabilidade compartilhada** ainda aceitando `provider = 'stripe'` por compatibilidade com trilhas persistidas.
5. **Lockfile/migrations/comentários** com rastros explícitos de Stripe.
6. **Documentação/manual legado** que ainda menciona Stripe e pode orientar incorretamente operação/suporte.

---

## 2. Inventário completo

> Classificação usada:
> 1. Uso ativo e crítico
> 2. Uso ativo, mas substituível
> 3. Legado morto / não utilizado
> 4. Nomenclatura residual sem impacto funcional
> 5. Risco estrutural

| Arquivo | Trecho/função suspeita | Tipo de resíduo | Uso real hoje? | Classificação | Risco | Evidência / leitura conservadora |
| --- | --- | --- | --- | --- | --- | --- |
| `supabase/functions/create-checkout-session/index.ts` | Edge function inteira | Runtime Stripe legado | **Não usada pelo frontend auditado**; responde `410 stripe_disabled` | 3 | Baixo isoladamente / médio se ainda implantada remotamente | Não cria checkout; virou endpoint morto controlado. Pode ser removida após confirmar que ninguém externo ainda chama o endpoint. |
| `supabase/functions/create-connect-account/index.ts` | Edge function inteira | Onboarding Stripe Connect legado | **Não usada pelo frontend auditado**; responde `410 stripe_disabled` | 3 | Baixo isoladamente / médio se ainda implantada remotamente | Não cria/reabre onboarding. Superfície neutra, mas ainda ocupa espaço e nomenclatura. |
| `supabase/functions/stripe-webhook/index.ts` | Edge function inteira | Webhook Stripe legado | **Não participa do fluxo atual**; responde `410 stripe_disabled` | 3 | Médio se existir webhook externo antigo apontando para ela | No código atual não processa nada. Porém, por nome/endpoint, ainda é superfície remota potencial se houver integração externa esquecida. |
| `supabase/config.toml` | Ausência de blocos `[functions.stripe-webhook]`, `[functions.create-checkout-session]`, `[functions.create-connect-account]` | Validação de publicação | **Sem publicação ativa declarada** | 4 | Baixo | Bom sinal: o repositório não trata mais Stripe como função ativa do deploy padrão. |
| `deno.lock` | `https://esm.sh/stripe@18.5.0` | Dependência remota residual | **Sem uso atual identificado nas functions ativas** | 3 | Baixo | Indica resquício do passado. Pode sair quando as functions Stripe forem removidas de vez e o lock for regenerado. |
| `supabase/functions/_shared/payment-observability.ts` | `provider: "asaas" | "stripe" | "manual"` | Contrato compartilhado contaminado por legado | **Uso ativo do helper, mas o provider Stripe parece apenas histórico** | 5 | Médio | O helper é ativo no fluxo Asaas. A palavra `stripe` não sustenta runtime atual, mas sua remoção exige alinhar schema/constraint/logs antes. |
| `supabase/migrations/20260311020000_add_sale_integration_logs.sql` | `provider IN ('asaas', 'stripe', 'manual')` | Constraint estrutural | **Estrutura ativa do banco** | 5 | Médio/alto | Mesmo sem runtime Stripe, a estrutura do banco ainda aceita/provider histórico. Remover exige validar retenção de linhas antigas e regenerar tipos. |
| `supabase/functions/_shared/payment-context-resolver.ts` | Comentários sobre neutralização final do legado Stripe | Nomenclatura residual | **Sem provider Stripe no tipo atual** | 4 | Baixo | Este arquivo já foi parcialmente saneado; ficou apenas comentário histórico. |
| `supabase/functions/ticket-lookup/index.ts` | `stripeCheckoutSessionId: t.sale?.stripe_checkout_session_id || null` | Payload público legado | **Uso ativo** | 2 / 5 | Médio | Endpoint público ainda expõe dado Stripe no contrato retornado ao frontend. Remoção quebra `TicketLookup`/`TicketCard`/`Confirmation` se não for coordenada. |
| `src/components/public/TicketCard.tsx` | tipo `stripeCheckoutSessionId`; `hasPaymentPending = ticket.stripeCheckoutSessionId || ticket.asaasPaymentId` | Compatibilidade de UI com pagamento legado | **Uso ativo** | 2 / 5 | Médio | A UI de passagem ainda trata Stripe como marcador de pagamento pendente. Hoje isso parece compatibilidade histórica, não necessidade oficial. |
| `src/pages/public/TicketLookup.tsx` | tipo `stripeCheckoutSessionId`; normalização; filtro de auto-verify | Contrato frontend legado | **Uso ativo** | 2 / 5 | Médio | Página pública ainda espera `stripeCheckoutSessionId` do backend. |
| `src/pages/public/Confirmation.tsx` | `stripeCheckoutSessionId: sale?.stripe_checkout_session_id || null` | Contrato frontend legado | **Uso ativo** | 2 / 5 | Médio | A confirmação pública ainda injeta o campo legado na montagem do cartão/lista. |
| `src/pages/admin/SalesDiagnostic.tsx` | `computeGateway`, filtros e exibição `Legado Stripe` | Leitura histórica/admin do gateway | **Uso ativo** | 2 / 5 | Médio | Não aciona Stripe; mas a tela ainda lê `sales.stripe_*` para classificar vendas antigas e popular filtros/detalhes. |
| `src/pages/admin/SalesReport.tsx` | export `payment_id: asaas ?? stripe_payment_intent ?? stripe_checkout_session` | Fallback histórico em exportação | **Uso ativo** | 2 / 5 | Médio | Não ativa Stripe, mas a exportação ainda depende de colunas Stripe como fallback. |
| `src/types/database.ts` | campos `stripe_checkout_session_id`, `stripe_payment_intent_id`, `stripe_transfer_id` em `Sale` | Tipo de domínio contaminado por legado | **Uso ativo** | 5 | Médio | Vários componentes leem estes campos por esse tipo. |
| `src/integrations/supabase/types.ts` | colunas Stripe em `sales` | Tipagem gerada do banco | **Uso ativo** | 5 | Médio | Remoção exige migration + regeneração de tipos + ajustes nos selects/componentes. |
| `supabase/migrations/20260214134332_*.sql` | criação de colunas Stripe em `companies` e `sales` | Histórico de schema | **Não é runtime, mas documenta origem do legado** | 4 | Baixo | Migration histórica não deve ser “apagada” do passado, mas precisa entrar no diagnóstico. |
| `supabase/migrations/20260214215504_*.sql` | `partners.stripe_*`, `sales.stripe_transfer_id` | Histórico de schema | **Não é runtime** | 4 | Baixo | Registro da origem do legado; não implica uso atual, mas explica por que tipos/contratos nasceram contaminados. |
| `supabase/migrations/20260308131238_*.sql` | comentários mencionando `Stripe Connect` | Nomenclatura residual em comentário de banco | **Sem impacto funcional direto** | 4 | Baixo | Texto precisa revisão para evitar leitura errada futura. |
| `src/components/admin/NewSaleModal.tsx` | comentário “Vendas online usam application_fee via Stripe Connect” | Comentário residual enganoso | **Sem impacto funcional** | 4 | Baixo | A regra hoje é Asaas; comentário está desatualizado e pode confundir manutenção. |
| `src/components/ui/StatusBadge.tsx` | comentário “checkout Stripe em andamento” | Comentário residual | **Sem impacto funcional** | 4 | Baixo | A lógica visual é genérica, mas o comentário ainda aponta Stripe como referência principal. |
| `src/pages/admin/Sellers.tsx` | cabeçalho do arquivo cita Stripe como responsável por pagamento do cliente final | Comentário residual | **Sem impacto funcional** | 4 | Baixo | Conteúdo documental interno desatualizado. |
| `src/pages/admin/Company.tsx` | comentário `stripeConnecting removed` | Nomenclatura residual | **Sem impacto funcional** | 4 | Baixo | Comentário não quebra nada, mas denuncia legado. |
| `docs/manual-operacional-smartbus-br/03-conectar-conta-stripe.md` | documento inteiro | Documentação operacional legada | **Não é código executável** | 4 | Médio operacional | Risco de suporte/treinamento orientar fluxo proibido. |
| `docs/manual-operacional-smartbus-br/08-publicar-evento-colocar-venda.md` | observação sobre referências Stripe legadas | Documentação residual | **Não funcional** | 4 | Baixo | Indica que o legado ainda é conhecido/documentado. |
| `docs/fase-2-*`, `docs/fase-3-*`, `docs/fase-4-*`, `auditoria-pf-pj-empresa-stripe.md`, análises antigas `analise-*stripe*.md` | menções históricas | Documentação/histórico interno | **Não funcional** | 4 | Baixo | Devem ser distinguidos de runtime; não justificam preservar Stripe no produto. |

### Achados adicionais da varredura

#### Não encontrei evidência de uso ativo destas coisas no runtime atual
- import atual de SDK Stripe em functions ativas ou frontend;
- chamadas do frontend para `create-checkout-session`, `create-connect-account` ou `stripe-webhook`;
- condicionais reais do tipo “se Stripe / se Asaas” dentro do fluxo oficial Asaas;
- fallback do checkout atual para iniciar pagamento via Stripe;
- webhook híbrido Asaas/Stripe ativo;
- segredo Stripe referenciado em código ativo do runtime atual.

#### Ainda existem sinais estruturais relevantes
- `sales.stripe_checkout_session_id`
- `sales.stripe_payment_intent_id`
- `sales.stripe_transfer_id`
- payload público `stripeCheckoutSessionId`
- constraint de logs aceitando `provider = 'stripe'`
- lockfile com dependência Stripe
- comentários/documentos que ainda usam Stripe como narrativa de negócio

---

## 3. Dependências estruturais

### Banco

#### Situação validada no código
- As colunas Stripe ainda existem em `sales` via migrations históricas e via tipos gerados.
- As colunas legadas de `companies`/`socios_split` já parecem ter sido tratadas por migration posterior de remoção parcial, mas o histórico permanece nas migrations.
- A tabela `sale_integration_logs` ainda aceita `provider = 'stripe'` por constraint.

#### Impacto
- Remover `sales.stripe_*` sem ajustar tipos, payloads e telas quebra leitura histórica e algumas telas públicas/admin.
- Remover `provider = 'stripe'` da constraint sem antes validar se existem linhas históricas no banco pode falhar na migration ou bloquear leitura/retenção esperada.

### Types
- `src/types/database.ts` ainda expõe os campos Stripe em `Sale`.
- `src/integrations/supabase/types.ts` ainda expõe colunas Stripe na tabela `sales` para `Row/Insert/Update`.
- `TicketCardData` e tipos locais de `TicketLookup` também seguem carregando `stripeCheckoutSessionId`.

#### Impacto
Esses tipos criam acoplamento estrutural: mesmo sem runtime Stripe, o frontend **ainda compila assumindo que esses campos existem**.

### Edge functions

#### Stripe neutralizado
- `create-checkout-session`
- `create-connect-account`
- `stripe-webhook`

#### Asaas ativo
- `create-asaas-payment`
- `verify-payment-status`
- `asaas-webhook`
- `create-asaas-account`
- `create-platform-fee-checkout`
- `check-asaas-integration`
- `ticket-lookup`

#### Conclusão
Não há evidência de edge function ativa do fluxo oficial dependendo de Stripe. O problema está em **resíduo de superfície neutralizada e contratos históricos ainda expostos**.

### Frontend

#### Público
- `Confirmation`, `TicketLookup` e `TicketCard` ainda leem/transportam `stripeCheckoutSessionId`.
- O uso é para detecção de “pagamento pendente/processando” em contexto histórico, não para acionar Stripe.

#### Admin
- `SalesDiagnostic` ainda detecta gateway `Stripe`/`Legado Stripe` com base em `sales.stripe_*`.
- `SalesReport` ainda usa IDs Stripe como fallback de exportação.
- Não encontrei tela admin ativa tentando iniciar fluxo Stripe.

### Relatórios
- `SalesReport` é o principal ponto funcional ainda dependente de IDs Stripe como fallback de exportação.
- Isso é dependência substituível, não crítica, mas precisa ser eliminada antes de derrubar colunas do banco.

### Webhook
- O webhook oficial atual é `asaas-webhook`.
- `stripe-webhook` está neutralizado e não participa mais do processamento.
- O risco remanescente é **externo/remoto**, não comprovável só pelo código: ainda pode existir webhook cadastrado fora do repositório apontando para endpoint antigo.

### Confirmação de pagamento
- `Confirmation` não usa Stripe para verificar pagamento; usa `verify-payment-status` e `sales.asaas_payment_id`.
- O campo legado Stripe aparece apenas como compatibilidade no payload do cartão/lista.

### Vendas manuais
- Não encontrei fluxo manual dependendo de Stripe.
- Há apenas comentário antigo em `NewSaleModal.tsx` citando Stripe Connect na explicação da taxa da plataforma.

### Diagnósticos
- `SalesDiagnostic` ainda reaproveita `sales.stripe_*` para leitura histórica do gateway e para exibir `payment_id`/estado legado.
- Isso não torna Stripe operacional, mas mantém acoplamento visual/estrutural.

---

## 4. O que pode ser removido imediatamente

> “Imediatamente” aqui significa: com baixa chance de impacto funcional direto **no código do repositório**, desde que a equipe aceite que Stripe deve desaparecer de vez e que depois sejam regenerados locks/tipos quando aplicável.

1. **Edge functions Stripe neutralizadas do repositório**
   - `supabase/functions/create-checkout-session/index.ts`
   - `supabase/functions/create-connect-account/index.ts`
   - `supabase/functions/stripe-webhook/index.ts`

2. **Dependência residual no `deno.lock`**
   - entrada `https://esm.sh/stripe@18.5.0`, após remover as functions acima e regenerar o lock.

3. **Comentários/nomenclaturas residuais sem impacto funcional**
   - `src/components/admin/NewSaleModal.tsx`
   - `src/components/ui/StatusBadge.tsx`
   - `src/pages/admin/Sellers.tsx`
   - `src/pages/admin/Company.tsx`
   - comentários SQL que ainda tratam Stripe como referência de negócio atual.

4. **Documentação operacional legada que induz uso proibido**
   - principalmente `docs/manual-operacional-smartbus-br/03-conectar-conta-stripe.md`.

### Observação conservadora
Esses itens são removíveis do ponto de vista de código, mas as três functions Stripe ainda pedem **checagem remota** antes de sumirem de vez:
- existe endpoint implantado?
- existe automação externa chamando?
- existe webhook Stripe antigo apontando para o projeto?

Se a resposta operacional for “não”, a remoção é segura.

---

## 5. O que precisa de migração/cuidado

1. **`sales.stripe_checkout_session_id`**
2. **`sales.stripe_payment_intent_id`**
3. **`sales.stripe_transfer_id`**
4. **`src/types/database.ts` e `src/integrations/supabase/types.ts`**
5. **`supabase/functions/ticket-lookup/index.ts`**
6. **`src/components/public/TicketCard.tsx`**
7. **`src/pages/public/TicketLookup.tsx`**
8. **`src/pages/public/Confirmation.tsx`**
9. **`src/pages/admin/SalesDiagnostic.tsx`**
10. **`src/pages/admin/SalesReport.tsx`**
11. **constraint `sale_integration_logs_provider_check` com `stripe`**

### Por que exigem cuidado?
Porque hoje esses pontos ainda formam uma cadeia real:
- banco expõe colunas Stripe;
- tipos gerados modelam essas colunas;
- backend (`ticket-lookup`) devolve campo legado ao frontend;
- frontend público e admin ainda lê esse campo/essas colunas;
- relatórios e diagnóstico ainda exibem o legado.

### Sequência segura implícita
Não comece derrubando coluna do banco. Primeiro remova leituras e contratos; só depois remova schema/tipos/constraints.

---

## 6. Plano de remoção recomendado

### Fase 1 — Encerramento definitivo da superfície Stripe
1. Confirmar fora do código que **não existe webhook/cliente externo** usando endpoints Stripe antigos.
2. Remover do repositório:
   - `create-checkout-session`
   - `create-connect-account`
   - `stripe-webhook`
3. Regenerar `deno.lock` para eliminar a dependência Stripe residual.
4. Revisar docs/manuais que ainda sugerem Stripe como opção operacional.

### Fase 2 — Remover compatibilidade visual/contratual do frontend
1. Ajustar `ticket-lookup` para **não retornar mais `stripeCheckoutSessionId`**.
2. Ajustar `TicketCard`, `TicketLookup` e `Confirmation` para considerar pagamento pendente apenas com sinais do fluxo oficial Asaas/estado da venda.
3. Ajustar `SalesReport` para exportar `payment_id` somente a partir do contrato oficial atual.
4. Ajustar `SalesDiagnostic` para deixar de classificar/exibir `Legado Stripe` como gateway operacional.
   - Se ainda for desejado preservar histórico visual, migrar para algo neutro como “ID legado” durante uma etapa curtíssima.
   - Se a meta é erradicação total, remover a leitura de `sales.stripe_*` da tela.

### Fase 3 — Limpeza estrutural de tipos e schema
1. Remover referências Stripe de `src/types/database.ts`.
2. Criar migration para remover de `sales`:
   - `stripe_checkout_session_id`
   - `stripe_payment_intent_id`
   - `stripe_transfer_id`
3. Regenerar `src/integrations/supabase/types.ts`.
4. Ajustar queries/selects/componentes afetados.

### Fase 4 — Fechamento de observabilidade e banco
1. Validar no banco se ainda existem linhas históricas `sale_integration_logs.provider = 'stripe'`.
2. Se a retenção histórica não for mais necessária, criar migration para remover `stripe` da constraint `sale_integration_logs_provider_check`.
3. Só então simplificar `payment-observability.ts` para `provider: 'asaas' | 'manual'`.

### Fase 5 — Validação final
1. Revisar build/lint/testes.
2. Rodar smoke test dos fluxos públicos e admin de pagamento Asaas.
3. Garantir que não sobrou nenhuma menção funcional a Stripe no repositório, exceto histórico explícito em análises antigas que a equipe decidir preservar.

---

## 7. Checklist de validação final

### Fluxo público
- [ ] Criar nova venda pública com Asaas Pix.
- [ ] Criar nova venda pública com Asaas cartão.
- [ ] Confirmar que `Confirmation` funciona sem qualquer campo Stripe.
- [ ] Confirmar que `TicketLookup` consulta/atualiza status sem `stripeCheckoutSessionId`.
- [ ] Confirmar que `TicketCard` ainda mostra “processando”/“pago” apenas com sinais oficiais do fluxo Asaas.

### Webhook / verificação
- [ ] Confirmar que `asaas-webhook` continua processando normalmente.
- [ ] Confirmar que `verify-payment-status` continua conciliando normalmente.
- [ ] Confirmar que não há referência residual a Stripe nos logs novos.

### Admin
- [ ] Confirmar que `SalesDiagnostic` não classifica mais Stripe como gateway operacional.
- [ ] Confirmar que `SalesReport` exporta `payment_id` sem fallback Stripe.
- [ ] Confirmar que vendas manuais seguem intactas.
- [ ] Confirmar que diagnóstico, confirmação e relatórios continuam respeitando `company_id` e ambiente (`payment_environment`).

### Banco / tipos
- [ ] Confirmar migration de remoção de `sales.stripe_*` aplicada sem quebrar queries.
- [ ] Confirmar tipos Supabase regenerados.
- [ ] Confirmar que `Sale` não expõe mais campos Stripe.
- [ ] Confirmar que `sale_integration_logs` não aceita mais `provider = 'stripe'`, se a retenção histórica for encerrada.

### Busca final no repositório
- [ ] `rg -n -i "stripe|stripe_|create-checkout-session|create-connect-account|stripe-webhook"` sem resíduos funcionais.
- [ ] avaliar separadamente se arquivos de análise histórica antigos permanecerão arquivados ou também serão limpos.

---

## 8. Dúvidas obrigatórias

Estas ambiguidades **não podem ser assumidas só pelo código** e devem ser respondidas antes da remoção total do schema/observabilidade:

1. **Ainda existe algum endpoint Stripe implantado remotamente no Supabase deste projeto?**
2. **Ainda existe webhook cadastrado no dashboard do Stripe apontando para esse projeto?**
3. **Ainda existem linhas históricas no banco com `sale_integration_logs.provider = 'stripe'`?**
4. **Ainda existem vendas reais no banco com `sales.stripe_checkout_session_id`, `sales.stripe_payment_intent_id` ou `sales.stripe_transfer_id` preenchidos?**
5. **A equipe quer preservar qualquer leitura histórica/admin dessas vendas antigas, ou a erradicação deve remover inclusive essa visibilidade?**

---

## Respostas objetivas às perguntas da etapa 3

### O sistema ainda possui algum fluxo operacional real que depende de Stripe?
**Pelo código auditado: não.** O fluxo oficial ativo usa Asaas, e as três functions Stripe encontradas estão neutralizadas com resposta `410`.

### Existe algum ponto em que o frontend, backend ou banco ainda espera dados de Stripe para funcionar?
**Sim, estruturalmente.** Não para processar pagamento novo, mas para compor UI, contratos e leitura histórica:
- `ticket-lookup` retorna `stripeCheckoutSessionId`;
- `TicketCard`, `TicketLookup` e `Confirmation` ainda aceitam esse campo;
- `SalesDiagnostic` e `SalesReport` ainda leem `sales.stripe_*`;
- tipos de `Sale` e tipos Supabase ainda expõem colunas Stripe.

### Há campos no banco que hoje ainda são lidos pela aplicação e que vieram do Stripe?
**Sim.** Pelo menos:
- `sales.stripe_checkout_session_id`
- `sales.stripe_payment_intent_id`
- `sales.stripe_transfer_id`

### Há algum fluxo de pagamento, confirmação, relatório, taxa de plataforma, ticket, webhook ou diagnóstico que ainda reutiliza estrutura originalmente criada para Stripe?
**Sim, mas como leitura/compatibilidade histórica, não como runtime ativo.**
- ticket lookup / cartão / confirmação pública;
- diagnóstico administrativo;
- exportação de relatório;
- tipagem do banco;
- observabilidade de integração.

### Existem funções “genéricas” de pagamento que na prática ainda estão acopladas ao legado Stripe?
**Parcialmente sim.** O ponto mais claro é `payment-observability.ts`, que continua tipando `provider = 'stripe'`, e a constraint de `sale_integration_logs` que legitima esse provider no banco.

### Existe risco de remover Stripe e quebrar Asaas por compartilhamento indevido de abstrações?
**Existe risco moderado se a remoção for feita fora de ordem.**
O risco não é o Asaas “depender” de Stripe; o risco é quebrar contratos compartilhados e telas que ainda leem campos Stripe históricos. Em ordem correta, a remoção tende a ser segura.

---

## Conclusão final

### Diagnóstico severo e honesto
- **Stripe não opera mais como gateway oficial nem como runtime de pagamento ativo no código.**
- **Ainda existe dependência estrutural residual de Stripe no projeto.**
- **Essa dependência residual está concentrada em schema/tipos/payloads/telas históricas e observabilidade, não no processamento oficial do Asaas.**
- **A erradicação completa é viável, mas deve ser feita em sequência controlada:** primeiro superfície morta/documentação, depois contratos e telas, depois schema/tipos/logs.

### Indicação explícita pedida
**Ainda há dependência estrutural de Stripe no projeto, porém não encontrei dependência operacional real de Stripe no fluxo atual.**
