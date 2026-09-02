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
   - capacidades da solução PB Integrações/PagBank Connect;
   - autenticação;
   - endpoints;
   - payloads;
   - webhooks;
   - requisitos técnicos específicos dessa integração.

5. Não tratar a Skill PagBank Connect como representação completa da API oficial do PagBank. Quando a tarefa comparar PB Integrações com PagBank direto, validar separadamente a documentação oficial atual do PagBank.

6. Nunca substituir uma regra existente do SmartBus apenas porque a documentação de um gateway permite outra implementação.

7. Se existir incompatibilidade entre uma necessidade do SmartBus e uma limitação/regra do gateway, não inventar solução: registrar a incompatibilidade e solicitar decisão antes de alterar o sistema.

## Implementação PagBank

Antes de qualquer tarefa PagBank, leia, nesta ordem:

1. `docs/pagbank/BRANCH_CONTEXT.md`;
2. `docs/pagbank/PAGBANK_IMPLEMENTATION.md`;
3. `.agents/skills/smartbus-payment-gateway/SKILL.md`;
4. `.agents/skills/pagbank-connect/SKILL.md`;
5. apenas as referências aplicáveis à tarefa atual.

Reutilize a arquitetura e os componentes existentes. Não crie fluxos paralelos de checkout, confirmação, webhook ou diagnóstico quando os atuais puderem ser generalizados. Preserve integralmente o Asaas, não presuma decisões de produto e atualize o checkpoint ao fim de cada sessão PagBank quando houver avanço real.

## Contexto oficial da iniciativa

- Repositório: `Reginatto-SI/bus-o-off-off`.
- Branch persistente oficial da iniciativa PagBank: `feature/pagbank-integration`.
- `docs/pagbank/BRANCH_CONTEXT.md` existe somente como marcador operacional para tarefas desta iniciativa e deve confirmar esse contexto.
- Payment Link, link de pagamento e checkout hospedado PagBank não fazem parte do escopo atual. O escopo inicial é integração via API com PIX e cartão de crédito, conforme o checkpoint vigente.

## Proteção obrigatória de branch e Pull Request

### Quando a referência Git da branch estiver disponível

- Se `feature/pagbank-integration` existir como referência local ou remota, confirme normalmente que a tarefa foi iniciada nela ou em uma branch temporária derivada dela.
- Branches temporárias `codex/*` são permitidas quando derivadas de `feature/pagbank-integration`.

### Compatibilidade com Codex Cloud

O Codex Cloud pode materializar a branch selecionada pela interface em uma branch local temporária chamada `work`, sem configurar `origin` e sem expor `refs/heads/feature/pagbank-integration` dentro do clone.

Nessa situação, **não bloquear a tarefa apenas porque o nome local é `work`, porque não existe `remote`, ou porque `git merge-base` não consegue resolver `feature/pagbank-integration`**.

Quando a referência Git não estiver disponível, considerar o contexto PagBank válido somente se TODAS as condições abaixo forem verdadeiras:

1. `docs/pagbank/BRANCH_CONTEXT.md` existe e declara `feature/pagbank-integration` como branch oficial;
2. `docs/pagbank/PAGBANK_IMPLEMENTATION.md` existe e contém o checkpoint atual da iniciativa PagBank;
3. este `AGENTS.md` contém estas regras de proteção PagBank;
4. o conteúdo carregado não contradiz o checkpoint nem as decisões atuais;
5. a tarefa foi iniciada pelo usuário com a branch `feature/pagbank-integration` selecionada no Codex Cloud.

Se essas condições estiverem satisfeitas, pode prosseguir mesmo que a branch local seja `work` e não exista remoto no ambiente.

Se algum marcador obrigatório estiver ausente ou contraditório, pare antes de alterar arquivos e informe o bloqueio.

### Pull Requests

- Todo Pull Request ou Draft Pull Request intermediário de uma tarefa PagBank deve ter obrigatoriamente `feature/pagbank-integration` como branch de destino/base.
- Nunca usar `main` como base de PR intermediário durante o desenvolvimento PagBank.
- A `main` só poderá ser usada como destino no Pull Request final da iniciativa PagBank, após implementação, homologação, validação de regressão do Asaas e autorização explícita do usuário.
- Se o ambiente não puder garantir a base correta do PR, não improvisar nem direcionar para `main`; informar explicitamente que o destino correto é `feature/pagbank-integration`.
- Não fazer merge automático de trabalho PagBank na `main`.

## Proteção do Asaas e rollback

- A integração PagBank deve entrar ao lado do Asaas.
- Não remover ou inutilizar estruturas Asaas durante a fase de implantação PagBank.
- Empresas existentes não devem ser migradas automaticamente.
- Cada venda permanece vinculada ao gateway que originou sua cobrança.
- Mudanças de banco relacionadas a multi-gateway devem priorizar evolução aditiva e compatível, evitando mudanças destrutivas enquanto Asaas for rede de segurança.
- Reverter código não desfaz pagamentos, webhooks, split ou efeitos externos já executados; por isso alterações financeiras devem permanecer previsíveis, auditáveis e graduais.
