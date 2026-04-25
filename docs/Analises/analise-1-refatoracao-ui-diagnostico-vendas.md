# Análise 1 — Refatoração UI Diagnóstico de Vendas

## Problemas identificados
- Excesso de informação concorrendo na mesma linha da listagem.
- Hierarquia visual fraca entre dados principais, status operacional e ações.
- Coluna `Controle` misturando informação técnica com leitura operacional.
- Redundância de badges e textos repetindo status da venda e do pagamento.
- Controle `Ver apenas problemas` fora do padrão visual dos demais toggles da tela.
- Diagnóstico técnico ocupando espaço da leitura principal em vez de ficar sob demanda.

## Decisões de UX aplicadas
- A listagem principal foi convertida para cards horizontais com 3 blocos: informação principal, status e ação.
- O status central passou a ter um único badge principal, com substatus textual e cor sem duplicidades.
- A ação sugerida ficou resumida no bloco direito, mantendo o menu de ações `...` já existente.
- Os detalhes técnicos foram movidos para um accordion fechado por padrão.
- O toggle `Ver apenas problemas` foi padronizado com os toggles já usados em `Atualizar automaticamente` e `Agrupar por status`.
- O agrupamento visual foi simplificado para `Problemas`, `Pendentes` e `OK`.

## O que foi alterado
- Estrutura visual da listagem principal da rota `/admin/diagnostico-vendas`.
- Distribuição das informações por blocos com menor ruído visual.
- Remoção da coluna visual `Controle` da leitura principal.
- Inclusão de accordion para fluxo, bloqueio, diagnóstico completo e dados relevantes.
- Ajuste no texto do agrupamento para leitura operacional mais direta.

## O que NÃO foi alterado
- Regras de negócio do diagnóstico.
- APIs, consultas Supabase e estrutura de dados.
- Fluxos existentes de detalhes, filtros e menu de ações.
- Cálculos operacionais, categorias e critérios de exibição dos problemas.

## Impacto esperado
- Leitura mais rápida do estado de cada venda.
- Melhor foco em problema vs OK para acompanhamento operacional.
- Redução de ruído visual e de redundância sem perda de rastreabilidade.
- Maior alinhamento visual com o padrão administrativo já usado no sistema.
