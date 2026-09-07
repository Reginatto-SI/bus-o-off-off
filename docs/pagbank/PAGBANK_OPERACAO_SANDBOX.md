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

1. O cadastro da conexão é sempre **Sandbox**, independentemente do ambiente da sessão.
   Salvar token ou iniciar autorização Sandbox não altera gateway, ambiente da empresa ou vendas.
   Para ativar PagBank nas novas vendas, a sessão deve ter ambiente efetivo **Sandbox**.
2. Conectar a conta PagBank por **uma** das vias:
   - *Autorizar no PagBank* (Connect OAuth) — requer client id/secret;
   - *Token Sandbox manual* — cole token + `account_id` (recebedor). O token é validado
     (`GET /public-keys/card`) e salvo cifrado. Nunca é exibido novamente.
     O ID deve começar com `ACCO_`: não é e-mail, token ou conta Marketplace.
     A validação de formato não comprova titularidade: use o ID da mesma conta do token.
     Essa via não exige Client ID/Client Secret OAuth nem o secret Marketplace para salvar.
     A chave de criptografia do backend continua obrigatória.
3. Com a conexão `connected` e corrente, selecionar **PagBank** como gateway das novas vendas.
   `pix_ready`/`split_ready` são **evidência** de capacidade já comprovada por cobrança real,
   nunca pré-requisito da primeira cobrança (isso criaria bloqueio circular).
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

## 8. Comprovação de capacidades (não é mais presumida)

- Salvar o token Sandbox prova **apenas autenticação** (`GET /public-keys/card`).
  Não prova PIX, não prova split.
- `pix_ready` e `split_ready` da conexão passam a `true` somente após a primeira
  cobrança real aceita pelo PagBank, com o split conferido na resposta.
- Se a resposta do PagBank não trouxer os mesmos recebedores e valores enviados,
  a cobrança é marcada como falha (`pagbank_split_not_confirmed`) e não é
  entregue ao comprador. Divisão não confirmada nunca vira cobrança comum.
- Order sem código PIX na resposta gera `pagbank_pix_artifact_missing` (sem QR
  falso na tela do comprador).

## 9. Rotação de token da mesma conta

Salvar um novo token Sandbox para o **mesmo** `account_id` mantém a conexão
anterior consultável (`superseded_by_rotation`), preservando consulta e
reconciliação de vendas antigas. Trocar de conta cria identidade lógica nova e
revoga a anterior; vendas antigas continuam vinculadas à conexão original.

## 10. Cartões de teste (fase futura)

Cartão ainda **não** está implementado. Quando entrar em homologação, usar
exclusivamente os dados de teste publicados pelo PagBank em
<https://developer.pagbank.com.br/docs/cartoes-de-teste>. Nunca registrar
números reais, nem valores de teste neste repositório.

## 11. Dados ainda necessários (nomes, nunca valores)

1. Token Sandbox rotacionado (qualquer credencial já compartilhada fora do cofre
   deve ser considerada exposta e substituída).
2. `account_id` Sandbox da empresa vendedora.
3. `account_id` Sandbox da conta Marketplace (SmartBus).
4. `account_id` Sandbox do sócio global e dos representantes que participarão.
5. Token de autenticação do webhook configurado na conta Sandbox.
6. `client_id`, `client_secret` e redirect URI da aplicação Connect — somente se optar por OAuth; dispensados para cadastrar token manual.
7. Confirmação, pelo PagBank, de que PIX e split estão habilitados na conta.

## 12. Order externo já criado (nunca duplicar nem perder a venda)

- Se a criação falhar com `pagbank_indeterminate`, `pagbank_idempotency_conflict`,
  `pagbank_split_not_confirmed`, `pagbank_pix_artifact_missing` ou
  `pagbank_order_needs_reconciliation`, a venda, os passageiros, os bloqueios de
  assento e a tentativa são **preservados**. O comprador vai para a confirmação,
  que consulta o Order por `reference_id`.
- Uma tentativa que já registrou `external_order_id` nunca autoriza um segundo
  Order: nova chamada devolve `pagbank_order_needs_reconciliation`.
- Rollback da venda só ocorre quando a rejeição é comprovadamente anterior à
  criação (ex.: validação recusada, autenticação inválida) e sem `order_id`.
- Reconciliação/cancelamento do Order externo é operação manual no PagBank; o
  código não cancela cobrança automaticamente.

## Ambiente efetivo (política central)

Fonte única: `src/lib/paymentEnvironmentPolicy.ts` (frontend) e
`supabase/functions/_shared/payment-environment-policy.ts` (backend). Nenhuma
outra lista de domínios deve existir.

Camadas, nesta ordem:

1. **Venda existente** — `sales.payment_environment` é imutável. Consulta,
   webhook, reconciliação e finalização sempre usam o ambiente da venda. Troca
   de domínio, preview ou configuração da empresa não altera vendas criadas.
2. **Empresa** — `companies.payment_environment` é a intenção configurada.
3. **Origem** — só um domínio oficial de Produção mantém Produção:
   `smartbus.com.br`, `www.smartbus.com.br`, `smartbusbr.com.br`,
   `www.smartbusbr.com.br`, `smartbusbr.lovable.app`. Preview do Lovable,
   editor, `localhost` e qualquer origem desconhecida **rebaixam** o ambiente
   efetivo para Sandbox. A origem nunca promove Produção, e nenhum hostname ou
   parâmetro enviado pelo cliente autoriza Produção.

No preview, o selo `Sandbox` aparece no cabeçalho e o token Sandbox PagBank
pode ser cadastrado e validado mesmo com a empresa configurada como Produção.
PagBank em Produção continua bloqueado nesta fase.

## Bloqueio conhecido: aplicativo Android / WebView

`capacitor.config.ts` aponta `server.url` para um endereço
`*.lovableproject.com`, que a política classifica como desenvolvimento. Logo, o
aplicativo nativo publicado operaria em Sandbox. Não foi criada exceção nativa,
porque não existe hoje um sinal confiável (não falsificável pelo cliente) que
identifique um build nativo de Produção. Saída segura, em tarefa própria:
apontar `server.url` para o domínio oficial de Produção antes de liberar
pagamentos de Produção no aplicativo.
