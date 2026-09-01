---
name: smartbus-payment-gateway
description: Auditar, criar, integrar, revisar ou expandir gateways de pagamento no SmartBus BR, incluindo configuração por empresa, checkout, cobrança, confirmação, webhook, idempotência, tickets, split, comissões, segurança, ambientes, reconciliação e diagnóstico. Usar para qualquer provedor (Mercado Pago, PagBank, Stripe, PayPal ou outro) antes de propor ou alterar código; usar também para avaliar capacidade, investigar regressões e planejar coexistência multigateway preservando o Asaas.
---

# Integrar gateways de pagamento no SmartBus

## Princípio obrigatório

Separar sempre:

1. **Regra SmartBus:** requisito de produto, financeiro, segurança ou operação que independe do provedor.
2. **Referência Asaas:** forma comprovada como o código atual atende (ou deixa de atender) ao requisito.
3. **Capacidade do novo gateway:** comportamento confirmado exclusivamente na documentação oficial e atual do provedor.

Nunca traduzir conceitos por nome. `wallet`, recebedor, conta conectada, marketplace e split não são equivalentes presumidos. Registrar `CAPABILITY GAP` quando não houver equivalência comprovada. Interromper antes do código se uma alternativa mudar regra de negócio.

Tratar taxa, divisão, sócio global, representante da empresa, elegibilidade, snapshot, ledger e rastreabilidade financeira como responsabilidades do SmartBus BR. Tratar `walletId`, formatos de split e campos monetários/percentuais como mecanismos do Asaas; um provedor diferente não autoriza mudar silenciosamente a regra SmartBus BR.

## Carregar referências progressivamente

- Ler [references/payment-architecture.md](references/payment-architecture.md) para arquitetura, jornada, inventários, fontes normativas, acoplamentos e riscos.
- Ler [references/configuration-reference.md](references/configuration-reference.md) ao tratar empresa, credenciais, ambiente, onboarding, permissões ou segurança.
- Ler [references/checkout-reference.md](references/checkout-reference.md) ao tratar checkout, venda, cobrança, confirmação ou ticket.
- Ler [references/webhook-reference.md](references/webhook-reference.md) ao tratar webhook, estados, deduplicação, fallback ou reconciliação.
- Ler [references/financial-rules-reference.md](references/financial-rules-reference.md) antes de qualquer mudança que toque taxa, split, sócio, representante, snapshots ou ledger.
- Ler [references/diagnostics-reference.md](references/diagnostics-reference.md) para observabilidade, suporte, auditoria e aceite operacional.
- Usar [references/gateway-checklist.md](references/gateway-checklist.md) como gate obrigatório e modelo de entrega.

## Processo obrigatório

Escolher o modo conforme o pedido. No **modo de análise**, concluir pesquisa, matriz, gaps e decisões antes de alterar código. No **modo de implementação**, avançar somente quando a análise aplicável estiver suficientemente resolvida; reutilizá-la enquanto atual e revalidar apenas fatos sujeitos a mudança.

### 1. Auditar antes de implementar

1. Ler `AGENTS.md` aplicáveis e o estado atual do repositório.
2. Revalidar código, migrations, tipos, PRDs normativos e análises históricas; não confiar apenas nesta fotografia.
3. Mapear o fluxo ponta a ponta e todos os consumidores indiretos de pagamentos.
4. Declarar divergências entre código, documento normativo e histórico; não corrigi-las fora do escopo.
5. Manter inventário de evidências com arquivo, símbolo e, quando útil, migration.

### 2. Pesquisar o provedor antes do código

1. Identificar provedor, produto/API e país/conta aplicáveis.
2. Consultar apenas documentação oficial atual para autenticação, ambientes, métodos, criação/consulta/cancelamento/estorno, idempotência, webhooks e validação de assinatura.
3. Investigar marketplace, recebedores e split sem presumir equivalência com Asaas.
4. Registrar versão/data da documentação, URLs e limitações.
5. Não usar PRDs de um gateway planejado como prova de capacidade atual do provedor.

### 3. Produzir comparação de capacidade

Preencher, antes de propor implementação:

