# Ambiente de pagamento: preview e editor nunca podem operar em Produção

## O que foi confirmado no código

- `src/hooks/use-runtime-payment-environment.ts` decide o ambiente **apenas** por `companies.payment_environment`. Nenhuma consideração de origem/preview.
- `src/components/layout/AdminHeader.tsx` (linhas 46 e 354) mostra o selo `Sandbox` a partir desse hook — por isso uma empresa configurada como Produção aparece como Produção também dentro do preview.
- `src/pages/admin/Company.tsx` (linhas 216, 2255-2498) usa o mesmo hook para rótulos, verificação Asaas e limpeza de credenciais.
- `supabase/functions/pagbank-connection/index.ts` (linhas 95-96) recusa salvar token Sandbox quando `company.payment_environment !== 'sandbox'` — é isso que bloqueia o cadastro no preview.
- `supabase/functions/_shared/payment-context-resolver.ts` (linhas 223-259) resolve venda → empresa → ambiente explícito, sem origem, e falha explicitamente quando nada resolve.
- `supabase/functions/_shared/runtime-env.ts` mantém uma allowlist legada com apenas `smartbusbr.com.br` e `www.smartbusbr.com.br` (não inclui os domínios oficiais atuais `smartbus.com.br`). Continua consumida por `get-runtime-payment-environment`, que hoje não alimenta mais o cabeçalho.
- `capacitor.config.ts` aponta `server.url` para `https://a005d492-...lovableproject.com`. Ou seja, o aplicativo nativo carrega uma origem de preview.

Causa raiz: o ambiente efetivo passou a ser exclusivamente configuração da empresa, e a origem (preview, editor, localhost) deixou de poder rebaixar esse ambiente.

## Política final proposta

Camadas, na ordem:

1. Venda existente: `sales.payment_environment` manda sempre; nunca é recalculado.
2. Empresa: `companies.payment_environment` é a intenção configurada.
3. Origem: só uma origem oficialmente reconhecida pode **manter** Produção. Qualquer outra origem (preview Lovable, `lovable.dev`, `lovableproject.com`, localhost, desconhecida) **rebaixa** o ambiente efetivo para Sandbox.

A origem só pode rebaixar, nunca promover — assim nenhum hostname enviado pelo cliente autoriza Produção.

Origens oficiais de Produção: `smartbus.com.br`, `www.smartbus.com.br`, `smartbusbr.com.br`, `www.smartbusbr.com.br`, `smartbusbr.lovable.app` (URL publicada atual).

## Implementação

### Módulo central compartilhado (sem listas duplicadas)

- Novo `src/lib/paymentEnvironmentPolicy.ts`: `classifyOrigin(host)` → `official_production | development | unknown` e `resolveEffectivePaymentEnvironment({ configured, originClass })`.
- Novo `supabase/functions/_shared/payment-environment-policy.ts` com a mesma tabela de hosts e a mesma função, usada pelas edge functions (a origem no backend vem de `Origin`/`Referer` da requisição — nunca do `host` do Edge Runtime).
- `supabase/functions/_shared/runtime-env.ts`: `resolveEnvironmentFromHost` passa a delegar à política central (corrigindo a lista antiga de domínios); os helpers de URL/segredo Asaas permanecem intactos.

### Frontend

- `use-runtime-payment-environment.ts` passa a devolver `configuredEnvironment` (empresa) e `environment` (efetivo, já rebaixado pela origem), mais `isDowngradedByOrigin`.
- Cabeçalho e tela Pagamentos passam a exibir o ambiente efetivo; quando houver rebaixamento, um texto curto explica que a empresa está configurada como Produção mas a sessão atual opera em Sandbox.
- Checkout e demais telas que gravam `payment_environment` na venda passam a gravar o ambiente efetivo (linhas 1280, 1566, 1875 de `Checkout.tsx` e `ServiceSales.tsx`), preservando a imutabilidade após criação.

### Backend

- `payment-context-resolver.ts`: mantém `sale` como primeira fonte; para contexto sem venda, aplica o rebaixamento por origem sobre o ambiente da empresa. Sem venda, sem empresa e sem ambiente explícito continua falhando explicitamente.
- `pagbank-connection`: o gate deixa de comparar com `company.payment_environment` cru e passa a usar o ambiente efetivo — no preview, o token Sandbox pode ser cadastrado e validado; Produção PagBank continua bloqueada por `PAGBANK_ALLOWED_ENVIRONMENTS = ["sandbox"]`.
- `create-asaas-payment`, `create-pagbank-payment`, webhooks, consulta e reconciliação continuam lendo o ambiente da venda — nenhuma mudança de comportamento nesses caminhos.
- `get-runtime-payment-environment` permanece disponível apenas como apoio de suporte, já com a lista corrigida.

Nenhuma migration é necessária: nada de novo precisa ser persistido.

## Android/WebView — bloqueio explícito

O aplicativo nativo carrega hoje `lovableproject.com`, que a nova política classifica como origem de desenvolvimento. Aplicar a regra sem ressalva colocaria um app publicado em Sandbox.

Nesta entrega, portanto:

- não será criada nenhuma exceção nativa baseada em header ou parâmetro do cliente (isso seria promoção de ambiente pelo cliente, proibida);
- o comportamento nativo será documentado como bloqueio pendente: enquanto `capacitor.config.ts` apontar para a URL de preview, o app deve ser tratado como Sandbox;
- a saída segura recomendada (a decidir em tarefa própria) é apontar `server.url` para o domínio oficial de Produção antes de publicar uma build de Produção.

## Testes

Novo `src/test/paymentEnvironmentPolicy.test.ts` e testes de backend cobrindo:

1. `preview--*.lovable.app` → Sandbox; 2. `lovable.dev` e demais previews → Sandbox; 3. `localhost` → Sandbox; 4. `smartbus.com.br` → Produção; 5. `www.smartbus.com.br` → Produção; 6. origem desconhecida → Sandbox; 7. empresa Sandbox nunca é promovida a Produção por origem oficial; 8. venda existente mantém `sales.payment_environment` mesmo em origem diferente; 9. gate PagBank aceita Sandbox no preview e recusa Produção; 10. resolver sem venda/empresa/ambiente continua falhando; 11. testes de ambiente e Asaas existentes continuam verdes.

Verificação manual no preview em `/admin/empresa?tab=pagamentos`: selo `Sandbox` no cabeçalho, tela indicando Sandbox efetivo e campo de token Sandbox PagBank liberado.

## Documentação

- `docs/pagbank/PAGBANK_OPERACAO_SANDBOX.md`: como o preview opera em Sandbox e como cadastrar o token nesse contexto.
- `docs/pagbank/PAGBANK_IMPLEMENTATION.md`: checkpoint da sessão.
- Correção da lista antiga de domínios de Produção onde ela aparecer.

## Fora de escopo

Regras financeiras, split, comissões, sócio, representante, idempotência, webhook, confirmação e finalização permanecem inalterados. Vendas existentes não são tocadas.
