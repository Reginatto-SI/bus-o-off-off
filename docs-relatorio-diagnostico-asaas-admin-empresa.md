# Relatório de Diagnóstico — Integração Asaas /admin/empresa

## 1. Objetivo
Auditar a regra de exibição do status da integração Asaas na rota `/admin/empresa`, identificar a causa do falso positivo para a empresa `a0000000-0000-0000-0000-000000000001` e aplicar a correção mínima segura, incluindo a ação de **Desvincular conta Asaas**.

## 2. Sintoma observado
A UI administrativa marcava a empresa como conectada e pronta para receber pagamentos mesmo quando os campos essenciais do ambiente operacional não estavam completos no banco.

## 3. Empresa analisada
- `a0000000-0000-0000-0000-000000000001`

## 4. Onde a lógica ocorre
- `src/pages/admin/Company.tsx`: renderização do card/badge de integração, revalidação manual e exibição de dados da conta.
- `src/pages/admin/Events.tsx`: bloqueio/liberação de fluxos de monetização baseado no status Asaas.
- `src/lib/asaasIntegrationStatus.ts`: helper novo e auditável que consolida a regra conservadora do status por ambiente.
- `supabase/functions/create-asaas-account/index.ts`: onboarding, vínculo, revalidação e agora desvinculação segura por ambiente.
- `src/hooks/use-runtime-payment-environment.ts`: resolução do ambiente operacional atual (`sandbox` ou `production`).
- `supabase/functions/_shared/payment-context-resolver.ts`: contrato backend do checkout, que depende de `apiKey` e `walletId` por ambiente.

## 5. Regra atual encontrada
Antes da correção, a UI de `/admin/empresa` usava apenas o campo legado `company.asaas_onboarding_complete` para:
- mostrar badge **Conectado**;
- renderizar o card “Pagamentos ativos”; e
- exibir wallet/e-mail a partir dos campos legados genéricos.

Além disso, `src/pages/admin/Events.tsx` considerava a empresa conectada se `asaas_wallet_id && asaas_onboarding_complete` fossem verdadeiros, sem validar a `apiKey` do ambiente operacional.

Na edge function `create-asaas-account`, o fluxo `create` também aceitava `already_complete` com fallback permissivo para campos legados (`company.asaas_wallet_id` / `company.asaas_onboarding_complete`) mesmo quando os campos específicos do ambiente atual não estavam completos.

## 6. Causa raiz
A causa raiz foi a combinação de **campos legados genéricos** com uma regra de status **permissiva demais**:
- `onboarding_complete` isolado era tratado como forte evidência de conexão;
- o frontend não exigia `apiKey + wallet + onboarding` do **ambiente operacional atual**;
- havia fallback entre dados por ambiente e dados legados, permitindo que estado histórico/espelhado fosse interpretado como conexão válida;
- o bloqueio de monetização em `Events` seguia contrato diferente do checkout real, porque ignorava a ausência de `apiKey` por ambiente.

## 7. Correção sugerida
Adotar uma regra conservadora e determinística:
- **Conectado**: somente quando existirem `apiKey`, `walletId` e `onboardingComplete=true` no ambiente operacional atual.
- **Parcialmente configurado**: quando existir algum dado do ambiente atual, do outro ambiente ou legado, mas faltar requisito essencial para operar no ambiente atual.
- **Inconsistente**: quando houver combinação quebrada, como onboarding sem `apiKey`/wallet ou campos legados indicando conexão enquanto o ambiente operacional estiver vazio.
- **Não configurado**: quando não houver nenhum dado relevante.

## 8. Correção aplicada
Foi criado o helper `src/lib/asaasIntegrationStatus.ts`, que:
- lê configuração por ambiente e campos legados;
- calcula um snapshot auditável do estado Asaas;
- classifica em `not_configured`, `partially_configured`, `connected` ou `inconsistent`.

Depois:
- `/admin/empresa` passou a usar esse snapshot para badge, card, textos e razões do diagnóstico;
- `/admin/Events` passou a validar conexão pelo mesmo contrato conservador do ambiente operacional;
- `create-asaas-account` deixou de aceitar `already_complete` usando fallback legado no fluxo de criação;
- foi incluído teste automatizado cobrindo falso positivo legado, configuração parcial e conexão válida.

## 9. Botão de desvincular
Foi adicionada a ação **Desvincular conta Asaas** em `/admin/empresa` quando a conta estiver conectada.

### Comportamento adotado
- exige confirmação explícita via `AlertDialog`;
- informa que remove apenas o vínculo do ambiente operacional atual;
- preserva histórico de vendas e relatórios;
- reaproveita a edge function existente `create-asaas-account`, agora com `mode: "disconnect"`.

### Campos/efeitos alterados
No ambiente atual, a edge function limpa:
- `asaas_api_key_<env>`
- `asaas_wallet_id_<env>`
- `asaas_account_id_<env>`
- `asaas_account_email_<env>`
- `asaas_onboarding_complete_<env>`

Depois, os campos legados espelhados são recalculados a partir do ambiente que ainda permanecer conectado. Se nenhum ambiente ficar conectado, os campos legados são limpos.

### O que preserva
- vendas históricas;
- cobranças passadas;
- relatórios operacionais;
- demais ambientes não desconectados.

## 10. Riscos e pontos de atenção
- Não foi possível consultar o banco remoto nesta auditoria por limitação de rede do ambiente local; o diagnóstico foi confirmado pelo contrato do código e pelos sintomas relatados.
- Ainda existem campos legados no schema; a correção minimiza seu impacto, mas o ideal futuro é reduzir dependência deles em toda a base.
- Outras telas administrativas/diagnósticas que exibam apenas campos legados podem merecer revisão futura, embora o escopo solicitado tenha sido mantido.

## 11. Checklist de validação
- [x] Empresa sem credenciais essenciais do ambiente atual não aparece conectada.
- [x] Empresa parcialmente configurada não aparece conectada.
- [x] Empresa com `apiKey + wallet + onboarding` no ambiente atual aparece conectada.
- [x] Regras de monetização em `Events` passam a usar o mesmo contrato conservador.
- [x] Desvincular remove o vínculo operacional atual e força atualização imediata da UI.
- [x] Histórico de vendas permanece íntegro porque a ação limpa apenas credenciais/vínculos de integração.
