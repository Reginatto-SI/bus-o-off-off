# 1. Objetivo

Executar uma auditoria completa e objetiva para identificar todo resquício de Stripe ainda presente no Smartbus BR, validando se ainda existe alguma parte operacional/executável, o que é apenas legado histórico e o que exige remoção gradual por dependência técnica.

## Escopo investigado

Foram auditados:

- edge functions e configuração Supabase;
- frontend React (páginas, componentes, textos e fallbacks);
- tipos TypeScript e tipos gerados do Supabase;
- migrations, colunas, constraints e comentários de banco;
- trilhas de observabilidade/logs;
- documentação e análises históricas no repositório;
- referências a secrets/variáveis de ambiente visíveis no código.

## Termos pesquisados

- `stripe`
- `stripeAccount`
- `payment_intent`
- `checkout_session`
- `transfer_id`
- `connected account`
- `webhook stripe`
- `platform fee stripe`
- `stripe-webhook`
- `create checkout session`
- `direct charge`
- `split via stripe`

---

# 2. Resumo executivo

## Veredito objetivo

**Stripe não parece fazer parte do fluxo operacional oficial atual do sistema**, porque:

1. o frontend auditado não invoca `create-checkout-session` nem `create-connect-account`;
2. o fluxo público e o fluxo administrativo atuais estão centrados em Asaas (`create-asaas-payment`, `verify-payment-status`, `asaas-webhook`);
3. a própria modelagem tipada já marca vários campos Stripe como `legacy`.

## Porém: ainda existe Stripe executável no backend

Mesmo sem evidência de chamada ativa pelo frontend atual, **Stripe ainda existe como superfície executável real** no projeto porque:

- há três edge functions Stripe implementadas no repositório:
  - `supabase/functions/create-connect-account/index.ts`
  - `supabase/functions/create-checkout-session/index.ts`
  - `supabase/functions/stripe-webhook/index.ts`
- essas functions continuam declaradas em `supabase/config.toml`;
- `stripe-webhook` está com `verify_jwt = false`, então continua publicável como endpoint do Supabase;
- o código ainda depende de `STRIPE_SECRET_KEY` e `STRIPE_WEBHOOK_SECRET`.

## Conclusão prática

- **Operacional oficial atual:** Asaas.
- **Estado do Stripe no repositório:** legado ainda implantável/executável.
- **Risco principal:** não é o frontend atual; é a permanência de backend exposto, schema legado, relatórios e logs misturando Stripe com Asaas.
- **Recomendação:** remover Stripe por plano gradual, em duas etapas:
  1. desativar superfície executável e referências de UI/diagnóstico;
  2. depois tratar banco, tipos, exports e trilha histórica.

---

# 3. Todos os arquivos/pontos com Stripe encontrados

## 3.1 Edge functions e backend

### A. `supabase/functions/stripe-webhook/index.ts`
- Webhook Stripe completo e funcional.
- Processa eventos `checkout.session.completed`, `checkout.session.async_payment_succeeded` e `checkout.session.async_payment_failed`.
- Atualiza `sales` com `stripe_payment_intent_id` e `stripe_transfer_id`.
- Faz repasse para sócio via `stripe.transfers.create(...)`.
- Aceita payload mesmo sem assinatura válida caso `STRIPE_WEBHOOK_SECRET` não esteja presente, porque faz fallback para `JSON.parse(body)`.
- É o ponto mais crítico de legado Stripe ainda executável.

### B. `supabase/functions/create-checkout-session/index.ts`
- Cria sessão de checkout Stripe para venda online.
- Exige `companies.stripe_account_id` e `companies.stripe_onboarding_complete`.
- Persiste `sales.stripe_checkout_session_id`.
- Implementa Direct Charge com Connect e `application_fee_amount`.

### C. `supabase/functions/create-connect-account/index.ts`
- Cria/recupera conta Stripe Connect da empresa.
- Persiste `companies.stripe_account_id`.
- Atualiza `companies.stripe_onboarding_complete`.
- Gera onboarding/login links do Stripe e URLs de retorno com `?stripe=refresh` e `?stripe=complete`.

