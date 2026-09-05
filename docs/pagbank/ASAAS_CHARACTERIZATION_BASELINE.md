# Baseline de caracterização do Asaas

> PR 1 da iniciativa PagBank. Escopo exclusivo de testes do comportamento Asaas
> atual; nenhuma integração PagBank ou alteração de produção foi realizada.

## Resultado operacional

| Estado | Área | Evidência e limite |
|---|---|---|
| **COBERTO** | Motor financeiro e split | Piso total de R$ 5, teto de R$ 25 por item, múltiplos itens, quatro cenários oficiais, soma exata em centavos e resíduo determinístico destinado à plataforma. |
| **COBERTO** | Snapshot de checkout | Tipos de passagem, descontos, múltiplos passageiros, centavos e igualdade entre bruto, passageiros e taxas no helper compartilhado. |
| **COBERTO** | Contexto financeiro Asaas | Precedência `venda → empresa → request`, ambiente persistido, isolamento de credenciais e falha fechada sem contexto no resolvedor compartilhado. Hostname não participa dessa decisão. |
| **COBERTO** | Token de webhook | Token correto, ausente, inválido e do ambiente oposto no helper compartilhado, sem expor o segredo no resultado. |
| **COBERTO** | Continuidade de split | Recebedores elegíveis, valores fixos, wallet do emissor, degradação e resolução multiempresa do representante nos helpers existentes. |
| **PARCIALMENTE COBERTO** | Criação e retry | Os testes existentes caracterizam guarda por cobrança local, correlação por `externalReference` e consulta após resultado ambíguo, mas parte dessa prova ainda é contrato estático da Edge Function. |
| **PARCIALMENTE COBERTO** | Webhook e fallback | Autenticação isolada foi exercitada como unidade; as funções monolíticas de webhook/consulta e sua convergência não são executadas pelo Vitest. |
| **PARCIALMENTE COBERTO** | Finalização, tickets e ledger | O núcleo compartilhado existe e é usado pelos três chamadores, mas idempotência concorrente, ticket único, locks e RPC de comissão não têm teste executável no runner atual. |
| **PARCIALMENTE COBERTO** | Multiempresa e vendas antigas | Contexto da venda e credenciais por ambiente foram exercitados; filtros completos de tenant em create/webhook/verify e relatórios não foram executados. |
| **NÃO COBERTO** | Fluxo Edge end-to-end | Nenhum teste deste PR sobe Supabase, chama Asaas ou simula create → webhook/verify → ticket. Não há alegação de cobertura E2E. |
| **NÃO COBERTO** | Onboarding legado por hostname | A heurística conhecida de domínio não foi transformada em contrato desejado; `smartbus.com.br` ainda pode cair em Sandbox no fallback legado. |
| **BLOQUEADO POR SEAM** | Create/webhook/verify/reconcile monolíticos | Handlers Deno iniciam servidor, leem ambiente global e constroem clientes internamente; faltam entradas importáveis para transporte e persistência. |
| **BLOQUEADO POR SEAM** | Concorrência de finalização | `payment-finalization.ts` importa Supabase por URL Deno e depende do query builder/RPC. O menor seam futuro é injetar uma interface estreita de repositório/efeitos, sem duplicar a rotina. |

## Testes aproveitados

- `feeCalculator.test.ts`, `platformFeeDistributionContract.test.ts` e
  `manualPlatformFeeSplitContract.test.ts`: taxa, divisão e cobrança manual.
- `checkoutFinancialIntegrity.test.ts`: preço por passageiro e snapshot.
- `asaasSplitContinuity.test.ts`: resolução/degradação do split e recuperação por
  `externalReference`.
- `runtimePaymentEnvironment.test.ts`, `asaasIntegrationStatus.test.ts` e
  `asaasInvoiceUrl.test.ts`: ambiente de UI, readiness e abertura da fatura.

## Testes criados ou ampliados

- Novo `asaasPaymentContext.test.ts`: dez casos determinísticos para ambiente,
  credencial e autenticação do webhook.
- Quatro casos de distribuição de 499 centavos, cobrindo todos os cenários e o
  destino do resíduo.
- Um caso de snapshot com dois passageiros e valores fracionários.
- Duas expectativas antigas de status Asaas foram alinhadas ao contrato real:
  conexão requer API key + wallet; `account_id` e onboarding não completam nem
  invalidam, isoladamente, essa conexão operacional.

## Lacunas e riscos abertos

1. A suíte inicial tinha duas expectativas contraditórias sobre readiness Asaas;
   ambas falhavam contra o helper atual e foram corrigidas nos testes.
2. Não há prova automatizada executável de deduplicação concorrente entre webhook,
   polling e reconciliação, nem de exatamente um ticket/ledger.
3. A recuperação por `externalReference` reduz retry cego, mas não substitui uma
   chave externa durável de idempotência para o intervalo de timeout.
4. Autenticar o token no helper não prova correlação de tenant, ambiente, valor,
   referência ou monotonicidade do handler completo.
5. Falhas acessórias de log/notificação e regressão por evento atrasado continuam
   sem caracterização executável.

## Comandos e resultados

- `npm ci`: não executou porque `package-lock.json` está fora de sincronia com
  `package.json`; nenhum lockfile foi alterado.
- `bun install --frozen-lockfile`: dependências instaladas sem alterar lockfiles.
- Baseline anterior, `npm test -- --reporter=verbose`: **189 aprovados e 2
  reprovados** (expectativas conflitantes em status Asaas).
- Teste de contexto isolado: **10 aprovados** em um arquivo.
- Suíte final, `npm test -- --reporter=default`: **206 aprovados em 22 arquivos**.
- Typecheck, `npx tsc --noEmit`: verde.
- Lint, `npm run lint`: reprovou por dívida anterior fora do escopo (**223 erros e
  63 avisos**, incluindo produção e Edge Functions não alteradas); os arquivos de
  teste tocados não introduzem diagnóstico novo.
- `git diff --check`, `git diff --name-only` e hashes dos lockfiles: executados
  antes do commit; somente testes e os dois documentos permitidos compõem o diff.

## Próximo PR recomendado

Criar somente o seam aditivo de testabilidade para finalização: isolar a porta
estreita de persistência/efeitos de `finalizeConfirmedPayment` e manter o adapter
Supabase atual. Então exercitar concorrência, ticket/ledger únicos, locks e falhas
acessórias antes de qualquer migration ou dispatcher multigateway.

**Payment Link e checkout hospedado não fazem parte do escopo.**
