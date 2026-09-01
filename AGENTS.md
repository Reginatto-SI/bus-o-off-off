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

Antes de qualquer tarefa PagBank, confirme a branch `feature/pagbank-integration` e leia, nesta ordem, `docs/pagbank/PAGBANK_IMPLEMENTATION.md`, `.agents/skills/smartbus-payment-gateway/SKILL.md` e `.agents/skills/pagbank-connect/SKILL.md`, incluindo apenas as referências aplicáveis. Reutilize a arquitetura e os componentes existentes; não crie fluxos paralelos de checkout, confirmação, webhook ou diagnóstico quando os atuais puderem ser generalizados. Preserve integralmente o Asaas, não presuma decisões de produto e atualize o checkpoint ao fim de cada sessão PagBank.