### D. `supabase/functions/_shared/payment-context-resolver.ts`
- Mantém provider `"stripe"` no validador de split financeiro.
- Continua validando `socio.stripe_account_id` para cenários Stripe.
- Hoje é dependência estrutural do legado de repasse Stripe.

### E. `supabase/functions/_shared/payment-observability.ts`
- Tipa provider como `"asaas" | "stripe" | "manual"`.
- Mantém estrutura de log que ainda aceita Stripe.

### F. `supabase/functions/ticket-lookup/index.ts`
- Ainda devolve `stripeCheckoutSessionId` ao frontend público.
- Indica manutenção de compatibilidade com vendas antigas ou fallback de status.

## 3.2 Configuração / deploy / ambiente

### G. `supabase/config.toml`
- Declara explicitamente:
  - `[functions.stripe-webhook]`
  - `[functions.create-connect-account]`
  - `[functions.create-checkout-session]`
- Evidência de que o deploy ainda considera essas functions.

### H. Secrets/variáveis visíveis no código
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- Não foi encontrada evidência no repositório de valores efetivamente configurados em produção.
- Portanto, **não dá para confirmar apenas pelo código se os secrets ainda existem no ambiente remoto**, mas o sistema continua preparado para usá-los.

### I. `deno.lock`
- Mantém dependência remota `https://esm.sh/stripe@18.5.0`.

## 3.3 Banco, migrations e tipagem

### J. Migrations de schema

1. `supabase/migrations/20260214134332_da92d24e-55b9-4fda-8085-997cd2bfdbff.sql`
   - cria colunas Stripe em `companies` e `sales`.
2. `supabase/migrations/20260214215504_991ae50e-3ece-452d-868e-6bb4186af4ff.sql`
   - cria `partners` com `stripe_account_id` e `stripe_onboarding_complete`;
   - adiciona `sales.stripe_transfer_id`.
3. `supabase/migrations/20260309191937_265a24aa-6da4-4502-a291-50e7a39f919e.sql`
   - registra explicitamente que campos Asaas foram adicionados mantendo Stripe para histórico.
4. `supabase/migrations/20260311020000_add_sale_integration_logs.sql`
   - `provider` aceita `stripe` via constraint.
5. Comentários de migrations posteriores ainda mencionam Stripe como contexto legado/histórico.

### K. Tipos de banco e contratos TS

1. `src/integrations/supabase/types.ts`
   - mantém `stripe_account_id`, `stripe_onboarding_complete`, `stripe_checkout_session_id`, `stripe_payment_intent_id`, `stripe_transfer_id`.
2. `src/types/database.ts`
   - marca explicitamente vários campos Stripe como legado, mas ainda os expõe no contrato do app.

## 3.4 Frontend / UI / rotas / fallback / relatórios

### L. `src/components/public/TicketCard.tsx`
- Prop `stripeCheckoutSessionId` continua existindo.
- `hasPaymentPending` considera Stripe.
- Há comentário explícito de fallback/sync com Stripe.
- Indica que a UI pública ainda trata Stripe como possibilidade válida para ingressos antigos ou sincronização sob demanda.

### M. `src/pages/public/TicketLookup.tsx`
- Mantém `stripeCheckoutSessionId` no tipo local.
- Filtra tickets com `(t.stripeCheckoutSessionId || t.asaasPaymentId)` para oferecer atualização de status.

### N. `src/pages/public/Confirmation.tsx`
- Ainda repassa `sale?.stripe_checkout_session_id` para o objeto exibido na confirmação.

### O. `src/pages/admin/SalesDiagnostic.tsx`
- Detecta gateway `Stripe` quando há `stripe_checkout_session_id` ou `stripe_payment_intent_id`.
- Mantém filtro/opção visual de gateway `Stripe`.
- Exibe identificadores Stripe em diagnóstico detalhado.
- Isso é importante para leitura de histórico, mas perpetua Stripe na operação administrativa.

### P. `src/pages/admin/SalesReport.tsx`
- Exporta `payment_id` usando apenas `s.stripe_payment_intent_id`.
- Esse é um achado relevante: o relatório/export ainda parece enviesado para legado Stripe e pode ficar inconsistente para Asaas.

