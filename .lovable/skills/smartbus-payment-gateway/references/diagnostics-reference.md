# Diagnóstico, auditoria e aceite operacional

## Referência atual

- `/admin/diagnostico-vendas`: triagem técnica por venda, empresa, ambiente, status, cobrança, logs, webhook e split.
- `/admin/empresa`: estado da integração, conta/wallet/onboarding/Pix e verificação.
- `/confirmacao/:id`: polling/fallback e estado percebido pelo comprador.
- `sale_logs`: histórico operacional.
- `sale_integration_logs`: eventos estruturados de create/webhook/verify, ambiente, incident codes e payload sanitizado.
- `asaas_webhook_event_dedup`: eventos recebidos/duplicados/tentativas.
- `reconcile-sale-payment`: reparo controlado de pago sem ticket.

## Registro mínimo agnóstico

Cada operação relevante deve permitir correlacionar: `gateway`, ambiente, conta externa não secreta, `company_id`, `sale_id`, ID/idempotency key externa, método, valor/moeda, status interno, status/evento externo bruto, origem (checkout/webhook/verify/reconcile), timestamps, tentativa, código de erro sanitizado, decisão de transição, contagem/IDs de tickets, snapshot/ledger e divergência.

Nunca logar API key, Authorization, token/assinatura completos, dados de cartão, documento completo ou payload indiscriminado. Definir allowlist e mascaramento.

## Roteiro de suporte

1. Confirmar empresa, venda, gateway e ambiente persistidos.
2. Comparar status interno, ID/status externo e `payment_confirmed_at`.
3. Localizar criação e verificar se pode ter ocorrido timeout pós-criação.
4. Localizar webhook, autenticação, dedup e resultado de finalização.
5. Consultar gateway via fallback sem criar cobrança.
6. Conferir tickets/locks e executar reconcile somente sob pré-condições.
7. Conferir taxa, split efetivo, snapshot e ledger.
8. Registrar divergência e escalar reversão/chargeback quando não automatizados.

## Aceite operacional

Demonstrar no sandbox: erros acionáveis; logs correlacionados; webhook válido/inválido/duplicado; ausência de webhook + verify; pago sem ticket + reconcile; consulta cruzada de tenant/ambiente negada; secrets ausentes sem vazamento; dashboard identifica divergência. Definir alertas/SLA/runbook e piloto antes da produção.
