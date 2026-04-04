# Ajuste — Verificação de integração Asaas

## 1. Objetivo do ajuste
Aplicar uma correção mínima e segura na verificação manual de integração Asaas em `/admin/empresa` (aba Pagamentos), tornando a validação de conta mais objetiva e separando mensagens de erro por causa técnica.

## 2. Arquivos alterados
- `supabase/functions/check-asaas-integration/index.ts`
- `analise-91-ajuste-verificacao-integracao-asaas.md`

## 3. O que foi ajustado
- A verificação primária de conta/autenticação passou a usar `GET /myAccount/accountNumber`.
- A consulta `GET /myAccount/status` foi mantida para status operacional.
- O fluxo auxiliar existente (wallet/pix e validações complementares) foi preservado.
- As mensagens de erro foram separadas para reduzir ambiguidade entre:
  - credencial ausente (api key/wallet)
  - autenticação inválida
  - conta não encontrada
  - payload inesperado/falha de parsing de `accountNumber`
  - falha em endpoint complementar (`/myAccount`)
  - erro de diagnóstico operacional (status/wallet/pix)
  - erro de rede/execução
- As mensagens de retorno agora explicitam o ambiente validado (`produção`/`sandbox`).

## 4. Como ficou a nova ordem da validação
1. Validar contexto (`company_id`, `target_environment`, permissões).
2. Validar credenciais mínimas por ambiente (`api_key`, `wallet_id`).
3. Chamar `GET /myAccount/accountNumber` como prova primária de conta/autenticação no ambiente.
4. Chamar `GET /myAccount` como consulta complementar para manter validações legadas de `account_id`/wallet sem refatoração.
5. Chamar diagnósticos operacionais (`/myAccount/status`, `/wallets/`, `/pix/addressKeys`).
6. Consolidar resultado final (`valid`/`pending`/erros) com mensagem mais específica.

## 5. Como os erros passaram a ser diferenciados
- **Credencial ausente**: mensagem específica para API key ausente ou wallet ausente no ambiente.
- **Autenticação inválida**: mensagem explícita para falha de autenticação (401/403) com orientação de revisar chave e ambiente.
- **Conta não encontrada**: mensagem específica para 404 real no endpoint primário.
- **Resposta inesperada/parsing**: quando `accountNumber` responde sem identificador utilizável, retorna erro técnico específico.
- **Falha complementar**: se `/myAccount` falhar após sucesso no primário, retorno indica validação parcial com falha no diagnóstico complementar.
- **Falha operacional**: quando status/wallet/pix falham, retorno informa conta validada + erro na etapa operacional.
- **Rede/execução**: mantém erro dedicado para falha de runtime/rede.

## 6. Impactos esperados
- Redução de falsos diagnósticos “conta não encontrada”.
- Maior previsibilidade para suporte ao distinguir erro de autenticação, parsing, conta inexistente e erro operacional.
- Melhor clareza para o usuário/admin sobre qual ambiente foi realmente validado.

## 7. Riscos remanescentes
- O ambiente validado ainda depende da resolução de runtime já existente (escopo não alterado por este ajuste).
- A validação complementar ainda depende de formatos possíveis de payload do Asaas em `/myAccount`.
- O endpoint sandbox base (`sandbox.asaas.com/api/v3`) foi mantido para não ampliar escopo/risco nesta correção mínima.

## 8. Conclusão
O ajuste foi restrito ao fluxo existente da edge function `check-asaas-integration`, sem refatoração de arquitetura e sem impacto em checkout/webhook/split. A validação de conta ficou mais objetiva (`accountNumber` primeiro), e os erros/mensagens ficaram mais claros e auditáveis por ambiente.