### Q. `src/components/ui/StatusBadge.tsx`
- Comentário menciona checkout Stripe em andamento.

### R. Comentários dispersos em telas administrativas
- `src/pages/admin/Sellers.tsx`
- `src/pages/admin/Users.tsx`
- `src/pages/admin/SellersCommissionReport.tsx`
- `src/pages/seller/SellerDashboard.tsx`
- `src/components/admin/NewSaleModal.tsx`
- São comentários de contexto/histórico, sem efeito funcional direto.

### S. `src/pages/admin/Company.tsx`
- Não apresenta fluxo Stripe operacional ativo na leitura auditada.
- Existe apenas comentário indicando remoção prévia: `stripeConnecting removed — replaced by asaasConnecting`.
- Isso sugere migração parcial já concluída no frontend.

## 3.5 Logs / observabilidade / histórico técnico

### T. `sale_integration_logs`
- O schema ainda aceita provider `stripe`.
- Preservar isso pode ser relevante para auditoria de vendas antigas.

### U. `sale_logs`
- `stripe-webhook` ainda grava logs funcionais com descrições Stripe.
- Isso significa que, se o endpoint ainda estiver implantado e recebendo eventos, continuará gerando histórico novo Stripe.

## 3.6 Documentação / histórico de projeto

### V. Documentação operacional/manual ainda com Stripe
Arquivos mais relevantes:
- `docs/manual-operacional-smartbus-br/03-conectar-conta-stripe.md`
- `docs/manual-operacional-smartbus-br/07-criar-evento-completo.md`
- `docs/manual-operacional-smartbus-br/08-publicar-evento-colocar-venda.md`

Esses documentos ainda descrevem Stripe como requisito operacional, o que conflita com a diretriz atual de gateway único Asaas.

### W. Documentos analíticos/históricos
Há muitos arquivos de análise e auditoria que citam Stripe como contexto histórico.
Esses itens não significam fluxo ativo por si só, mas mostram que a transição foi parcial e documentada ao longo do tempo.

---

# 4. Classificação de cada ocorrência

## 4.1 Ativo e executável

1. `supabase/functions/stripe-webhook/index.ts`
2. `supabase/functions/create-checkout-session/index.ts`
3. `supabase/functions/create-connect-account/index.ts`
4. `supabase/config.toml` (declaração das functions)
5. `deno.lock` (dependência Stripe ainda resolvida)

## 4.2 Ativo mas aparentemente sem uso

1. `supabase/functions/create-checkout-session/index.ts`
   - não encontrei chamada atual do frontend auditado;
   - continua executável se invocado diretamente.
2. `supabase/functions/create-connect-account/index.ts`
   - também sem evidência de invocação ativa no frontend atual;
   - continua executável se invocado diretamente.
3. `src/components/public/TicketCard.tsx`
4. `src/pages/public/TicketLookup.tsx`
5. `src/pages/public/Confirmation.tsx`
6. `src/pages/admin/SalesDiagnostic.tsx`
7. `src/pages/admin/SalesReport.tsx`
8. `supabase/functions/ticket-lookup/index.ts`

## 4.3 Legado morto

1. comentários espalhados mencionando Stripe sem comportamento real;
2. documentação analítica antiga que apenas registra histórico;
3. comentários em migrations descrevendo origem Stripe já superada.

## 4.4 Dependência estrutural sensível

1. colunas de banco:
   - `companies.stripe_account_id`
   - `companies.stripe_onboarding_complete`
   - `sales.stripe_checkout_session_id`
   - `sales.stripe_payment_intent_id`
   - `sales.stripe_transfer_id`
   - `partners/socios_split.stripe_account_id`
   - `partners/socios_split.stripe_onboarding_complete`
2. tipos gerados e contratos TS correspondentes;
3. `sale_integration_logs.provider` aceitando `stripe`;
4. `payment-context-resolver.ts` aceitando provider Stripe;
5. retorno público `stripeCheckoutSessionId` no `ticket-lookup`.

## 4.5 Apenas histórico/documentação

