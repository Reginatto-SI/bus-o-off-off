## Diagnóstico

O evento `811b1c54-...` pertence à empresa **BUSÃO OFF OFF** (`3838e687-...`).

Olhando `sale_integration_logs` desta empresa (produção):

```
2026-06-13 17:57:29  failed  HTTP 401  Resposta vazia ao buscar cliente no Asaas
2026-06-13 17:57:07  failed  HTTP 401  Resposta vazia ao buscar cliente no Asaas
2026-06-13 17:58:47  warning HTTP 401  Fallback manual não conseguiu consultar cobrança da taxa
```

A causa real é **HTTP 401 do Asaas** na chamada `GET /customers?cpfCnpj=...` feita com a `asaas_api_key_production` da empresa. A `safeJson` devolve `null` quando o body vem vazio (caso típico de 401 do Asaas), por isso o sistema cai no caminho `customer_search_empty_response` e mostra a mensagem genérica "Resposta vazia ao buscar cliente no Asaas".

Confirmações:
- A empresa tem `asaas_onboarding_complete_production = true` e chave de 166 chars cadastrada, mas o Asaas a rejeita (401).
- A cobrança da taxa da plataforma funciona porque ela usa a chave **master** da plataforma, não a da empresa.
- Conclusão: a chave produção do Asaas da empresa está **inválida/revogada/regerada no painel Asaas** e precisa ser reconectada. Não há como o Lovable "corrigir" a chave automaticamente — é uma ação obrigatória do administrador da empresa.

## O que será ajustado no código

Mudanças mínimas, apenas para tornar o erro claro e acionável (sem alterar o fluxo de venda em si):

### 1. `supabase/functions/create-asaas-payment/index.ts`

- Detectar HTTP 401/403 da busca de cliente **antes** do retry e do caminho de "resposta vazia":
  - novo `error_code = "company_asaas_unauthorized"`
  - status HTTP `502` (erro de integração externa)
  - mensagem: `"A integração Asaas desta empresa está com a chave de API inválida ou revogada. Reconecte o Asaas em Configurações da Empresa > Asaas."`
  - log em `sale_integration_logs` com `incident_code = "COMPANY_ASAAS_UNAUTHORIZED"` e `http_status = 401`.
- Aplicar a mesma detecção no `POST /customers` (criação) quando vier 401/403.
- Não fazer retry em 401/403 (não adianta tentar de novo).
- Manter o fluxo atual de rollback (limpar venda/locks/passageiros) já existente.

### 2. `src/pages/public/Checkout.tsx`

- Mapear `error_code === "company_asaas_unauthorized"` para uma mensagem amigável ao comprador, ex.:
  - `"Pagamentos desta empresa estão temporariamente indisponíveis. Entre em contato com o organizador do evento."`
- Mesmo rollback de venda/locks/passageiros já usado para outros erros de integração.

### 3. Sem alterações em

- webhook Asaas
- `verify-asaas-payment`
- split / taxa da plataforma (continua funcionando com a chave master)
- frontend de Configurações da Empresa (já existe wizard de reconexão Asaas)

## Ação necessária do administrador da empresa BUSÃO OFF OFF

Após o deploy:

1. Entrar em `/admin/empresa` → aba Asaas.
2. Reconectar a conta de produção (gerar nova API key no painel Asaas e colar no wizard) — o wizard já valida a chave antes de salvar.
3. Repetir a compra do evento `Pedro Leopoldo Rodeio Show`.

## Testes manuais

- [ ] Forçar venda com chave inválida → retornar `company_asaas_unauthorized` 502, sem retry, com rollback completo no checkout.
- [ ] Forçar venda com chave válida → fluxo normal de cobrança Asaas inalterado.
- [ ] Conferir `sale_integration_logs`: 401 deixa de aparecer como `CUSTOMER_SEARCH_EMPTY_RESPONSE` e passa a `COMPANY_ASAAS_UNAUTHORIZED`.
- [ ] Confirmar que a taxa da plataforma (chave master) continua funcionando independentemente.

## Relatório objetivo (a entregar após implementar)

- O que estava quebrado: chave Asaas produção da empresa BUSÃO OFF OFF retorna 401, e o sistema reportava "Resposta vazia ao buscar cliente no Asaas".
- O que será corrigido: detecção explícita de 401/403, novo `error_code`, mensagem clara para operador e comprador, sem retry inútil.
- Telas ajustadas: edge function `create-asaas-payment` e `src/pages/public/Checkout.tsx`.
- Causa raiz não-código: chave Asaas da empresa precisa ser reconectada pelo administrador.
