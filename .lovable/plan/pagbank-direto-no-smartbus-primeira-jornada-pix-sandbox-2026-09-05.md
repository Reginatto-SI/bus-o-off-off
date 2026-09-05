# PagBank direto no SmartBus — primeira jornada PIX (Sandbox)

Objetivo: uma empresa em Sandbox conecta sua conta PagBank, escolhe PagBank para novas vendas, o comprador paga por PIX (QR Code + copia e cola) e a venda vira `pago` com ticket e ledger emitidos uma única vez pela finalização já existente. Cartão e Produção ficam bloqueados. Asaas permanece intacto.

## O que foi confirmado antes de planejar

- `companies` e `sales` não têm coluna de gateway; o provedor é implícito pelos campos `asaas_*`. Existem 68 empresas e 1005 vendas que precisam de backfill explícito como `asaas`.
- A venda é inserida pelo próprio checkout público (cliente anônimo, policy "Public can create sales") antes de qualquer chamada externa. Por isso o congelamento de gateway/ambiente deve acontecer no banco (trigger), não no navegador.
- `finalizeConfirmedPayment` (`_shared/payment-finalization.ts`) é o único caminho de finalização, mas seu contrato recebe `asaasStatus`/`paymentId` e grava `asaas_payment_status`. Precisa de entrada aditiva para evidência PagBank sem duplicar a rotina.
- `sale_integration_logs.provider` só aceita `asaas` e `manual` (check constraint); `environment_decision_source` não aceita `company`.
- O motor financeiro (`platform-fee-engine.ts`) já é agnóstico; a tradução de recebedores está em `resolveAsaasSplitRecipients` (wallets). `socios_split` e `representatives` só possuem wallets Asaas.
- `Confirmation.tsx` já faz polling em `verify-payment-status` e lê `sales` localmente — é o lugar natural para exibir o QR PIX PagBank.
- Não há segredos PagBank cadastrados. Segredos ficam somente no backend (Lovable Cloud); nada em arquivo do projeto.

## Etapas de implementação

### 1. Baseline
Rodar a suíte atual (`bun run test`) e o typecheck antes de qualquer alteração e registrar o resultado.

### 2. Dados (migrations pequenas e aditivas)
- `companies.payment_gateway text` com check `('asaas','pagbank')`; backfill explícito `asaas` para todas as empresas; depois `NOT NULL` sem default semântico. `register-company` passa a gravar `asaas` explicitamente.
- `sales.payment_gateway text` com check; backfill `asaas` nas 1005 vendas; `NOT NULL`.
- Trigger `BEFORE INSERT` em `sales`: se `payment_gateway` vier nulo, copia de `companies.payment_gateway` da mesma `company_id`; se `payment_environment` vier nulo, copia de `companies.payment_environment`; falha se a empresa não tiver valor. Trigger `BEFORE UPDATE` impede alterar `payment_gateway`, `payment_environment` e `company_id` após a criação.
- Bloqueio explícito: trigger/check impede `payment_gateway='pagbank'` com `payment_environment='production'` em `sales` e em `companies` nesta etapa.
- Nova tabela privada `payment_gateway_connections` (identidade lógica da integração): `company_id`, `gateway`, `environment`, `status` (`awaiting_configuration|connected|revoked|error`), `external_account_id`, `credential_mode` (`connect_oauth|sandbox_manual_token`), tokens **cifrados** (`access_token_enc`, `refresh_token_enc`, `webhook_token_enc`), `token_expires_at`, `scopes`, `credential_generation`, timestamps e `last_error`. Sem grant para `anon`/`authenticated`; somente `service_role`. Leitura pelo admin ocorre via Edge Function que devolve apenas dados não secretos.
- `sales.payment_connection_id` (FK para a conexão usada, congelada na criação da venda pelo mesmo trigger) e `sales.external_account_id`.
- Nova tabela `payment_attempts`: `sale_id`, `company_id`, `gateway`, `environment`, `operation` (`create_pix`), `idempotency_key` UNIQUE, `payload_hash`, `state` (`pending|succeeded|failed|indeterminate`), `external_order_id`, `external_charge_id`, `external_status_raw`, `normalized_status`, `pix_qr_text`, `pix_qr_image_url`, `pix_expires_at`, `error_code`, `error_message_sanitized`, tentativas e timestamps. RLS: leitura por usuários da empresa; escrita somente service role.
- Nova tabela `payment_webhook_events` (dedup PagBank): chave única `(gateway, environment, external_account_id, event_key)`, `sale_id`, `raw_body_hash`, `signature_valid`, `raw_status`, `processing_result`, timestamps. Service role apenas.
- `socios_split.pagbank_account_id_sandbox/production` e `representatives.pagbank_account_id_sandbox/production` (aditivos, nulos).
- `sale_integration_logs`: ampliar check de `provider` para incluir `pagbank` e de `environment_decision_source` para incluir `company`.
- `pagbank_connect_states`: `state` opaco, `company_id`, `environment`, `user_id`, `expires_at`, `used_at` (CSRF do OAuth). Service role apenas.
- Campos Asaas: nenhum renomeado, removido ou alterado.