1. `docs/manual-operacional-smartbus-br/*Stripe*` (histórico documental, mas com risco de orientar errado)
2. análises/auditorias antigas do repositório;
3. comentários de contexto que explicam o passado do fluxo.

---

# 5. Risco de remoção por item

## 5.1 Pode remover já

### A. Referências documentais e comentários sem efeito funcional
- comentários em arquivos de UI e relatórios;
- documentos analíticos antigos que só registram histórico;
- manual operacional desatualizado, desde que haja substituição por documentação Asaas.

**Risco:** baixo para execução; médio para histórico documental se quiser preservar trilha de auditoria.

## 5.2 Precisa substituir antes

### B. `src/pages/admin/SalesDiagnostic.tsx`
- Se remover Stripe daqui sem estratégia, perde-se leitura/administração de vendas antigas com IDs Stripe.
- Melhor substituir a categoria por algo como “Gateway legado” ou manter leitura histórica sem apresentar Stripe como opção operacional.

### C. `src/pages/admin/SalesReport.tsx`
- Precisa correção antes da remoção, porque `payment_id` ainda privilegia `stripe_payment_intent_id`.
- Remover direto pode quebrar export de vendas antigas ou piorar a ausência de identificação de pagamento no relatório.

### D. `supabase/functions/ticket-lookup/index.ts` + telas públicas que recebem `stripeCheckoutSessionId`
- Se houver tickets antigos vinculados a vendas Stripe, remover sem transição pode ocultar estado de pendência ou histórico.

## 5.3 Deve tratar com muito cuidado

### E. `supabase/functions/stripe-webhook/index.ts`
- Pode continuar processando eventos se o endpoint estiver implantado e o provedor ainda enviar webhooks.
- Também faz atualização financeira e repasse para sócio.
- Remover sem plano pode:
  - impedir conciliação de vendas antigas Stripe ainda pendentes;
  - interromper trilha de auditoria de pagamentos já iniciados no legado;
  - deixar vendas antigas presas sem finalização se ainda existirem checkouts abertos.

### F. `supabase/functions/create-checkout-session/index.ts`
- Se existir algum cliente externo, link antigo, automação ou frontend não auditado consumindo a function, a remoção quebrará criação de checkout legado.
- Não encontrei evidência de uso atual, mas a função continua publicável e funcional.

### G. `supabase/functions/create-connect-account/index.ts`
- Mesmo cenário: parece sem uso no frontend atual, mas ainda funcional para onboarding Connect.

## 5.4 Precisa preservar temporariamente por compatibilidade de dados

### H. Colunas e tipos Stripe no banco
- Devem ser preservados até concluir:
  - inventário de vendas antigas com IDs Stripe;
  - necessidade de relatórios retroativos;
  - retenção de logs e compliance histórico.

### I. `sale_integration_logs.provider = 'stripe'`
- Recomendo manter inicialmente para leitura histórica, mesmo após desativar runtime Stripe.

---

# 6. Impacto em banco/tipos/relatórios

## 6.1 Campos ainda usados de forma funcional direta

### Backend legado Stripe
- `companies.stripe_account_id`
- `companies.stripe_onboarding_complete`
- `sales.stripe_checkout_session_id`
- `sales.stripe_payment_intent_id`
- `sales.stripe_transfer_id`
- `socios_split/partners.stripe_account_id`
- `socios_split/partners.stripe_onboarding_complete`

Esses campos ainda sustentam as três edge functions Stripe.

## 6.2 Campos usados para leitura/diagnóstico/histórico

- `sales.stripe_checkout_session_id`
- `sales.stripe_payment_intent_id`
- `sales.stripe_transfer_id`
- `companies.stripe_account_id`
- `companies.stripe_onboarding_complete`

Usos identificados:
- diagnóstico administrativo;
- payload público de ticket/confirmacão;
- export/relatório;
- compatibilidade de tipos.

## 6.3 Campos que parecem legado histórico

- `companies.stripe_account_id`
- `companies.stripe_onboarding_complete`
- `sales.stripe_checkout_session_id`
- `sales.stripe_payment_intent_id`
- `sales.stripe_transfer_id`
- `partners/socios_split.stripe_*`

