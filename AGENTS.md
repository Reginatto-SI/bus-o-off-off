Tarefas relacionadas a pagamentos:

1. Consulte sempre:
   .agents/skills/smartbus-payment-gateway/SKILL.md

2. Quando envolver PagBank, consulte também:
   .agents/skills/pagbank-connect/SKILL.md

3. Smart Bus Payment Gateway define:
   - regras do produto;
   - arquitetura existente;
   - telas;
   - fluxo do SmartBus;
   - comportamento esperado.

4. PagBank Connect define:
   - capacidades do PagBank;
   - autenticação;
   - endpoints;
   - payloads;
   - webhooks;
   - requisitos técnicos da API.

5. Nunca substituir uma regra existente do SmartBus
   apenas porque a documentação do PagBank permite
   outra implementação.

6. Se existir incompatibilidade entre uma necessidade
   do SmartBus e uma limitação/regra do PagBank,
   não inventar solução: registrar a incompatibilidade
   e solicitar decisão antes de alterar o sistema.

## Implementação PagBank

Antes de qualquer tarefa PagBank, confirme que a tarefa foi iniciada a partir da branch base `feature/pagbank-integration` e leia, nesta ordem, `docs/pagbank/PAGBANK_IMPLEMENTATION.md`, `.agents/skills/smartbus-payment-gateway/SKILL.md` e `.agents/skills/pagbank-connect/SKILL.md`, incluindo apenas as referências aplicáveis. Reutilize a arquitetura e os componentes existentes; não crie fluxos paralelos de checkout, confirmação, webhook ou diagnóstico quando os atuais puderem ser generalizados. Preserve integralmente o Asaas, não presuma decisões de produto e atualize o checkpoint ao fim de cada sessão PagBank.

### Proteção obrigatória de branch e Pull Request

- A branch persistente oficial de desenvolvimento do PagBank é `feature/pagbank-integration`.
- No Codex Cloud, é permitido trabalhar em uma branch temporária `codex/*`, desde que ela tenha sido criada a partir de `feature/pagbank-integration`.
- Antes de alterar arquivos, confirme a branch/base de origem. Se não for possível comprovar que a tarefa partiu de `feature/pagbank-integration`, não execute alterações e informe o bloqueio.
- Todo Pull Request ou Draft Pull Request intermediário de uma tarefa PagBank deve ter obrigatoriamente `feature/pagbank-integration` como branch de destino/base.
- Nunca usar `main` como base de PR intermediário durante o desenvolvimento PagBank.
- A `main` só poderá ser usada como destino no Pull Request final da iniciativa PagBank, após implementação, homologação, validação de regressão do Asaas e autorização explícita do usuário.
- Se o ambiente não puder criar o PR com a base correta, não improvisar nem direcionar para `main`; informar explicitamente que o destino correto é `feature/pagbank-integration`.
- Não fazer merge automático de trabalho PagBank na `main`.