### 3. Segredos (backend, sem valores no código)
Nomes a cadastrar quando a conta existir: `PAGBANK_CLIENT_ID_SANDBOX`, `PAGBANK_CLIENT_SECRET_SANDBOX`, `PAGBANK_MARKETPLACE_ACCOUNT_ID_SANDBOX`, `PAGBANK_WEBHOOK_TOKEN_SANDBOX` (token de autenticidade da conta, se aplicável ao modelo Connect — gate de homologação). Chave de cifra `PAGBANK_TOKEN_ENCRYPTION_KEY` gerada automaticamente pela plataforma (AES-GCM para os tokens por empresa). Sem segredo, a integração fica em "aguardando configuração" e nenhuma chamada real é feita. Equivalentes `_PRODUCTION` não são usados nesta etapa.

### 4. Backend compartilhado (aditivo, sem tocar no caminho Asaas)
- `_shared/pagbank/client.ts`: base URL por ambiente (Sandbox apenas), headers, `x-idempotency-key`, erros tipados (config, auth, validação, recusa, indeterminado/timeout, tenant/ambiente divergente), logs sanitizados.
- `_shared/pagbank/credentials.ts`: cifra/decifra tokens, resolve credencial válida da **conexão congelada na venda**, refresh serializado (controle otimista por `credential_generation`), falha fechada.
- `_shared/pagbank/split-plan.ts`: recebe a distribuição já calculada por `distributePlatformFee` (centavos) + elegibilidade da regra existente e traduz para `FIXED` com account IDs do ambiente; valida soma exata = total; qualquer recebedor elegível sem `pagbank_account_id` → erro bloqueante nomeando o recebedor. Nenhum recálculo de taxa.
- `_shared/pagbank/status.ts`: `WAITING/AUTHORIZED/IN_ANALYSIS → pending`, `PAID → paid`, `DECLINED → failed`, `CANCELED → canceled`, demais → `unknown`.
- `payment-finalization.ts`: parâmetro aditivo opcional `gatewayEvidence { gateway, externalStatus, externalId }`; quando gateway = `pagbank`, grava status em `payment_attempts`/coluna genérica em vez de `asaas_payment_status`; `source` ganha `pagbank-webhook`. Comportamento Asaas inalterado. `inspectSaleConsistency` passa a considerar `payment_gateway`.
- `payment-context-resolver.ts`: sem mudança de comportamento Asaas; apenas expõe `payment_gateway` no contexto lido da venda.

### 5. Edge Functions novas (`verify_jwt = false`, validação manual)
- `pagbank-connect-start`: valida gerente da empresa, cria `state`, devolve URL do Connect Authorization Sandbox com scopes mínimos (`payments.read payments.create accounts.read payments.split.read`).
- `pagbank-connect-callback`: valida `state` (uso único, expiração, empresa/ambiente), troca `code`, consulta conta, persiste conexão cifrada, redireciona para `/admin/empresa?tab=pagamentos`.
- `pagbank-save-sandbox-token`: **somente Sandbox**; gerente envia token da conta Sandbox; backend valida com chamada de leitura, cifra e persiste; nunca devolve o valor. Produção → recusa explícita.
- `pagbank-connection-status`: devolve estado não secreto (ambiente, status, conta mascarada, capacidade PIX, configuração pendente, segredos ausentes por nome).
- `create-pagbank-payment`: relê venda; exige `payment_gateway='pagbank'`, ambiente `sandbox`, conexão congelada válida; se já existe tentativa `succeeded`/`indeterminate` para a chave, consulta o Order existente e devolve o mesmo QR (nunca recria); gera chave `pagbank:{company}:{sale}:{env}:create_pix`; persiste tentativa `pending` antes da chamada; calcula plano com motor existente; monta split FIXED; cria Order PIX com `reference_id = sale.id`; salva IDs/QR/expiração/status; timeout → `indeterminate` + consulta. Erros públicos simples, logs completos sem segredo.
- `pagbank-webhook`: lê corpo bruto; extrai `reference_id`/`order.id` só para localizar a venda; carrega token da conexão da venda; valida `x-authenticity-token` por SHA-256 em tempo constante; rejeita gateway/ambiente/conta divergentes; dedup em `payment_webhook_events`; para `PAID` consulta o Order antes de finalizar; converge em `finalizeConfirmedPayment`; demais status só atualizam a tentativa.
- `verify-payment-status`: ramo aditivo — se `sale.payment_gateway='pagbank'`, consulta Order/Charge com a credencial da venda e converge pela mesma finalização; caminho Asaas idêntico ao atual.
- `create-asaas-payment`: guarda defensiva — recusa venda cuja `payment_gateway` não seja `asaas` (impede cobrança no provedor errado). Nenhuma outra mudança.
- `config.toml`: entradas das novas funções.