**Observação importante:** eles parecem históricos do ponto de vista do fluxo oficial Asaas, mas **não são “mortos” tecnicamente** enquanto o backend Stripe permanecer no projeto.

## 6.4 Campos que podem ser removidos depois

Somente após:

1. despublicar/desativar as edge functions Stripe;
2. garantir que não há vendas Stripe pendentes de conciliação;
3. adequar relatórios/exports e telas administrativas;
4. decidir política de retenção histórica.

## 6.5 Relatórios / exports / telas administrativas

### Achados sensíveis
- `SalesDiagnostic` ainda considera Stripe um gateway visível.
- `SalesReport` exporta `payment_id` com base em Stripe, o que merece revisão mesmo antes da erradicação.
- `ticket-lookup`, `TicketCard` e `Confirmation` ainda carregam payload legado Stripe.

### Risco
- remover cedo demais pode apagar capacidade de auditoria retroativa;
- manter por muito tempo perpetua ambiguidade operacional e código morto aparente.

---

# 7. Impacto em webhooks e secrets

## 7.1 `stripe-webhook` ainda pode ser acionado em produção?

**Pelo código e configuração: sim, potencialmente pode.**

Evidências:
- existe arquivo da function;
- existe entrada da function em `supabase/config.toml`;
- `verify_jwt = false`;
- a function instancia Stripe via `STRIPE_SECRET_KEY`.

## 7.2 Existe endpoint exposto?

**No nível de projeto/deploy, sim, existe endpoint publicável do Supabase Functions.**

O que **não** foi possível confirmar apenas pelo repositório:
- se essa function está hoje implantada no ambiente de produção;
- se o dashboard/proxy ainda roteia webhooks reais para ela.

## 7.3 Há secret/configuração ainda prevista?

