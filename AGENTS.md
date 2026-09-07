Tarefas relacionadas a pagamentos:

1. Consulte sempre:
   .agents/skills/smartbus-payment-gateway/SKILL.md

2. Quando envolver integração direta com a API oficial do PagBank, consulte também:
   .agents/skills/pagbank-official-api/SKILL.md

3. Consulte `.agents/skills/pagbank-connect/SKILL.md` somente quando a tarefa envolver:
   - PB Integrações/PagBank Connect;
   - comparação entre a solução intermediada e a API oficial;
   - manutenção ou auditoria da alternativa intermediada.

4. Autoridade de cada Skill:
   - Smart Bus Payment Gateway define as regras do produto, a arquitetura existente, os fluxos e o comportamento esperado do SmartBus;
   - PagBank Official API define as capacidades e restrições técnicas da integração direta oficial;
   - PagBank Connect documenta somente a solução intermediada da PB Integrações.

5. Não misturar endpoints, Connect Key, payloads ou comportamentos da PB Integrações com a implementação direta da API oficial do PagBank.
6. Nunca substituir uma regra existente do SmartBus apenas porque a documentação de um gateway permite outra implementação.

7. Se existir incompatibilidade entre uma necessidade do SmartBus e uma limitação/regra do gateway, não inventar solução: registrar a incompatibilidade e solicitar decisão antes de alterar o sistema.

## Implementação PagBank

Antes de qualquer tarefa PagBank, leia, nesta ordem:

1. `docs/pagbank/BRANCH_CONTEXT.md`;
2. `docs/pagbank/PAGBANK_IMPLEMENTATION.md`;
3. `.agents/skills/smartbus-payment-gateway/SKILL.md`;
4. `.agents/skills/pagbank-official-api/SKILL.md`;
5. apenas as referências aplicáveis à tarefa atual;
6. `.agents/skills/pagbank-connect/SKILL.md` somente se a tarefa envolver PB Integrações ou comparação entre arquiteturas.

Reutilize a arquitetura e os componentes existentes. Não crie fluxos paralelos de checkout, confirmação, webhook ou diagnóstico quando os atuais puderem ser generalizados. Preserve integralmente o Asaas, não presuma decisões de produto e atualize o checkpoint ao fim de cada sessão PagBank quando houver avanço real.

## Contexto oficial e fluxo de trabalho — atualizado em 2026-09-07

- Repositório: `Reginatto-SI/bus-o-off-off`.
- A base atual de desenvolvimento e integração é `main`, conforme autorização explícita do responsável pelo projeto.
- A antiga exigência de usar `feature/pagbank-integration` foi revogada. Essa branch não é pré-requisito, origem obrigatória nem destino de novos PRs.
- Branches temporárias `codex/*` devem partir da `main` atual e seus PRs devem apontar para `main`.
- Alterações diretas na `main` podem ser feitas quando autorizadas pelo usuário e permitidas pelas proteções do GitHub. Não contornar proteções ou sobrescrever alterações concorrentes.
- A autorização de uma tarefa não concede merge automático permanente para tarefas futuras.
- No Codex Cloud, uma branch local `work` ou a ausência de remoto não bloqueia, por si só, o trabalho. Use o contexto fornecido, o commit disponível e o checkpoint; não exija a referência antiga.
- Referências históricas à branch PagBank em auditorias e sessões anteriores não são instruções vigentes. Este fluxo e `docs/pagbank/BRANCH_CONTEXT.md` prevalecem sobre elas.
- Código presente na `main` não significa PagBank liberado em Produção. Preserve os bloqueios técnicos até homologação e autorização específica de liberação.
- Payment Link, link de pagamento e checkout hospedado PagBank continuam fora do escopo. PIX e cartão seguem o checkpoint vigente.

## Proteção do Asaas e rollback

- A integração PagBank deve entrar ao lado do Asaas.
- Não remover ou inutilizar estruturas Asaas durante a fase de implantação PagBank.
- Empresas existentes não devem ser migradas automaticamente.
- Cada venda permanece vinculada ao gateway que originou sua cobrança.
- Mudanças de banco relacionadas a multi-gateway devem priorizar evolução aditiva e compatível, evitando mudanças destrutivas enquanto Asaas for rede de segurança.
- Reverter código não desfaz pagamentos, webhooks, split ou efeitos externos já executados; por isso alterações financeiras devem permanecer previsíveis, auditáveis e graduais.
