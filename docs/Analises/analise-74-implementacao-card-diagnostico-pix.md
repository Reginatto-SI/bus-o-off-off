# Implementação — expansão do card de diagnóstico Asaas para diagnóstico operacional completo do Pix

## 1) O que foi implementado

Foi implementada a evolução do card **Diagnóstico Asaas (developer)** na tela `/admin/empresa`, mantendo o padrão existente e sem criar nova tela.

### Backend (`check-asaas-integration`)
- Endpoint expandido para diagnóstico Pix em **modo leitura**.
- Consultas adicionadas:
  - `GET /v3/pix/addressKeys?status=ACTIVE`
  - `GET /v3/pix/addressKeys`
  - `GET /v3/myAccount/status/`
  - `GET /v3/wallets/`
- Payload de retorno ampliado com:
  - total de chaves Pix
  - total de chaves `ACTIVE`
  - status encontrados
  - tipos de chave
  - status da conta e substatus (commercial, bank, documentation, general)
  - wallet/account confirmados via gateway
  - fingerprint seguro da API key
  - timestamp de checagem
  - comparação explícita de readiness local vs gateway (incluindo divergência)
- Conclusão operacional retornada em mensagem humana única, cobrindo os cenários:
  - Pix operacional
  - sem chave ACTIVE
  - conta não aprovada
  - erro de consulta
  - divergência local x gateway

### Frontend (`AsaasDiagnosticPanel` + `Company`)
- Card existente reaproveitado e expandido (sem nova arquitetura).
- Blocos visuais adicionados no card:
  - **Contexto** (ambiente, companyId, wallet/account gateway, fingerprint)
  - **Pix** (totais, status, tipos, última checagem, último erro)
  - **Conta** (status + substatus)
  - **Comparativo** (readiness local x gateway)
  - **Conclusão operacional** (mensagem única e clara)
- Ações do card:
  - botão **Verificar Pix agora**
  - botão **Copiar diagnóstico Pix**
  - botão **Reconfigurar webhook** (restaurado para manter capacidade operacional já existente)
  - manutenção do accordion com JSON técnico

## 2) Arquivos alterados

- `supabase/functions/check-asaas-integration/index.ts`
- `src/components/admin/AsaasDiagnosticPanel.tsx`
- `src/pages/admin/Company.tsx`

## 3) Como validar

1. Abrir `/admin/empresa` com usuário developer.
2. Expandir **Diagnóstico Asaas (developer)**.
3. Clicar em **Verificar Pix agora**.
4. Validar se o card exibe sem abrir JSON:
   - total de chaves e total ACTIVE
   - status/tipos de chave
   - status/substatus da conta
   - readiness local vs gateway
   - conclusão operacional final
5. Opcional: clicar em **Copiar diagnóstico Pix** e conferir payload copiado.

## 4) Confirmação explícita de escopo

- Esta implementação é de **diagnóstico/admin**.
- Não houve alteração em checkout.
- Não houve alteração em create-payment.
- Não houve alteração em webhook transacional.
- **Fluxo de cartão de crédito não foi alterado.**