### 6. Admin — aba Pagamentos (`/admin/empresa`)
- Seletor visual de gateway (dois cards: Asaas / PagBank) gravando `companies.payment_gateway`; texto claro de que a troca vale apenas para vendas futuras. PagBank só selecionável se a empresa estiver em Sandbox; em Produção o card mostra "indisponível nesta fase".
- Card PagBank: ambiente, status da conexão, conta vinculada (mascarada), PIX habilitado, pendências de configuração com os nomes dos segredos faltantes, botões Conectar (Connect), Informar token Sandbox, Validar, Reconectar/Desconectar.
- Bloco Asaas existente (wizard, diagnóstico, comissionamento) permanece como está.

### 7. Checkout e confirmação
- `Checkout.tsx`: continua criando venda/locks/passageiros igual. Após a inserção, lê `payment_gateway` da venda retornada; se `pagbank` invoca `create-pagbank-payment` e navega para `/confirmacao/:id` sem abrir aba externa; PagBank oferece apenas PIX nesta fase (cartão oculto quando gateway = pagbank). Se `asaas`, fluxo atual byte a byte.
- `Confirmation.tsx`: quando a venda é PagBank, renderiza painel PIX (valor, QR image/base64, copia e cola com botão copiar, expiração com contagem, "aguardando pagamento", atualização automática pelo polling já existente, mensagens de confirmado/expirado/erro e botão "gerar novamente" que passa pela mesma chave/consulta). Sem detalhes de split. Vendas Asaas não mudam.
- `paymentMethodLabels`, `SalesDiagnostic` e listagem de vendas: coluna/badge de gateway (somente leitura).

### 8. Testes focados (Vitest, sem nova infraestrutura)
Unitários sobre os módulos puros: roteamento por gateway (asaas continua asaas; pagbank cria pagbank), imutabilidade do snapshot (contrato do trigger validado por teste de SQL de migration + teste de guarda), chave idempotente estável e reuso em retry, quatro cenários de split FIXED fechando em centavos (inclusive resíduo), mapeamento de status, validação de assinatura do webhook e dedup, rejeição de empresa/ambiente incorreto, bloqueio de Produção. Depois, suíte completa para confirmar zero regressão Asaas.

### 9. Documentação
- Atualizar `docs/pagbank/PAGBANK_IMPLEMENTATION.md` (checkpoint curto).
- Criar `docs/pagbank/PAGBANK_OPERACAO_SANDBOX.md`: segredos por nome, redirect URI (`https://<projeto>.supabase.co/functions/v1/pagbank-connect-callback` + domínios oficiais para retorno), URL do webhook (`.../functions/v1/pagbank-webhook`), como validar uma empresa, desabilitar PagBank, diagnosticar.

## Limites desta etapa
- Sem cartão, Payment Link, boleto, refund/chargeback automático, migração automática, fallback entre gateways ou Produção PagBank.
- Sem credenciais reais, a jornada fica testável até "aguardando configuração"; o teste ponta a ponta em Sandbox depende de você cadastrar os segredos e o token da conta Sandbox.
- Split real, webhook Connect multiempresa e primário/tarifas continuam `PROVÁVEL, MAS PRECISA HOMOLOGAÇÃO`.

## Detalhes técnicos
- Cifra dos tokens: AES-256-GCM via WebCrypto nas Edge Functions, chave do segredo `PAGBANK_TOKEN_ENCRYPTION_KEY`; tabela sem grant a papéis públicos.
- Idempotência dupla: UNIQUE em `payment_attempts.idempotency_key` (barreira local, resolve dois cliques) + header de idempotência PagBank.
- Todas as queries service role filtram `company_id` da venda; webhook nunca aceita `company_id` do payload como verdade.
- Ordem de entrega: migrations → segredo gerado → shared → funções → admin → checkout/confirmação → testes → docs.
