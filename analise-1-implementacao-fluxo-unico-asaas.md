# 1. Objetivo da implementação

Implementar a correção mínima e segura da fase atual para transformar o `AsaasOnboardingWizard` no fluxo único de onboarding/vínculo Asaas no frontend, removendo a duplicação de `link_existing` em `/admin/empresa` e reforçando o diagnóstico de `walletId` no backend.

# 2. Fluxo antigo removido/substituído

- Removido o fluxo inline de vínculo por API Key em `/admin/empresa`.
- A ação `Já tenho conta Asaas` agora abre o mesmo `AsaasOnboardingWizard` já usado em `/admin/eventos`.
- O card da aba `Pagamentos` continua existindo, mas agora serve apenas como ponto de entrada para o wizard reutilizável.

# 3. Componentes e arquivos alterados

- `src/pages/admin/Company.tsx`
- `src/components/admin/AsaasOnboardingWizard.tsx`
- `supabase/functions/create-asaas-account/index.ts`
- `analise-1-implementacao-fluxo-unico-asaas.md`

# 4. Como o wizard virou fluxo único

- O wizard passou a aceitar `initialMode` para abrir diretamente em `create` ou `link`.
- `/admin/empresa` deixou de executar `link_existing` por conta própria.
- A mesma jornada visual e funcional agora é usada em `/admin/empresa` e `/admin/eventos`.
- Loading, submit, parsing de erro e sucesso de vínculo passam pelo mesmo componente no frontend.

# 5. Como a decisão de ambiente ficou centralizada

- A decisão de `target_environment` para vínculo/criação continua dentro do `AsaasOnboardingWizard`.
- Para developer, o componente mantém a possibilidade de selecionar `auto`, `sandbox` ou `production`.
- Para não-developer, o próprio wizard continua forçando produção.
- `/admin/empresa` não envia mais ambiente por fluxo paralelo no vínculo via API Key.

# 6. Melhorias feitas no diagnóstico de walletId

- Adicionados logs diagnósticos mais detalhados no `mode: 'link_existing'`.
- Agora são registrados de forma segura:
  - ambiente resolvido;
  - base URL usada;
  - status de `/myAccount`;
  - resumo das chaves do payload recebido;
  - necessidade de fallback em `/wallets`;
  - status e resumo do fallback;
  - ponto exato de falha quando o `walletId` não é encontrado.
- Nenhuma API Key é logada por completo; o código usa mascaramento.

# 7. Mudanças nas mensagens de erro

- Falhas de autenticação deixaram de culpar genericamente a API Key sem contexto.
- As mensagens agora deixam explícito o ambiente (`produção` ou `sandbox`) quando a autenticação falha.
- Quando o `walletId` não é resolvido, a mensagem informa que:
  - a conta respondeu naquele ambiente;
  - o `walletId` utilizável não foi localizado;
  - pode haver divergência entre ambiente selecionado e ambiente real da chave;
  - ou resposta inesperada/sem wallet utilizável.

# 8. Riscos mitigados

- Redução da divergência entre `/admin/empresa` e `/admin/eventos`.
- Redução de manutenção duplicada no frontend.
- Menor risco de decisões diferentes de ambiente no vínculo por API Key.
- Melhor base diagnóstica para diferenciar problema de autenticação, ambiente e contrato de resposta.

# 9. Resultado final esperado

- `/admin/empresa` e `/admin/eventos` usam o mesmo wizard para integrar conta Asaas.
- O vínculo por API Key segue a mesma UI e o mesmo tratamento de submit/erro.
- O backend oferece logs mais úteis para diagnosticar falhas de `walletId`.
- O usuário passa a receber mensagens menos enganosas sobre ambiente e wallet.

# 10. Pendências ou dúvidas remanescentes

- Confirmar com payload real se o Asaas retorna `walletId` em formatos adicionais além dos contemplados no parser endurecido.
- Validar em ambiente real se há algum tenant/conta cujo `/wallets` retorne shape ainda diferente.
- Se necessário na próxima fase, revisar se o modo `auto` ainda deve existir no contexto administrativo.
