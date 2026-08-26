# Arquitetura de pagamentos — fotografia auditada

> Fotografia do repositório em 2026-08-26. Antes de uma tarefa futura, revalidar somente o recorte necessário — sobretudo rotas, componentes, Edge Functions, tabelas/campos, migrations, helpers, PRDs normativos, regras financeiras, ambiente e diagnóstico que a mudança tocar. Não reescrever toda a fotografia a cada uso. O código atual e migrations aplicadas vencem análises históricas; regras de produto só são normativas quando o PRD se declara oficial.

## Sumário

- [Fontes e hierarquia](#fontes-e-hierarquia)
- [Resumo executivo e jornada](#resumo-executivo-e-jornada)
- [Inventário visual](#inventário-visual)
- [Inventário técnico e de dados](#inventário-técnico-e-de-dados)
- [Acoplamentos e riscos](#acoplamentos-e-riscos)
- [Contrato conceitual](#contrato-conceitual)

## Fontes e hierarquia

`docs/PRD/Asaas/00-asaas-indice-geral.md` declara os PRDs 01–07 como ordem oficial. O PRD 04 é explicitamente **histórico** e remete a `docs/PRD/PRD 01 — Regra Oficial de Divisão da Taxa entre Marketplace, Sócio e Representante.txt`, cujo título interno vigente é **PRD 01 — Regra Oficial de Taxa da Plataforma, Base de Cálculo e Divisão entre Marketplace, Sócio e Representante**. Esse PRD 01 é a fonte normativa da regra financeira; o PRD Asaas 07 deve ser lido sem substituir suas atualizações posteriores. PRDs Financeiro 01–05 descrevem o alvo multigateway/ledger e não provam que o código já o implementa. `docs/PRDs/MercadoPago/*` é planejamento, não integração existente nem documentação oficial do provedor. `docs/Analises/*` registra contexto e incidentes históricos, não regra vigente.

Divergências relevantes: documentos antigos citam percentual fixo, critérios de status do sócio, sócio por empresa e legado Stripe; a atualização normativa de 2026-07-30 e migrations posteriores tornam o sócio global, vedam filtro por `company_id` e fazem da wallet válida no ambiente a única condição operacional de recebimento do sócio. Há dois arquivos PRD Asaas 07; nenhum substitui a atualização normativa posterior do PRD 01 oficial. Não corrigir divergências do produto nesta skill.

## Resumo executivo e jornada

Hoje o Asaas permeia configuração por empresa, checkout público, venda manual/taxa, confirmação, emissão de tickets, split e diagnóstico. O backend Supabase Edge concentra credenciais e ações financeiras. A venda é a âncora: `company_id`, `payment_environment`, `asaas_payment_id`, referência externa, status interno/gateway e snapshots permitem correlação.

1. Administrador acessa `/admin/empresa`; status do ambiente atual é montado por `Company.tsx` e `asaasIntegrationStatus.ts`.
2. Wizard cria subconta ou vincula API key por `create-asaas-account`; painel consulta `check-asaas-integration`.
3. Ambiente operacional vem de `companies.payment_environment`: no checkout, da empresa do evento; no admin, da empresa ativa. `use-runtime-payment-environment.ts` apenas normaliza essa configuração. A resolução por host em `get-runtime-payment-environment`/`runtime-env.ts` é residual e não participa do caminho principal de cobrança.
4. Checkout valida evento, comprador, passageiros, assentos/locks, benefícios e termos.
5. Cria `sales` com ambiente e estado inicial e persiste `sale_passengers` como snapshot.
6. `create-asaas-payment` revalida empresa/venda/ambiente/status, resolve taxa e recebedores, cria cobrança com `externalReference = sale.id` e persiste ID/status/link.
7. Comprador paga no fluxo Asaas; a confirmação pública consulta a venda e aciona verify como fallback/polling.
8. `asaas-webhook` valida token/contexto/ambiente, deduplica e encaminha evento confirmatório.
9. Webhook e `verify-payment-status` convergem pela rotina compartilhada `finalizeConfirmedPayment`.
10. Finalização atualiza venda, libera locks, gera tickets de modo idempotente e registra observabilidade.
11. Resolvedor de split, snapshot da venda e `representative_commissions` representam a distribuição financeira.
12. `/admin/diagnostico-vendas`, `/admin/empresa`, `sale_logs`, `sale_integration_logs` e dedup permitem suporte; `reconcile-sale-payment` repara pago sem tickets em condições controladas.

Cancelamento/expiração existem para vendas/locks; reversões, estornos e chargebacks não possuem fluxo financeiro automatizado end-to-end comprovado e exigem tratamento explícito. Não afirmar suporte completo.

## Inventário visual

| Rota/tela | Componentes/modais | Acesso/finalidade | Estados, ações e erros | Acoplamento a generalizar futuramente |
|---|---|---|---|---|
| `/admin/empresa` | `Company.tsx`, `AsaasOnboardingWizard`, `AsaasAddressModal`, `AsaasTutorialVideoDialog`, `AsaasDiagnosticPanel` | gestor/admin no tenant; developer vê diagnóstico ampliado | conectar/criar conta, informar credencial, selecionar/visualizar ambiente, verificar, desconectar; connected/inconsistent/not configured/checking e erros categorizados | nomes Asaas, API key/account/wallet/Pix e campos diretos em `companies` |
| `/eventos/:id/checkout` (rota real) | `Checkout.tsx` | público; inicia compra | valida dados, assentos, métodos, benefício/termos; loading, erro de integração/Pix/split, rollback e redirect | invoca diretamente `create-asaas-payment`; mensagens/IDs Asaas |
| `/confirmacao/:id` | `Confirmation.tsx`, `TicketCard` | público com ID da venda | pending/paid/error, polling verify, reabrir link, tickets/recibo | invoca `verify-payment-status` e `get-asaas-payment-link`; invoice URL Asaas |
| `/consultar-passagens` | `TicketLookup.tsx`, `TicketCard` | público mediante dados de consulta | localizar/mostrar tickets pós-pagamento | genericamente pós-pagamento; não deve depender do provedor |
| `/admin/vendas` | `Sales.tsx`, `NewSaleModal` | usuários administrativos conforme contexto/roles | venda manual, status, pagar taxa, verificar pagamento, corrigir passageiro; toasts de falha | verify e cobrança de taxa Asaas; colunas `asaas_*` |
| `/admin/diagnostico-vendas` | `SalesDiagnostic.tsx` | rota técnica desktop protegida (developer) | filtros empresa/ambiente/data/status, expansão, logs, divergências, splits, retry/reconcile | terminologia, campos e eventos Asaas devem ganhar dimensão `gateway` |
| `/admin/relatorios/vendas` | `SalesReport.tsx` | admin do tenant | relatórios de vendas e estado financeiro | snapshots devem permanecer genéricos |
| `/admin/socios` | `SociosSplit.tsx` | rota técnica desktop/developer | gerencia sócio global e wallets por ambiente | wallet Asaas é mecanismo, não objetivo comercial |
| `/admin/representante` e `/representante/painel` | `Representative.tsx`, `RepresentativeDashboard.tsx` | developer/admin e representante | vínculo, elegibilidade, wallets, comissões/status/bloqueios | ledger é genérico; wallets/status de split são Asaas |
| `/admin/relatorios/empresas-ativacao` | `CompanyActivationReport.tsx` | developer | readiness/account/wallet/Pix por ambiente | relatório fortemente Asaas |

Também há superfícies indiretas em eventos/publicação, vendedores, vendas de serviços, relatórios e notificações: pagamentos definem liberação operacional e indicadores, ainda que a tela não crie cobrança.

## Inventário técnico e de dados

### Frontend

- Hooks/helpers genéricos ou candidatos: `use-runtime-payment-environment.ts`, `feeCalculator.ts`, `platformFeeCheckout.ts`, `ticketPurchaseMetadata.ts`, `payment-finalization.ts` (backend), estados/snapshots da venda.
- Específicos Asaas: `asaasIntegrationStatus.ts`, `asaasInvoiceUrl.ts`, `asaasError.ts`, componentes `Asaas*` e chamadas diretas nas páginas.
- Aparentemente genéricos mas acoplados: `platformFeeCheckout`, telas Confirmation/Sales/Diagnostic e campos `payment_*` cujo comportamento chama funções Asaas.

### Edge Functions

| Função | Responsabilidade |
|---|---|
| `create-asaas-account` | criar/vincular conta, validar identidade/endereço e persistir configuração por ambiente |
| `check-asaas-integration` | autenticação administrativa, consulta gateway, account/wallet/onboarding/Pix/webhook e diagnóstico |
| `get-runtime-payment-environment` | endpoint residual que reflete a heurística legada por host; não é consumido pelo frontend nem deve orientar novos gateways |
| `create-asaas-payment` | validar contexto, prevenir duplicação, calcular/snapshotar, resolver split, criar/persistir cobrança |
| `get-asaas-payment-link` | recuperar/reabrir link da cobrança correlacionada |
| `asaas-webhook` | autenticar, validar, deduplicar, atualizar status e finalizar |
| `verify-payment-status` | consultar gateway, convergir e registrar ausência/divergência de webhook |
| `reconcile-sale-payment` | reparar inconsistência de tickets após pagamento confirmado |
| `create-platform-fee-checkout` | cobrança de taxa em venda manual e split correspondente |

Shared: `payment-context-resolver.ts`, `runtime-env.ts`, `asaas-pix-readiness.ts`, `asaas-account-payload.ts`, `asaas-split-continuity.ts`, `split-recipients-resolver.ts`, `platform-fee-engine.ts`, `payment-finalization.ts`, `payment-observability.ts`.

### Banco e identificadores

- `companies`: `asaas_api_key_*`, `asaas_account_id_*`, `asaas_wallet_id_*`, onboarding, Pix readiness/check timestamps, account email, ambiente/configuração e percentuais. Segredos na tabela merecem revalidação de exposição/RLS; nunca selecioná-los no cliente.
- `sales`: `company_id`, `payment_environment`, `payment_method`, `status`, `asaas_payment_id/status`, invoice/link, `payment_confirmed_at`, taxa total/partes e metadados/snapshots, representative ID, estados de taxa manual.
- `sale_passengers`, `seat_locks`, `tickets`: snapshot de passageiros, reserva temporária e artefato emitido; são responsabilidades SmartBus.
- `sale_logs`: trilha operacional; `sale_integration_logs`: origem, evento, ambiente, status, incidentes e payload sanitizado.
- `asaas_webhook_event_dedup`: chave do evento, contagem/estado de processamento e deduplicação.
- `socios_split`: sócio global da plataforma e wallets independentes por ambiente; não pertence à empresa cliente nem deve ser filtrado por `company_id`, que é legado segundo a migration e o PRD normativo atuais.
- `representatives` e `representative_commissions`: vínculo/elegibilidade, wallets por ambiente, ledger e bloqueios.
- RPCs relevantes: `correct_sale_passenger`, `resolve_event_seller_ref`, ocupação/locks, criação idempotente de comissão e relatório de ativação.

Consultar `src/integrations/supabase/types.ts` e a migration mais recente para o formato exato; tipos gerados podem ficar defasados do schema remoto.

## Acoplamentos e riscos

1. Configuração, IDs externos e telas gravam `asaas_*` diretamente; múltiplos gateways exigirão dimensão explícita sem apagar histórico.
2. Nomes de Edge Functions estão embutidos em Checkout/Confirmation/Sales/Company.
3. Venda precisa congelar gateway+ambiente; usar configuração atual da empresa para venda histórica pode consultar provedor errado.
4. Dedup é nomeada e modelada para Asaas; uma chave genérica precisa incluir provedor/ambiente/conta/evento.
5. Status externos não devem virar enum interno por equivalência textual.
6. Split Asaas é hoje caminho de liquidação; gateway sem split exige ledger/baixa conforme PRDs Financeiro, sem mudar a divisão comercial.
7. Fluxos de reversão não estão fechados; novo gateway não deve ampliar a falsa impressão de suporte.
8. Documentos históricos e migrations legadas (inclusive Stripe) podem induzir implementação incorreta.
9. Grande refatoração antecipada ameaça o Asaas operacional; criar seams incrementais e testes de caracterização.
10. `create-asaas-account` ainda aceita fallback legado por host quando `target_environment` é omitido; os chamadores atuais enviam ambiente explícito, mas uma chamada futura incompleta pode voltar à heurística. A regra de produto considera `smartbus.com.br`, `www.smartbus.com.br`, `smartbusbr.com.br` e `www.smartbusbr.com.br` como Produção, enquanto o código residual reconhece somente os dois últimos. Tratar como lacuna documentada, não como contrato multigateway.
11. O schema atual persiste ambiente, mas não persiste ainda um campo genérico de gateway na venda; o Asaas é o único provider operacional. Um novo gateway deverá congelar ambos sem alterar retroativamente vendas existentes.

## Contrato conceitual

| Capacidade | Classe | Contrato SmartBus |
|---|---|---|
| credencial segura e isolamento por tenant | obrigatória | backend resolve credencial da empresa sem exposição |
| correlação venda↔cobrança e ID externo | obrigatória | relação persistente, imutável e auditável |
| ambiente explícito | obrigatória quando provedor separa ambientes; caso contrário modelar a realidade | nunca misturar credenciais/IDs |
| criar cobrança idempotente | obrigatória | retry não pode duplicar cobrança |
| consultar status | obrigatória | fallback e reconciliação precisam de fonte externa |
| webhook | obrigatória salvo exceção humana com mitigação robusta | validar autenticidade e deduplicar |
| métodos (Pix/cartão/boleto) | condicional por escopo de produto | matriz explícita; não simular suporte |
| split/marketplace/recebedores | condicional à regra financeira | reproduzir divisão ou declarar gap/ledger alternativo aprovado |
| cancelamento/estorno/chargeback | condicional às políticas aprovadas | mapear capacidade e efeitos internos; não inventar automação |
| sandbox | condicional à oferta do provedor, operacionalmente desejável | homologação não pode contaminar produção |
| logs, auditoria e reconciliação | obrigatória | diagnóstico ponta a ponta e reparo controlado |
| link/fatura hospedada | opcional | UX depende do produto do gateway |
| `walletId`, `externalReference`, eventos/tokens Asaas | específica do Asaas | traduzir objetivo, nunca copiar conceito |
