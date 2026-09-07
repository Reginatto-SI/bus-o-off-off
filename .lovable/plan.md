# PagBank — Alternativa A: estabilizar a primeira jornada PIX antes do cartão

## 1. Decisão

**Alternativa A.** Não iniciar cartão agora. Os problemas encontrados estão na camada
**comum** (split, validação de conta, regra financeira, identidade da conexão, webhook) e
seriam herdados integralmente pelo cartão, dobrando o retrabalho e o risco financeiro.

Justificativa técnica:

- **Split**: o formato usado hoje não corresponde ao exemplo oficial. Cartão usaria o mesmo
  módulo; corrigir depois significaria refazer PIX e cartão.
- **Risco financeiro**: existe hoje a possibilidade de o SmartBus criar cobrança esperando
  divisão e o PagBank ignorar a divisão — dinheiro inteiro na conta da empresa, sem taxa.
- **Regra financeira**: o comportamento atual bloqueia venda em cenário que o PRD manda
  seguir vendendo. Isso é desvio de regra de produto, não limitação de gateway.
- **Idempotência/webhook**: falha temporária de consulta hoje pode deixar a venda paga sem
  ticket, sem chance de reprocessamento. Cartão amplificaria o problema.
- **Asaas**: nenhuma dessas correções toca o Asaas; adiar cartão evita mexer em finalização
  comum sob pressão.

## 2. Problemas comprovados (lidos no código e na documentação oficial hoje)

1. **Split em local não comprovado.** `create-pagbank-payment` envia `qr_codes[0].splits`.
   O exemplo oficial "Pedido com divisão de pagamento com PIX"
   (`developer.pagbank.com.br/reference/pedido-com-divisao-de-pagamento-com-pix`, verificado
   em 2026-09-07) usa `charges[].payment_method.type = "PIX"` + `charges[].splits`.
2. **`pix_ready` falso-positivo.** Em `pagbank-connection` (`save_sandbox_token`) o probe é
   `GET /public-keys` e `pix_ready` é gravado como `true` incondicionalmente. Isso não prova
   conta, PIX nem split.
3. **Desvio da regra financeira oficial.** `split-recipients` + `create-pagbank-payment`
   bloqueiam a cobrança (`pagbank_split_recipient_missing`) quando sócio ou representante
   elegível não tem conta PagBank no ambiente. O PRD manda tratar isso como participante
   ausente e redistribuir conforme os quatro cenários.
4. **Vendas antigas ficam inconsultáveis após reconexão.** `save_sandbox_token` e
   `disconnect` marcam a conexão anterior como `revoked`; `resolveCredentialFromConnection`
   exige `status = 'connected'`. Venda antiga vinculada à conexão A perde consulta e
   reconciliação, inclusive quando foi só rotação de token da mesma conta.
5. **Webhook: dedup antes da confirmação.** `pagbank-webhook` insere o evento e só depois
   consulta o Order. Se a consulta falhar, responde 200 com resultado de erro; a reentrega
   do PagBank colide no índice único e é descartada como duplicata — evento pago pode nunca
   virar ticket.

## 3. O que depende do Sandbox real (não é corrigível por código agora)

- confirmação de que o split é aceito na cobrança PIX e refletido na resposta;
- `account_id` real da empresa e do Marketplace;
- retorno de `/oauth2/token` conter `account_id`;
- recuperação por `reference_id` após timeout;
- token que assina o webhook em cenário Connect multiempresa;
- tarifas, recebedor primário e liquidação.

## 4. Correções desta etapa

**a) Split no local oficial.** Migrar o payload para `charges[]` com
`payment_method.type = "PIX"`, `pix.expiration_date` e `charges[].splits`. Após criar o
Order, **conciliar**: se o SmartBus esperava split e a resposta não trouxer divisão
correspondente, marcar a tentativa como inconsistente, registrar diagnóstico e não seguir
como cobrança normal. Manter extração de QR tolerante aos dois formatos de resposta.

**b) Validação honesta da conexão.** Trocar o probe por consulta de conta/chave oficial
(`GET /public-keys/card` apenas como prova de autenticação) e separar os sinais:
`auth_ok`, `account_id_informado`, `pix_ready`, `split_ready`. `pix_ready` e `split_ready`
só passam a `true` após a primeira cobrança PIX com split efetivamente aceita pelo PagBank —
até lá ficam `unverified` e a interface diz "aguardando primeira cobrança de homologação".

