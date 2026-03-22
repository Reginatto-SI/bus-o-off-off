# Evolução da Central de Monitoramento Operacional — `/admin/diagnostico-vendas`

## Objetivo

Registrar as melhorias incrementais implementadas na tela `/admin/diagnostico-vendas` para evoluí-la de consulta diagnóstica para painel ativo de monitoramento operacional, mantendo intactas as correções anteriores de empresa, ambiente, filtros, ordenação e race condition.

---

## Melhorias implementadas

### 1. Barra de resumo operacional no topo
Foi adicionado um bloco compacto acima dos filtros com:
- empresa ativa
- ambiente atual
- contexto do período (`Período filtrado` ou `Últimas 100 vendas`)
- total de vendas carregadas
- horário da última atualização

### 2. Auto-refresh controlado
Foi adicionado o toggle `Atualizar automaticamente` com ciclo de 30 segundos.

Regras implementadas:
- não altera filtros
- não interfere no scroll
- pausa quando o modal de detalhe está aberto
- atualiza o timestamp do resumo ao final de cada recarga bem-sucedida

### 3. Destaque visual de problemas por linha
A tabela recebeu destaque visual incremental, sem redesign:
- divergência: borda lateral vermelha suave
- atenção: borda lateral amarela suave
- pagas/canceladas: destaque neutro e discreto
- saudáveis: sem exagero visual

### 4. Agrupamento opcional por status operacional
Foi adicionado o toggle `Agrupar por status`.

Quando ativo:
- a tabela é dividida em blocos
- cada bloco mostra contador
- a ordenação por data continua preservada dentro do grupo

### 5. Filtro rápido “Ver apenas problemas”
Foi adicionado um botão reversível que alterna entre:
- `Ver apenas problemas`
- `Mostrar todos`

O filtro rápido atua apenas sobre a lista já carregada e mantém todos os outros filtros intactos.

### 6. Tempo relativo mais forte
Cada linha passou a exibir também a recência da venda usando leitura humana direta (`há X min`, `há X h`, etc.), sem remover a data/hora completa.

### 7. Indicador de novas vendas
Quando o auto-refresh está ativo:
- vendas novas carregadas após a atualização recebem badge discreto `Nova`
- o destaque é temporário, sem animação agressiva

### 8. Novas ações rápidas no dropdown
Foram adicionadas ações úteis no menu `...`:
- copiar ID da venda
- copiar CPF
- abrir evento relacionado
- recarregar diagnóstico da venda

### 9. Feedback leve do estado do sistema
O topo da tela agora informa mensagens operacionais simples, como:
- quantidade de divergências nas últimas atualizações
- quantidade de itens em atenção
- ausência de problemas nas vendas carregadas

### 10. Preparação visual para o futuro
Foi reservado um espaço visual discreto para:
- alertas em tempo real
- futura integração com stream de webhook/log

Sem backend novo nesta etapa.

---

## Impacto operacional esperado

### Leitura rápida
O operador passa a entender o contexto da tela imediatamente, sem depender da leitura integral dos filtros e da grade.

### Diagnóstico imediato
Com destaque de linha, filtro rápido de problemas e agrupamento opcional, fica mais fácil detectar e priorizar intervenção.

### Monitoramento contínuo
O auto-refresh controlado aproxima a tela de um painel ativo, sem comprometer a investigação manual quando o modal está aberto.

### Suporte mais eficiente
As ações de copiar ID/CPF, abrir evento e recarregar o diagnóstico reduzem atrito operacional em atendimentos e triagens.

---

## Decisões tomadas

### 1. Não alterar as queries base
O auto-refresh reutiliza `fetchSales()` já existente. Não houve troca de arquitetura nem duplicação de lógica.

### 2. Manter `limit(100)`
O recorte operacional das últimas 100 vendas foi preservado e continua explícito na UI.

### 3. Agrupamento opcional, não padrão
A lista continua aberta no modo tradicional por padrão, preservando o comportamento anterior para quem já opera a tela no formato atual.

### 4. Filtro rápido é reversível e local
`Ver apenas problemas` atua sobre o dataset já carregado, sem mexer silenciosamente nos filtros principais.

### 5. Auto-refresh respeita investigação ativa
Quando o modal de detalhe está aberto, a atualização automática pausa para evitar sobrescrever o contexto de análise do operador.

---

## Pontos preparados para evolução futura

### 1. Alertas em tempo real
O espaço visual reservado no topo permite conectar alertas futuros sem quebrar a estrutura atual.

### 2. Stream de webhook/log
A tela agora já se comporta como monitor operacional; isso facilita uma futura evolução para eventos em tempo real quando o backend estiver pronto.

### 3. Estratégias futuras de triagem
O agrupamento opcional e o filtro rápido criam a base visual para próximos incrementos, como níveis de criticidade e filas operacionais.

---

## Checklist de validação

- [ ] auto-refresh funcionando sem quebrar filtros
- [ ] não perde contexto ao atualizar
- [ ] agrupamento funciona corretamente
- [ ] filtro “problemas” funciona e é reversível
- [ ] novas vendas aparecem corretamente
- [ ] nenhuma regressão na listagem original
- [ ] desempenho continua rápido (<200ms ideal, validar em ambiente real)
- [ ] modal aberto pausa atualização automática
- [ ] ações rápidas do dropdown funcionam corretamente

---

## Resultado desta etapa

A tela `/admin/diagnostico-vendas` passa a operar como uma **Central de Monitoramento Operacional de Vendas** com:
- contexto imediato no topo
- monitoramento contínuo controlado
- destaque de problemas
- agrupamento opcional
- suporte rápido por ações auxiliares
- preparação visual para evolução futura
