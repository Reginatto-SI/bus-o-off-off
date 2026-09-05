# PagBank — Operação em Sandbox (runbook)

> Escopo: primeira jornada funcional PIX via API oficial Order. Produção bloqueada por código
> (`PAGBANK_ALLOWED_ENVIRONMENTS = ["sandbox"]`) e por constraint no banco.

## 1. Secrets do backend (nunca no código)

| Secret | Uso | Obrigatório para |
|---|---|---|
| `PAGBANK_TOKEN_ENCRYPTION_KEY` | Cifra tokens por conexão (AES-GCM) | tudo (já configurado) |
| `PAGBANK_CLIENT_ID_SANDBOX` / `PAGBANK_CLIENT_SECRET_SANDBOX` | Connect Authorization (OAuth) e refresh | botão "Autorizar no PagBank" |
| `PAGBANK_MARKETPLACE_ACCOUNT_ID_SANDBOX` | Conta recebedora da parcela Marketplace no split | qualquer venda com taxa > 0 |
| `PAGBANK_WEBHOOK_TOKEN_SANDBOX` | Fallback de validação `x-authenticity-token` quando a conexão não tem token próprio | webhook |
| `PAGBANK_ADMIN_RETURN_URL` (opcional) | URL de retorno pós-OAuth; padrão `https://www.smartbus.com.br/admin/empresa` | Connect |

Sem `PAGBANK_MARKETPLACE_ACCOUNT_ID_SANDBOX`, a criação do PIX falha com
`pagbank_split_recipient_missing` (comportamento intencional: nunca degradar split).

## 2. URLs

- API Sandbox: `https://sandbox.api.pagseguro.com`
- Autorização Connect Sandbox: `https://connect.sandbox.pagbank.com.br/oauth2/authorize`
- Webhook (cadastrar/aceitar no PagBank): `${SUPABASE_URL}/functions/v1/pagbank-webhook`
  (também enviado em `notification_urls` a cada Order)
- Redirect URI OAuth: `${SUPABASE_URL}/functions/v1/pagbank-connect-callback`

## 3. Habilitar uma empresa (admin → Empresa → Pagamentos)

1. Ambiente de pagamento da empresa deve ser **Sandbox**.
2. Conectar a conta PagBank por **uma** das vias:
   - *Autorizar no PagBank* (Connect OAuth) — requer client id/secret;
   - *Token Sandbox manual* — cole token + `account_id` (recebedor). O token é validado
     (`GET /public-keys`) e salvo cifrado. Nunca é exibido novamente.
3. Com a conexão `connected` e `PIX pronto`, selecionar **PagBank** como gateway das novas vendas.
4. Sócio global e representante elegíveis precisam de `pagbank_account_id_sandbox` preenchido
   (`socios_split`, `representatives`), senão a cobrança é bloqueada.

Vendas antigas permanecem Asaas; a troca afeta apenas vendas criadas depois. Desvincular a
conta volta a empresa para Asaas automaticamente.

## 4. Fluxo de uma venda PagBank

```text
Checkout público → insert sales (trigger congela gateway/ambiente/conexão/conta)
  → create-pagbank-payment (payment_attempts pending → POST /orders com idempotency key)
  → /confirmacao/:id?retorno=pagbank exibe QR/copia-e-cola + expiração (30 min)
  → pagbank-webhook (assinatura sobre corpo bruto → dedup → GET /orders → PAID?)
  → finalizeConfirmedPayment (comum ao Asaas; gateway='pagbank' não toca asaas_*)
  ↳ fallback: verify-payment-status (polling da confirmação) faz a mesma consulta
```

## 5. Diagnóstico

- `payment_attempts`: uma linha por venda/operação; `state` (`pending|succeeded|failed|indeterminate`),
  `external_order_id`, `external_status_raw`, `error_code`.
- `payment_webhook_events`: dedup por (gateway, ambiente, conta, `charge:STATUS`), `duplicate_count`,
  `processing_result`.
- `sale_integration_logs` com `provider='pagbank'`; `sale_logs` com `source=create-pagbank-payment|pagbank-webhook`.
- Erros públicos: `pagbank_indeterminate` (timeout após envio — nunca recria; confirmação recupera por
  `reference_id`), `pagbank_idempotency_conflict` (requisição concorrente), `pagbank_auth_failed`,
  `pagbank_split_recipient_missing`, `gateway_mismatch`.

## 6. Desativação rápida

- Por empresa: selecionar Asaas (ou desvincular) na aba Pagamentos.
- Global: nenhuma empresa com `payment_gateway='pagbank'` ⇒ nenhum tráfego PagBank. As Edge Functions
  PagBank recusam vendas cujo gateway congelado não seja `pagbank`.

## 7. Itens que exigem homologação com PagBank antes de Produção

- formato de split em pedido PIX (`qr_codes[].splits` usado; `charges[].splits` também documentado);
- resposta do `/oauth2/token` conter `account_id` (sem ele, PIX fica indisponível na conexão OAuth);
- `GET /orders?reference_id=` como recuperação após timeout;
- `GET /public-keys` como probe de token;
- token de assinatura de webhook em cenário Connect multiempresa;
- primário do split, tarifas e liquidação; refund/chargeback fora do escopo.
