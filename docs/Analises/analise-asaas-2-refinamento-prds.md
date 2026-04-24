# Análise 2 — Refinamento, Numeração e Consolidação dos PRDs Asaas

## 1. Resumo do que foi melhorado
- Documentação Asaas foi reorganizada em ordem oficial numerada (`00` a `06`).
- Cada PRD passou a incluir: **Classificação**, **Regra de ouro**, **O que não cobre**, **Cenários de falha e ação esperada**, **Dúvidas pendentes por categoria** e **Melhorias futuras por categoria**.
- Foi criado índice geral para leitura orientada por criticidade e público.
- Linguagem foi ajustada para uso de Produto, Suporte, Dev, Financeiro e Auditoria, reduzindo ambiguidade.

## 2. Lista dos arquivos criados/renomeados
### Criado
- `/docs/PRD/00-asaas-indice-geral.md`
- `/docs/Analises/analise-asaas-2-refinamento-prds.md`

### Renomeados (com conteúdo refinado)
- `/docs/PRD/prd-asaas-visao-geral.md` -> `/docs/PRD/01-asaas-visao-geral.md`
- `/docs/PRD/prd-asaas-fluxo-checkout-e-venda.md` -> `/docs/PRD/02-asaas-fluxo-checkout-e-venda.md`
- `/docs/PRD/prd-asaas-webhook-e-confirmacao.md` -> `/docs/PRD/03-asaas-webhook-e-confirmacao.md`
- `/docs/PRD/prd-asaas-split-comissoes-e-representantes.md` -> `/docs/PRD/04-asaas-split-comissoes-e-representantes.md`
- `/docs/PRD/prd-asaas-configuracao-empresa-e-validacao.md` -> `/docs/PRD/05-asaas-configuracao-empresa-e-validacao.md`
- `/docs/PRD/prd-asaas-operacao-erros-e-diagnostico.md` -> `/docs/PRD/06-asaas-operacao-erros-e-diagnostico.md`

## 3. Lista dos arquivos antigos substituídos ou mantidos
- **Substituídos por renomeação:** todos os seis PRDs antigos `prd-asaas-*`.
- **Mantido:** `/docs/Analises/analise-asaas-mapeamento-prds.md` (histórico da etapa anterior).
- **Resultado para evitar duplicidade confusa:** nomes antigos dos PRDs não foram mantidos em paralelo.

## 4. Principais mudanças de estrutura
1. Adoção de sequência oficial `00` a `06`.
2. Inclusão de índice geral com criticidade e ordem de leitura.
3. Em todos os PRDs:
   - seção de classificação padronizada;
   - regra de ouro explícita;
   - limites de escopo (`não cobre`);
   - tabela/lista de falhas com ação esperada;
   - dúvidas separadas em produto/financeira/técnica/operacional;
   - melhorias futuras separadas em documentação/produto/suporte/segurança/operação/código.
4. Documento 06 recebeu reforço operacional com **roteiro rápido de suporte** por cenário.

## 5. Pontos de atenção que continuam pendentes
- SLA formal para incidentes de webhook/verify: **não identificado no código atual**.
- Fluxo completo de liquidação de comissão de representante: **não identificado no código atual**.
- Política formal de rollback financeiro de split em chargeback/estorno: **não identificado no código atual**.
- Política formal de rotação de credenciais por empresa/ambiente: **não identificado no código atual**.

## 6. Recomendações para a próxima etapa
- Executar auditoria técnica separada de inconsistências PRD x código (sem alterar produção inicialmente).
- Priorizar cenários críticos: confirmação de pagamento, ticket pós-pagamento e divergência financeira de split.
- Definir com Produto + Financeiro os fluxos pendentes hoje não identificados no código (SLA, chargeback, liquidação de comissão).
- Em seguida, abrir plano de ação técnico incremental com critérios de segurança e operação.

## 7. Confirmação explícita de escopo
**Nenhum código funcional foi alterado nesta tarefa.**

Foram realizadas apenas mudanças documentais (renomeação e refinamento de arquivos Markdown em `docs/PRD` e `docs/Analises`).
