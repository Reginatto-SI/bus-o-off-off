# Diagnóstico — Falha ao gerar fatura Asaas no checkout público

## 1. Resumo executivo
A Edge Function `create-asaas-payment` publicada em produção **ainda envia `callback.successUrl` + `autoRedirect: true`** no payload do `POST /payments`, apesar de o código-fonte local já ter sido corrigido para não enviar. O Asaas rejeita a criação da cobrança com `invalid_object` — "Não há nenhum domínio configurado em sua conta. Cadastre um site em Minha Conta na aba Informações." — porque a conta Asaas da empresa vendedora não tem o domínio SmartBus cadastrado como site permitido para redirect.

## 2. Causa raiz provável
**Hipótese A confirmada**: o build/deploy da última versão de `create-asaas-payment` não subiu para produção. O código local (linhas 1758–1768) monta o payload **sem** `callback`, mas os logs de integração em `sale_integration_logs` mostram claramente o `callback.successUrl` sendo enviado em vendas de 02/07 (últimas ocorrências às 21:33Z). Ou seja: runtime ≠ repositório.

## 3. Evidências encontradas em produção/runtime
- Consulta em `sale_integration_logs` (event_type=`create_payment`) para as últimas 5 falhas retornou `response_json`:
  `{"errors":[{"code":"invalid_object","description":"Não há nenhum domínio configurado em sua conta. Cadastre um site em Minha Conta na aba Informações."}]}`
- Duas empresas afetadas: `f860269d-…` e `02a7485c-…` — sinal de que **não é config isolada de uma empresa**, é comportamento do payload.
- Erro é retornado pelo Asaas antes de qualquer `asaas_payment_id` ser persistido.

## 4. Payload real enviado ao Asaas (log da venda `4c7ccdba…`)
```json
{
  "split":[{"walletId":"54b2bcad-…","percentualValue":4.76}],
  "value":189,
  "dueDate":"2026-07-03",
  "callback":{"successUrl":"https://www.smartbusbr.com.br/confirmacao/4c7ccdba-…?retorno=asaas","autoRedirect":true},
  "customer":"cus_000180490547",
  "billingType":"PIX",
  "description":"SmartBus | … ",
  "externalReference":"4c7ccdba-…"
}
```
Confirmado: **o payload em produção ainda tem `callback.successUrl` + `autoRedirect`**.

## 5. Resposta real do Asaas
HTTP não-ok, body `{"errors":[{"code":"invalid_object","description":"Não há nenhum domínio configurado em sua conta…"}]}`. O bloco `if (!paymentRes.ok)` já propaga a descrição para o frontend em `toast.error`.

## 6. Empresa, ambiente e conta Asaas usada
- Ocorre em ≥ 2 empresas distintas com wallets diferentes.
- Ambiente = produção (URL `www.smartbusbr.com.br`).
- Chave e wallet usadas pertencem à empresa dona da venda (não à SmartBus).

## 7. Verificação de callback/URL/domínio
- Fonte-única no repositório: `supabase/functions/create-asaas-payment/index.ts`. Já limpa: sem `callback`, sem `successUrl`, sem `autoRedirect` no `paymentPayload`.
- Log de produção contradiz o código-fonte → deploy defasado.

## 8. Verificação de deploy da Edge Function
Os logs de request/erro em `sale_integration_logs` provam que a build em runtime é anterior à remoção do `callback`. Necessário forçar redeploy.

## 9. Verificação de sandbox/produção
Correto: `payment_environment=production`, chamando `api.asaas.com/v3` com chave produção. Sem mismatch.

## 10. Verificação de split/onboarding
Split enviado corretamente (walletId da SmartBus, `percentualValue`). Onboarding das empresas não é a causa — o Asaas está rejeitando por causa do `callback.successUrl` cujo domínio precisa estar cadastrado em "Minha Conta" da subconta que emite a cobrança. Removido o callback, essa exigência desaparece.

## 11. Hipóteses analisadas
| Hipótese | Status | Evidência | Próximo passo |
|---|---|---|---|
| A. Deploy antigo da Edge Function | **Confirmada** | Payload real em log contém `callback.successUrl` que não existe mais no código | Redeploy |
| B. Asaas exige domínio mesmo sem callback | Descartada nesta ocorrência | Erro é sobre "domínio configurado" — mensagem específica do validador de callback URL | — |
| C. Split inválido | Descartada | Split idêntico ao das vendas OK anteriores | — |
| D. Chave/ambiente cruzado | Descartada | Ambiente produção com chave produção | — |
| E. Cache/build frontend | Descartada | Frontend não envia URL diretamente ao Asaas | — |

## 12. Respostas objetivas
1. Não — a função **publicada** ainda envia `callback.successUrl`. O arquivo local não.
2. Sim, contém `callback.successUrl` + `autoRedirect`.
3. Sim, no `POST /payments`.
4. Body: `{"errors":[{"code":"invalid_object","description":"Não há nenhum domínio…"}]}`.
5. Sim, antes de salvar `asaas_payment_id`.
6. Sim, Pix e cartão pelo mesmo ponto (montagem do payload é comum).
7. Em todas que passam pelo checkout público após a mudança.
8. Conta Asaas da empresa (correto).
9. Sim.
10. Sim (não é a causa).
11. Não.
12. Sim — exigência do Asaas quando `callback.successUrl` aponta para domínio não cadastrado.
13. **Sim — causa raiz.**
14. Não.
15. `asaasInvoiceUrl.withAsaasAutoRedirect` ainda existe, mas só é usada em URL do lado do cliente para abrir a fatura (não altera payload de criação).
16. Deploy defasado de `create-asaas-payment`.
17. Redeploy da função (correção mínima).
18. Split, webhook, verify, passagem/PDF, RLS, schema, `asaasInvoiceUrl` (usado fora do payload).

## 13. Correção mínima recomendada
1. **Redeploy imediato de `create-asaas-payment`** para publicar a versão sem `callback`.
2. Após deploy, validar em `sale_integration_logs` que novas requests não contêm mais o campo `callback`.
3. Fazer 1 venda-piloto Pix e 1 cartão para confirmar sucesso.

Nenhuma alteração de código é necessária — apenas deploy.

## 14. Riscos da correção
- Nenhum novo. O código-alvo já está mergeado e testado. O retorno pós-pagamento em PWA continua sendo tratado pelo caminho `window.location.assign` + `retorno=asaas` no `Confirmation.tsx` (não depende do callback do Asaas).

## 15. O que NÃO deve ser alterado
- Split, wallets, motor de taxa, webhook, `verify-payment-status`, finalização de venda, geração de ticket/PDF, RLS, schema, `asaasInvoiceUrl.ts`, `Confirmation.tsx`.

## 16. Logs e arquivos analisados
- Consulta em `public.sale_integration_logs` (últimos erros `create_payment`).
- `supabase/functions/create-asaas-payment/index.ts` (linhas 1744–1820).
- `src/pages/public/Checkout.tsx` (linhas 1760–1780).
- `src/lib/asaasInvoiceUrl.ts` (uso pós-criação).

---

## Ação proposta (build mode)
Executar `deploy_edge_functions(["create-asaas-payment"])` e conferir 1 novo log de `create_payment` em `sale_integration_logs` para confirmar que `payload_json` não contém mais `callback`.