**c) Regra financeira conforme PRD.** Conta ausente = participante ausente: recalcular a
distribuição pelos quatro cenários e seguir a venda. Bloquear apenas quando houver
**ambiguidade ou falha de consulta** (não é ausência comprovada) ou quando faltar a conta
Marketplace com taxa > 0. Toda ausência gera log de diagnóstico com o motivo.

**d) Identidade lógica versus credencial.** Distinguir rotação de token da mesma conta
(mesma identidade: consulta preservada) de conexão de outra conta e de revogação.
Permitir que venda antiga use a conexão congelada para **consulta e reconciliação** mesmo
com `is_current = false`, desde que a conta externa seja a mesma e o token exista; bloquear
apenas **novas cobranças**. Nunca cair em outra conexão ou gateway.

**e) Webhook reprocessável.** Dedup passa a bloquear somente eventos **concluídos**.
Evento recebido mas não finalizado (falha de consulta, erro transitório) permanece
reprocessável: reentrega reabre o processamento em vez de responder "duplicata". Continuam
garantidos: assinatura sobre corpo bruto, um único ticket por venda (a finalização comum já
é idempotente) e token resolvido só pela conexão da venda — nunca por tentativa e erro
entre empresas.

## 5. Arquivos e migrations

Arquivos: `supabase/functions/create-pagbank-payment/index.ts`,
`supabase/functions/pagbank-webhook/index.ts`,
`supabase/functions/pagbank-connection/index.ts`,
`supabase/functions/_shared/pagbank/{core,client,credentials,split-plan,split-recipients,status-sync}.ts`,
`src/components/admin/PagbankConnectionCard.tsx`, `src/lib/pagbankCore.test.ts`,
`docs/pagbank/PAGBANK_OPERACAO_SANDBOX.md`, `docs/pagbank/PAGBANK_IMPLEMENTATION.md`.

Migration (aditiva, sem destruir nada):

- `payment_gateway_connections`: `split_ready`, `capabilities_verified_at`, e `pix_ready`
  deixando de ser marcado na configuração manual;
- `payment_webhook_events`: coluna/estado que permita reprocessar evento não concluído
  (dedup efetivo apenas no estado final).

Nenhuma alteração em tabelas, campos, funções ou webhooks do Asaas.

## 6. Impacto no Asaas

Zero por desenho: as mudanças ficam em módulos `pagbank/*` e nas Edge Functions PagBank.
Se alguma alteração encostar em `payment-finalization.ts`, ela será mínima e a suíte de
caracterização Asaas será reexecutada antes de concluir.

## 7. Credenciais

A credencial Sandbox compartilhada fora do cofre deve ser considerada **exposta**: revogue
ou rotacione no painel PagBank. O token novo entra apenas pelo campo seguro da aba
Pagamentos (armazenado cifrado no backend) ou pelos secrets do backend — nunca no chat, no
código, na documentação, em logs, em testes ou em migrations.

Ainda são necessários (nomes, nunca valores):
novo token Sandbox rotacionado; `account_id` da empresa vendedora; conta Sandbox
Marketplace; contas Sandbox de sócio e representante para os cenários de split; token de
autenticação do webhook; `client_id`/`client_secret` da aplicação Connect e a redirect URI
cadastrada, quando o OAuth for testado; confirmação de PIX e split habilitados nas contas.

## 8. Cartões de teste

Apenas seção de homologação futura na documentação de Sandbox, com link oficial e data de
verificação. Nenhum código de cartão nesta etapa.

## 9. Critérios de aceite

- Split enviado no local oficial e conciliado com a resposta; divergência bloqueia e alerta.
- Nenhuma venda bloqueada por ausência comprovada de sócio/representante; distribuição segue
  os quatro cenários do PRD.
- Conexão só aparece como "PIX pronto" após verificação real.
- Venda antiga continua consultável após rotação/reconexão; nova cobrança bloqueada quando
  a identidade mudou.
- Webhook: duplicata concluída não reprocessa; evento não concluído reprocessa; nunca dois
  tickets.
- Suíte completa verde (206 atuais + testes PagBank) e `tsgo` limpo.
- Produção PagBank continua bloqueada por código e por constraint; Asaas intacto.
