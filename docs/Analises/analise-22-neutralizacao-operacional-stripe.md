# 1. Objetivo

Executar a Etapa 1 de erradicação do Stripe no Smartbus BR, neutralizando a superfície operacional/executável do legado Stripe sem remover schema histórico, campos de banco, vendas antigas, logs antigos ou leituras retroativas.

# 2. Escopo desta etapa

Esta etapa foi limitada a:

- neutralizar as edge functions Stripe como runtime operacional;
- retirar Stripe da configuração ativa de deploy do Supabase Functions;
- preservar colunas, tipos, payloads e leituras históricas ainda necessárias para compatibilidade temporária;
- não alterar o fluxo oficial Asaas;
- não remover schema legado do banco.

Fora do escopo nesta etapa:

- migrations de remoção de colunas Stripe;
- limpeza de dados históricos;
- remoção de tipos legados usados apenas para leitura histórica;
- limpeza final de telas/relatórios que apenas exibem legado.

# 3. Arquivos alterados

1. `supabase/functions/stripe-webhook/index.ts`
2. `supabase/functions/create-checkout-session/index.ts`
3. `supabase/functions/create-connect-account/index.ts`
4. `supabase/config.toml`
5. `analise-22-neutralizacao-operacional-stripe.md`

# 4. O que foi neutralizado

## 4.1 `stripe-webhook`

- Deixou de processar qualquer evento Stripe.
- Foi substituído por resposta explícita `410 Gone` com payload `stripe_disabled`.
- Resultado prático: o webhook Stripe não continua mais utilizável como caminho válido de processamento.

## 4.2 `create-checkout-session`

- Deixou de criar checkout Stripe.
- Foi substituído por resposta explícita `410 Gone` com payload `stripe_disabled`.
- Resultado prático: não existe mais caminho válido para iniciar checkout Stripe a partir desta function.

## 4.3 `create-connect-account`

- Deixou de criar/reabrir onboarding Stripe Connect.
- Foi substituído por resposta explícita `410 Gone` com payload `stripe_disabled`.
- Resultado prático: não existe mais caminho válido para onboarding Stripe.

## 4.4 Deploy/config do Supabase

- As entradas abaixo foram removidas de `supabase/config.toml`:
  - `[functions.stripe-webhook]`
  - `[functions.create-checkout-session]`
  - `[functions.create-connect-account]`
- Resultado prático: o projeto deixa de tratar Stripe como função ativa/publicável na configuração atual do repositório.

# 5. O que foi preservado por histórico

Foram mantidos intencionalmente:

- colunas Stripe no banco (`stripe_account_id`, `stripe_checkout_session_id`, `stripe_payment_intent_id`, `stripe_transfer_id`, etc.);
- tipos TypeScript gerados/manuals relacionados a dados históricos;
- payloads e telas que apenas leem legado Stripe para diagnóstico/consulta;
- logs antigos e constraints que ainda permitem leitura histórica de eventos antigos;
- `ticket-lookup` e leituras públicas que carregam IDs legados para compatibilidade de consulta.

Motivo:

- a etapa atual visa neutralizar **execução**, não apagar **histórico**.

# 6. Riscos evitados

Com esta neutralização, foram evitados os seguintes riscos:

1. continuação acidental de processamento por `stripe-webhook`;
2. criação indevida de novos checkouts Stripe;
3. reabertura indevida de onboarding Stripe Connect;
4. manutenção de Stripe como superfície operacional oficialmente publicável no `config.toml`;
5. uso futuro inadvertido dessas functions por cliente externo, automação antiga ou chamada manual.

# 7. Dependências encontradas

## 7.1 Dependências preservadas por compatibilidade

Continuam existindo por histórico:

- `payment-context-resolver.ts` ainda aceita provider `"stripe"`;
- `payment-observability.ts` ainda tipa `provider: "asaas" | "stripe" | "manual"`;
- `SalesDiagnostic`, `SalesReport`, `TicketLookup`, `TicketCard` e `Confirmation` ainda leem IDs Stripe legados;
- migrations e tipos de banco continuam descrevendo o legado Stripe.

## 7.2 Conclusão sobre dependência oculta do runtime

Na revisão desta etapa, **não foi encontrada evidência de dependência atual do frontend** das functions:

- `create-checkout-session`
- `create-connect-account`
- `stripe-webhook`

Ou seja:

- o fluxo atual auditado não depende dessas functions para operar com Asaas;
- a permanência dessas funções representava risco operacional residual, não dependência funcional atual do frontend.

# 8. Impacto validado no sistema atual

## 8.1 O que permanece funcionando por desenho

- fluxo oficial Asaas permanece intacto;
- vendas antigas continuam consultáveis, porque schema e tipos não foram removidos;
- logs antigos continuam legíveis, porque não houve alteração nas tabelas históricas;
- telas diagnósticas continuam podendo abrir, porque não removemos campos nem leitura histórica.

## 8.2 O que deixou de existir

- execução operacional Stripe via edge functions do projeto.

## 8.3 Limite da validação desta etapa

Validação feita nesta entrega:

- inspeção estática do repositório;
- verificação do `config.toml`;
- verificação de que as functions Stripe agora retornam `410`;
- verificação de que o frontend auditado não invoca essas functions.

Não foi possível validar diretamente neste ambiente:

- estado real do deploy remoto já publicado no Supabase;
- existência de secrets Stripe no ambiente remoto;
- eventual consumidor externo fora do repositório;
- comportamento real em produção/sandbox remotos.

Portanto, a conclusão correta é:

- **o repositório atual deixa Stripe neutralizado como runtime**;
- **a confirmação final em produção/sandbox depende do próximo deploy e da checagem operacional remota**.

# 9. Pendências para etapa futura

1. decidir quando remover provider `stripe` de estruturas compartilhadas sem prejudicar leitura histórica;
2. revisar se `SalesDiagnostic` deve continuar exibindo Stripe como gateway legado ou ser reclassificado;
3. revisar `SalesReport`, que ainda lê `stripe_payment_intent_id` como `payment_id` em exportações;
4. confirmar e remover secrets Stripe do ambiente remoto, se ainda existirem;
5. confirmar se existe webhook cadastrado no painel Stripe apontando para ambientes do projeto;
6. definir janela e estratégia para remoção de schema/tipos legados Stripe.

# 10. Checklist de validação

- [x] `stripe-webhook` deixou de ser operacional no código do repositório.
- [x] `create-checkout-session` deixou de ser operacional no código do repositório.
- [x] `create-connect-account` deixou de ser operacional no código do repositório.
- [x] `supabase/config.toml` não continua publicando Stripe como ativo.
- [x] fluxo atual Asaas permaneceu sem alteração de código nesta etapa.
- [x] vendas históricas continuam consultáveis por preservação de schema/tipos.
- [x] logs históricos continuam acessíveis por preservação de schema/tipos.
- [x] nenhum fluxo atual do frontend auditado depende dessas functions.
- [ ] não houve regressão em produção/sandbox remoto — **pendente de validação operacional após deploy**, pois esta entrega foi validada estaticamente no repositório.