| Responsabilidade SmartBus | Implementação atual Asaas | Novo gateway (evidência oficial) | Compatível | Adaptação necessária | Bloqueio |
|---|---|---|---|---|---|

Classificar cada capacidade do contrato como **obrigatória**, **condicional**, **opcional** ou **específica do Asaas**. Para lacuna, registrar:

```text
CAPABILITY GAP
Requisito SmartBus:
Como o Asaas atende hoje:
O que o novo gateway oferece:
Sem equivalência:
Impacto:
Alternativas:
Decisão humana necessária:
```

### 4. Propor evolução mínima

- Preservar o Asaas e permitir coexistência; nunca substituí-lo implicitamente.
- Centralizar regras SmartBus, mas abstrair somente seams exigidos pelo novo caso comprovado.
- Evitar arquitetura genérica de plugins, refatoração ampla e duplicação antecipada.
- Persistir o gateway e ambiente efetivos na venda; não inferir posteriormente pela configuração corrente da empresa.
- Manter operações críticas e credenciais no backend.
- Planejar migração incremental, rollback, feature flag/piloto e testes de não regressão.

### 4.1 Implementar quando explicitamente solicitado

1. Confirmar que não restam bloqueios relevantes na matriz; não implementar enquanto decisão financeira, segurança ou isolamento estiver pendente.
2. Reutilizar a análise existente e revalidar apenas documentação/capacidades que possam ter mudado e os pontos do repositório tocados pela solução.
3. Alterar incrementalmente somente os seams necessários, preservando todos os gateways existentes e evitando refatoração ampla.
4. Executar testes de regressão dos fluxos existentes e validar o novo gateway ponta a ponta, incluindo configuração, cobrança, confirmação, ticket, financeiro e diagnóstico.
5. Atualizar estas referências somente quando a arquitetura real do SmartBus BR tiver mudado; não reescrever a fotografia por execução.

### 5. Aplicar gates de segurança e consistência

- Vincular toda operação à empresa e validar ownership no backend/RLS.
- Nunca retornar API keys/tokens ao frontend nem registrá-los em logs.
- Falhar fechado em ambiente ausente/incoerente; proibir fallback silencioso entre teste e produção.
- Consumir a decisão central de ambiente do SmartBus BR; nenhum gateway pode decidir ambiente por hostname, domínio, credencial ou `if` próprio. Para uma venda existente, usar sempre o ambiente persistido nela.
- Tratar payload externo como não confiável; validar assinatura/token, referência, empresa, ambiente, valor e transição.
- Exigir idempotência na criação e na finalização, deduplicação de eventos e unicidade de tickets.
- Preservar snapshot financeiro e ledger, inclusive quando o provedor não oferecer split.

### 6. Validar conclusão operacional

Não considerar integrado porque criou uma cobrança. Exigir, no mínimo:

- configuração e validação por tenant/ambiente;
- cobrança correlacionada à venda;
- confirmação por webhook e fallback de consulta;
- convergência idempotente e geração exata de tickets;
- tratamento explícito de cancelamento/estorno/chargeback suportado;
- regras financeiras, snapshot e ledger coerentes;
- diagnóstico por gateway, ambiente, empresa, venda, ID externo, status e histórico;
- reconciliação e runbook de falha;
- testes sandbox e plano controlado de produção.

## Paradas obrigatórias

Parar e pedir decisão humana quando:

- o provedor não reproduzir regra financeira obrigatória;
- houver necessidade de alterar taxa, elegibilidade, divisão, liquidação ou status SmartBus;
- não existir validação segura de webhook e o risco não tiver mitigação aprovada;
- isolamento multiempresa/ambiente não puder ser demonstrado;
- uma cobrança já existente puder ser recriada sem chave idempotente/correlação confiável;
- documentos normativos divergirem sem hierarquia clara.

## Formato mínimo da entrega

Entregar: resumo executivo; mapa atual; inventários visual/técnico/dados/backend; mapa de ambientes e secrets sem valores; jornada checkout→cobrança→confirmação→ticket; webhook/idempotência; financeiro/split/ledger; diagnóstico; dependências Asaas; responsabilidades genéricas; acoplamentos/riscos; contrato conceitual; matriz de capacidades; gaps; plano incremental; testes e decisões humanas pendentes.
