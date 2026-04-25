# Correção mínima — empresa ativa em `/admin/diagnostico-vendas`

## Objetivo

Registrar a correção mínima e segura aplicada na tela `/admin/diagnostico-vendas` para alinhar a query ao contexto visual já exibido no header, eliminando a divergência entre “empresa ativa selecionada” e o recorte real usado pela tela.

## Causa raiz resumida

A análise anterior confirmou que a tela:
- carrega a grade a partir de `sales`;
- renderiza a venda investigada no array final;
- não possui paginação local extra escondendo a linha;
- mas ignorava `activeCompanyId` quando o usuário tinha papel efetivo `developer`.

Isso criava uma inconsistência operacional:
- o header mostrava uma empresa ativa;
- a tela aparentava estar dentro desse contexto;
- porém a query de `/admin/diagnostico-vendas` podia ler dados cross-company apenas por o usuário ser `developer`.

## Arquivo alterado

- `src/pages/admin/SalesDiagnostic.tsx`

## Mudança aplicada

Foram feitos apenas os ajustes mínimos abaixo:

1. removido o uso de `isDeveloper` da tela;
2. a query principal de `sales` agora aplica `company_id = activeCompanyId` sempre que existir empresa ativa;
3. a query de `events` do filtro passou a seguir o mesmo recorte por `activeCompanyId`;
4. os `useEffect` foram simplificados para remover a dependência de `isDeveloper`, já que ela não influencia mais a busca desta tela.

Nenhuma outra parte foi alterada nesta etapa:
- KPIs;
- modal de detalhe;
- filtros existentes;
- regras de `computePaymentStatus`;
- semântica de incidentes;
- layout visual.

## Por que esta é a correção mínima escolhida

Porque ela:
- corrige exatamente a principal fonte de confusão já confirmada;
- mantém a tela coerente com o padrão do admin usado em `Sales`, `SalesReport` e `Events`;
- não cria novo filtro, novo seletor, nova arquitetura ou nova semântica;
- reduz o risco operacional sem mexer nas demais regras de diagnóstico.

## Riscos avaliados

### Baixo risco técnico
A mudança é local e restrita ao recorte de empresa em uma única tela.

### Risco comportamental controlado
Usuários `developer` deixam de ter leitura cross-company implícita nesta rota específica.

Esse risco foi considerado aceitável porque:
- o comportamento anterior já era inconsistente com o contexto visual da UI;
- outras telas administrativas relevantes já respeitam `activeCompanyId`;
- a correção melhora previsibilidade e auditabilidade multiempresa.

## Como validar manualmente

1. Fazer login com o usuário developer/admin.
2. Selecionar no header a empresa `Empresa Padrão (Teste)`.
3. Abrir `/admin/diagnostico-vendas`.
4. Confirmar no network/devtools que a leitura da tela usa `company_id = activeCompanyId`.
5. Confirmar que a listagem mostra apenas vendas da empresa ativa.
6. Trocar para outra empresa no header.
7. Confirmar que a grade e o filtro de eventos passam a refletir apenas a nova empresa ativa.
8. Validar que continuam intactos:
   - KPIs do topo;
   - filtros já existentes;
   - modal de detalhe com `sale_logs` e `sale_integration_logs`.

## Fechamento

A linha de raciocínio corrigida foi simples:
- antes: “developer pode ver cross-company nesta tela, mesmo com empresa ativa exibida”;
- agora: “a tela segue a empresa ativa mostrada pela UI, como já acontece no restante do admin”.
