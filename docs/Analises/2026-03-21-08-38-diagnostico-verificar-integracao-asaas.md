# Diagnóstico e correção — verificação da integração Asaas em `/admin/empresa`

## 1. Objetivo
Investigar o erro no botão **"Verificar integração"** da guia **Pagamentos** em `/admin/empresa` e aplicar a menor correção possível para manter coerência entre empresa ativa, ambiente operacional, status visual do card e resposta real da validação Asaas.

## 2. Sintoma reportado
- A empresa aparecia como **Conectada** no card.
- O card exibia e-mail da conta Asaas, ambiente operacional e wallet.
- Ao clicar em **"Verificar integração"**, a validação podia falhar com erro genérico ou comportamento inconsistente.
- O fluxo ficava pouco confiável para suporte porque o estado visual nem sempre refletia todos os dados exigidos pela verificação dedicada.

## 3. Causa raiz encontrada
A causa raiz identificada foi uma **divergência entre o critério visual de conexão e o critério técnico da verificação dedicada**:

1. O status visual do card considerava a integração **conectada** quando o ambiente ativo tinha:
   - `api_key`
   - `wallet_id`
   - `onboarding_complete`

2. A edge function `check-asaas-integration` exigia, antes de concluir a verificação, também o `account_id` persistido localmente.

3. Em empresas já operacionais, principalmente em vínculos anteriores ou dados parcialmente saneados, era possível existir:
   - `api_key` válida
   - `wallet_id` válida
   - `onboarding_complete = true`
   - **`account_id` ausente no cadastro local**

4. Nessa situação:
   - a UI mostrava **Conectado**;
   - a verificação dedicada encontrava pendência estrutural do ambiente ativo;
   - o diagnóstico final ficava inconsistente com o card e pouco claro para o usuário.

## 4. Arquivos analisados
- `src/pages/admin/Company.tsx`
- `src/lib/asaasIntegrationStatus.ts`
- `src/hooks/use-runtime-payment-environment.ts`
- `src/contexts/AuthContext.tsx`
- `src/lib/asaasError.ts`
- `supabase/functions/check-asaas-integration/index.ts`
- `supabase/functions/create-asaas-account/index.ts`
- `supabase/functions/_shared/runtime-env.ts`

## 5. Correção aplicada
Foi aplicada uma correção mínima, segura e reversível em três pontos:

### Backend — `check-asaas-integration`
- O endpoint deixou de tratar `account_id` ausente como bloqueio **antes** da consulta ao gateway.
- Agora ele continua a validação real no Asaas quando existem `api_key` + `wallet_id` do ambiente ativo.
- Se o gateway responder com sucesso, mas o `account_id` local estiver ausente, a resposta volta como **pendência identificável**, com mensagem clara:
  - "Conta Asaas validada no gateway, mas falta salvar o account_id deste ambiente no cadastro da empresa."
- Isso evita transformar uma conta operacional em falha genérica e melhora o suporte.

### Frontend — handler do botão
- O handler continuou enviando explicitamente:
  - `company_id = editingId`
  - `target_environment = runtimePaymentEnvironment`
- Foram adicionados comentários explicando por que essa combinação evita mistura entre empresa errada e ambiente errado.
- O tratamento da resposta estruturada foi mantido com priorização de mensagens claras de `success`, `warning` e `error`.

### Frontend — status visual do card
- O snapshot visual do Asaas passou a considerar que **sem `account_id` salvo o ambiente ainda não está totalmente configurado**, mesmo que a operação básica exista.
- Nesses casos, o badge não fica mais como **Conectado**; passa para estado de **configuração pendente**, com razão explícita.
- Isso alinha o card com o resultado real da verificação manual.

## 6. Regras de negócio preservadas
- Não foi criada nova arquitetura.
- Não foi alterado checkout, webhook, vendas ou onboarding.
- Não houve criação de tabela nova.
- O projeto continua multiempresa, usando a empresa ativa da sessão.
- O ambiente operacional continua sendo enviado explicitamente pelo frontend.
- Não foi reintroduzido fallback para campos legados.

## 7. Riscos evitados
- Mistura entre dados sandbox e produção.
- Mistura entre empresa ativa da sessão e empresa carregada na tela.
- Toast genérico para causa já identificável.
- Card exibindo "Conectado" quando faltava identificador importante para auditoria e verificação manual.

## 8. Resultado esperado após a correção
### Cenário A — integração totalmente consistente
O botão deve responder com:
- **"Integração Asaas validada com sucesso."**

### Cenário B — ambiente operacional válido no gateway, mas sem `account_id` salvo
O botão deve responder com aviso claro:
- **"Conta Asaas validada no gateway, mas falta salvar o account_id deste ambiente no cadastro da empresa."**

E o card não deve mais aparecer como totalmente conectado nesse cenário.

### Cenário C — faltam `api_key` ou `wallet_id`
O botão deve responder com:
- **"A conta Asaas deste ambiente ainda não está completamente configurada: faltando ..."**

## 9. Pendências, se houver
- Esta correção melhora a coerência e o diagnóstico, mas **não grava automaticamente** o `account_id` ausente. Isso foi deliberado para manter a verificação dedicada sem mutação de estado.
- Se futuramente o produto decidir autopreencher `account_id` após validação, isso deve ser tratado como alteração de regra de negócio separada.

## 10. Como validar manualmente o funcionamento
1. Acessar `/admin/empresa` com usuário administrador vinculado à empresa.
2. Abrir a guia **Pagamentos**.
3. Confirmar qual é o **ambiente operacional atual** exibido no card.
4. Clicar em **"Verificar integração"**.
5. Validar o resultado:
   - se houver `api_key`, `wallet_id`, `account_id` e onboarding corretos para o ambiente ativo, deve aparecer sucesso;
   - se o gateway validar a conta mas o `account_id` local estiver ausente, deve aparecer aviso claro de configuração pendente;
   - se faltarem dados obrigatórios do ambiente ativo, deve aparecer aviso específico informando quais dados faltam;
   - se a empresa ativa não for localizada, deve aparecer mensagem específica de empresa/contexto.
6. Verificar que o botão entra em loading e impede múltiplos cliques simultâneos.
7. Conferir se o badge visual do card está coerente com o resultado da verificação.