Sim, o código prevê:
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`

Mas não foi encontrada prova local dos valores reais. Logo:
- **a existência do mecanismo é confirmada**;
- **a existência do secret configurado em produção não pôde ser comprovada nesta auditoria estática**.

## 7.4 Existe fluxo frontend/backend que ainda chama Stripe direta ou indiretamente?

### Diretamente pelo frontend auditado
- **não encontrei evidência atual** de invocação das functions Stripe.

### Indiretamente pelo backend
- **sim**: as edge functions Stripe ainda implementam todo o fluxo antigo e podem ser chamadas externamente ou por clientes não auditados.

## 7.5 Ponto crítico adicional

O `stripe-webhook` faz fallback inseguro/leniente quando `STRIPE_WEBHOOK_SECRET` não está configurado:
- se não houver secret + assinatura, ele tenta processar o body bruto mesmo assim.

Mesmo que isso tenha sido pensado para ambientes de teste, é um dos pontos mais perigosos do legado remanescente.

---

# 8. Conclusão: pode remover total, parcial ou não

## Resposta curta

**Não recomendo remoção total imediata sem plano.**

## Resposta objetiva

- **Stripe não parece mais integrar o fluxo operacional oficial atual.**
- **Mas ainda não é apenas documentação esquecida.**
- **Ainda existe backend Stripe executável e deployável.**
- Portanto, o cenário correto é:
  - **não faz parte do fluxo oficial atual**;
  - **continua presente como legado técnico ativo**.

## Decisão recomendada

### Pode remover totalmente agora?
- **Não de forma cega/imediata.**

### Pode iniciar remoção já?
- **Sim, com plano gradual.**

### Natureza da remoção recomendada
- **parcial primeiro**, depois **total**.

---

# 9. Plano mínimo recomendado para erradicação do Stripe

## Etapa 1 — Bloqueio operacional do legado

1. inventariar no banco quantas vendas ainda têm:
   - `stripe_checkout_session_id`
   - `stripe_payment_intent_id`
   - `stripe_transfer_id`
2. confirmar no ambiente Supabase se as functions Stripe estão implantadas;
3. confirmar se existem secrets remotos Stripe ainda configurados;
4. confirmar se o Stripe ainda aponta webhook para o projeto;
5. desabilitar publicamente a superfície Stripe antes de apagar schema.

## Etapa 2 — Remover fluxo executável

1. retirar do deploy:
   - `stripe-webhook`
   - `create-checkout-session`
   - `create-connect-account`
2. retirar a dependência `stripe` do runtime Deno;
3. eliminar provider `stripe` do validador compartilhado quando não houver mais runtime dependente.

## Etapa 3 — Higienizar frontend e diagnóstico

1. remover fallback Stripe de `TicketCard`, `TicketLookup` e `Confirmation` se os dados históricos não exigirem mais isso;
2. adaptar `SalesDiagnostic` para histórico neutro ou gateway legado sem papel operacional;
3. corrigir `SalesReport` para não depender de `stripe_payment_intent_id` como `payment_id` principal.

## Etapa 4 — Banco e tipos

1. congelar retenção histórica desejada;
2. decidir se campos Stripe serão:
   - mantidos indefinidamente para auditoria;
   - migrados para tabela histórica;
   - removidos após janela de retenção.
3. só depois gerar migration de limpeza.

## Etapa 5 — Documentação

1. substituir manuais que ainda instruem conectar Stripe;
2. manter, se desejado, documentos históricos marcados explicitamente como legado;
3. deixar a diretriz oficial Asaas como única fonte operacional.

---

# 10. Checklist de remoção futura

## Confirmações antes de apagar código
- [ ] Validar no banco se ainda existem vendas com IDs Stripe.
- [ ] Validar se há vendas Stripe pendentes de confirmação/cancelamento.
- [ ] Validar se o endpoint `stripe-webhook` ainda está implantado.
- [ ] Validar se ainda existem `STRIPE_SECRET_KEY` e `STRIPE_WEBHOOK_SECRET` no ambiente remoto.
- [ ] Validar se existe endpoint Stripe cadastrado no dashboard externo.
- [ ] Validar se não há cliente externo/automação usando `create-checkout-session`.
- [ ] Validar se não há cliente externo/automação usando `create-connect-account`.

## Remoção operacional
- [ ] Despublicar/neutralizar `stripe-webhook`.
- [ ] Despublicar/neutralizar `create-checkout-session`.
- [ ] Despublicar/neutralizar `create-connect-account`.
- [ ] Remover dependência Stripe do `deno.lock` / runtime.
- [ ] Remover provider `stripe` de resolvers compartilhados quando não houver mais dependência.

## Ajustes de frontend e relatórios
- [ ] Remover `stripeCheckoutSessionId` de payloads públicos quando não houver mais necessidade histórica.
- [ ] Retirar `Stripe` como gateway operacional do `SalesDiagnostic`.
- [ ] Corrigir `SalesReport` para exportar identificador de pagamento de forma aderente ao fluxo Asaas.
- [ ] Revisar comentários e textos visíveis que ainda mencionam Stripe.

## Banco/tipos/histórico
- [ ] Definir política de retenção de campos Stripe no banco.
- [ ] Ajustar `src/types/database.ts` e `src/integrations/supabase/types.ts` após decisão de schema.
- [ ] Revisar constraint `sale_integration_logs_provider_check`.
- [ ] Revisar necessidade de manter logs históricos Stripe.

## Documentação
- [ ] Atualizar/remover `docs/manual-operacional-smartbus-br/03-conectar-conta-stripe.md`.
- [ ] Atualizar/remover referências operacionais Stripe nos manuais de criação/publicação de evento.
- [ ] Marcar documentos históricos como legado para evitar instrução errada.

---

# Síntese final da auditoria

## Stripe ainda faz parte do sistema operacional atual?

**Não como fluxo oficial.**

## Stripe é apenas legado esquecido?

**Não.** É legado técnico ainda presente, com partes executáveis e deployáveis.

## Pode remover totalmente?

**Sim, em tese, mas não de forma imediata e cega.**

## Precisa plano gradual?

**Sim.** Principalmente por quatro motivos:

1. backend Stripe ainda executável;
2. campos e tipos ainda sustentam compatibilidade histórica;
3. diagnósticos/relatórios ainda leem Stripe;
4. não há confirmação estática sobre secrets/deploy remoto/pendências históricas.
