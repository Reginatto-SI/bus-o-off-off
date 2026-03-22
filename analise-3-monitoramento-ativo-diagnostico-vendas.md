# Análise 3 — Monitoramento ativo no diagnóstico de vendas

## Objetivo da etapa
Evoluir a tela `/admin/diagnostico-vendas` para comunicar movimento recente, novidade operacional e percepção de mudança dentro da sessão atual do operador, sem criar monitoramento real-time verdadeiro e sem alterar backend, APIs ou regras reais de negócio.

## Quais sinais de monitoramento foram criados
- prioridade operacional já existente passou a ser combinada com uma nova camada de frescor operacional (`novo`, `recente`, `estavel`)
- banner operacional único com prioridade de mensagem
- resumo de movimento operacional
- foco rápido visual para triagem (`Todos`, `Críticos`, `Novos`, `Em acompanhamento`, `OK`)
- indicação de última mudança percebida na sessão

## Como a noção de novidade foi derivada
- `novo`: item percebido nesta sessão após refresh, usando comparação entre snapshots já mantidos em memória no frontend
- `recente`: venda criada há pouco tempo dentro da janela operacional configurada na tela
- `estavel`: demais itens sem sinal novo na sessão nem criação recente
- a distinção entre `novo` e `recente` existe para não confundir novidade percebida agora com item apenas recente por data

## Como o banner operacional escolhe a mensagem
1. primeiro prioriza críticos que também são novos ou recentes
2. depois críticos já existentes
3. depois itens em atenção
4. por fim estabilidade operacional

## O que mudou visualmente
- cards críticos novos/recentes ganharam destaque adicional discreto
- cards passaram a exibir contexto temporal resumido
- topo da tela agora mostra resumo executivo, resumo de movimento, banner e última mudança percebida
- a listagem ganhou foco rápido por contexto operacional sem substituir filtros existentes
- o detalhe passou a exibir uma timeline operacional derivada do estado atual e dos logs já disponíveis

## O que continua sendo apenas percepção da sessão atual
- identificação de item novo na sessão
- detecção de última mudança percebida
- comparação entre snapshots para dizer se algo mudou desde a última atualização
- nenhuma dessas leituras é persistida em banco nem representa auditoria histórica completa

## Limitações conhecidas desta fase
- não existe stream real-time verdadeiro
- a percepção de mudança depende do refresh da sessão e do recorte visível atual
- a timeline operacional no detalhe é derivada da leitura atual, não de um histórico completo de eventos persistidos

## Próximos passos recomendados
- validar com operação se a janela de `recente` está adequada
- no futuro, integrar alertas reais quando houver trilha persistida suficiente
- evoluir a timeline apenas quando existirem eventos históricos mais confiáveis no backend
