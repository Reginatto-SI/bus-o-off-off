# Análise 84 — Diagnóstico de responsividade mobile da tela `/representante/painel`

## Escopo e método

- **Escopo avaliado:** estrutura da tela `src/pages/representative/RepresentativeDashboard.tsx`, considerando os blocos atuais (header, compartilhamento, identidade, KPIs, alertas, checklist, indicadores, empresas vinculadas e ledger).
- **Método:** inspeção estrutural do código (grid, breakpoints, densidade de conteúdo, ordem visual, padrões de tabela/filtro/paginação).
- **Importante:** este documento é **somente diagnóstico**; não houve alteração de regra de negócio nem refatoração da tela.
- **Limitação explícita:** sem evidência de captura real em dispositivo no escopo desta análise; portanto, os pontos abaixo são um diagnóstico técnico-UX baseado na implementação atual e no comportamento esperado dos breakpoints.

---

## 1) Diagnóstico geral da responsividade mobile

## O que está bom

1. **A prioridade comercial está no topo da tela**: o card de compartilhamento aparece antes de identidade/KPIs/ledger, o que favorece a ação principal do representante (compartilhar link).  
2. **Empilhamento estrutural base já existe**: vários grids colapsam para 1 coluna no mobile por padrão (`lg:grid-cols-*`, `sm:grid-cols-*`, `md:grid-cols-*`), evitando quebra completa de layout.
3. **Ações de cópia estão claras semanticamente**: os botões nomeiam bem a ação (copiar link/código/mensagem, QR Code), reduzindo ambiguidade.
4. **Estados vazios e alertas ajudam o contexto operacional**: há mensagens de orientação para ausência de empresas/comissões e alertas de wallet/status/filtros.

## O que está ruim

1. **Densidade alta no topo para telas pequenas**: bloco de compartilhamento + identidade + KPI consolidado aparecem sequencialmente com muito texto e múltiplas CTAs, aumentando carga cognitiva na primeira dobra.
2. **Excesso de ações concorrentes no card principal**: quatro botões com pesos semelhantes, sem hierarquia visual forte de CTA primário no mobile.
3. **Uso de tabelas amplas para áreas críticas de consulta** (empresas e ledger) em contexto móvel: tecnicamente responsivo por `overflow-auto`, mas operacionalmente exige rolagem horizontal e leitura fragmentada.
4. **Filtros e paginação do ledger pouco ergonômicos no mobile**: os controles ficam empilhados, mas o conjunto tabela + filtros + paginação ainda fica “denso” para uso rápido em celular.

## O que está parcialmente adequado

1. **KPIs**: existem e funcionam, mas a quantidade e o formato em cards pequenos tende a cansar leitura no mobile quando o usuário busca decisão rápida.
2. **Checklist e indicadores**: úteis, porém o bloco inteiro pode ficar longo em telas pequenas e empurrar conteúdo de consulta (empresas/ledger) para baixo.
3. **Header**: funcional, mas com risco de competição de espaço horizontal (logo + título + nome + botão sair) em dispositivos estreitos.

---

## 2) Problemas encontrados por seção

## Header

### Achados
- Header sticky com logo, rótulo, nome e botão “Sair”; em largura curta, tende a reduzir área útil de leitura do título e pode pressionar alinhamento dos elementos.
- `h1` usa `text-base` no mobile e cresce apenas em `sm:text-lg`, o que preserva compactação, mas pode comprometer destaque do contexto quando há nomes longos.

### Risco mobile
- Saturação horizontal no topo e percepção de “cabecalho pesado” para uma tela orientada à ação imediata.

---

## Compartilhamento comercial

### Achados
- O bloco está corretamente no topo e reforça a ação principal.
- O card combina: texto orientativo, área de código/link e **4 botões** em `flex flex-wrap`.
- O botão primário tem `min-w-40`; os demais não têm largura mínima consistente, o que pode gerar mosaico irregular e padrões de toque heterogêneos.
- O link aparece em linha com `truncate`, preservando layout, porém reduz legibilidade do conteúdo completo no mobile (usuário não valida facilmente o final do link/código de origem).

### Risco mobile
- “Cansaço de decisão” por muitas CTAs equivalentes no mesmo nível visual.
- Touch targets inconsistentes em largura/altura percebida quando os botões quebram em múltiplas linhas.

---

## Identidade do representante

### Achados
- Card claro e objetivo (nome/status/código), sem excesso de campos.
- Em mobile ele desce após o compartilhamento (bom para prioridade da ação comercial).

### Risco mobile
- Baixo risco isolado; principal ponto é **ordem relativa** com outros blocos: dependendo da urgência operacional, pode ser secundário demais ou redundante com o header.

---

## KPIs

### Achados
- Grade de KPI no card consolidado: `grid` com 1 coluna no mobile, 2 em `sm`, 6 em `xl`.
- São 6 cartões com rótulos em `text-xs` e números entre `text-xl`/`text-2xl`.
- Conteúdo é relevante, mas compacto e repetitivo (muitos blocos numéricos na sequência).

### Risco mobile
- Escaneabilidade moderada/baixa quando o usuário precisa “bater o olho”.
- Potencial de fadiga por sequência longa de mini-cards antes de chegar às tabelas de trabalho.

---

## Alertas

### Achados
- Alertas aparecem somente quando existem condições reais (bom).
- Quando múltiplos alertas são acionados, empilham verticalmente e podem ocupar espaço grande no fluxo principal.

### Risco mobile
- Em cenários com 3–5 alertas, conteúdo crítico de ação/consulta desce demais na página.

---

## Checklist operacional

### Achados
- Checklist com 4 itens e badge OK/Pendente está claro.
- Cada item possui título + help text + badge, o que aumenta altura por item.

### Risco mobile
- Bloco visualmente longo; para usuários recorrentes, pode virar “ruído constante” e empurrar informações de resultado (ledger/empresas).

---

## Indicadores simples

### Achados
- Três indicadores de 30 dias em grid (`sm:grid-cols-3`), empilhando em mobile.
- Informação útil, mas competindo com KPIs consolidados e checklist.

### Risco mobile
- Redundância de blocos numéricos (KPIs + indicadores) no topo/meio da página, com ganho marginal de decisão imediata.

---

## Empresas vinculadas

### Achados
- Renderização em `Table` com 3 colunas principais.
- Componente de tabela usa `overflow-auto`, então tecnicamente não quebra layout.
- Mesmo com apenas 3 colunas, o conteúdo da célula “Empresa” inclui nome + linha auxiliar de vendas/comissão, aumentando altura e complexidade da linha.

### Risco mobile
- Leitura por linha fica extensa e exige mais atenção/scroll, especialmente quando há várias empresas.
- Possível necessidade de rolagem horizontal em aparelhos menores + perda de contexto entre colunas.

---

## Ledger de comissões

### Achados
- Bloco contém: 3 filtros (status/período/page size) + tabela com 7 colunas + paginação.
- A tabela de 7 colunas é densa para mobile; `overflow-auto` evita quebra, mas não resolve ergonomia de consulta.
- Paginação no rodapé usa texto de contexto + dois botões laterais, que podem ficar apertados com conteúdos longos de contagem.

### Risco mobile
- Área mais crítica de “responsividade real”: consulta fica tecnicamente possível, porém com fricção alta para uso cotidiano no celular.
- Maior chance de erro de leitura por deslocamento horizontal/vertical combinado.

---

## 3) Lista priorizada de problemas

## Crítico

1. **Ledger em tabela larga (7 colunas) no mobile**, com filtros e paginação em bloco denso; responsivo técnico, baixa usabilidade prática.
2. **Excesso de ações concorrentes no card de compartilhamento** sem hierarquia forte da CTA principal.

## Importante

1. **Acúmulo de blocos no topo** (compartilhamento + identidade + KPIs + alertas + checklist + indicadores) antes de chegar aos dados operacionais.
2. **Empresas vinculadas em formato tabular** com linha densa para leitura móvel.
3. **Checklist e alertas potencialmente longos**, empurrando conteúdo prioritário para baixo.

## Melhoria desejável

1. Ajustes finos de tipografia/espaçamento para escaneabilidade (rótulos `text-xs` em massa, blocos muito próximos em certas transições).
2. Melhor equilíbrio entre informação de contexto e informação acionável na primeira dobra.

---

## 4) Recomendações objetivas de ajuste (mínimo, seguro e consistente)

> Diretriz: reaproveitar componentes e padrões já existentes; sem mudar regra de negócio e sem redesign amplo.

### Problema: Ledger denso em mobile
- **O que ajustar:** manter dados atuais, mas aplicar apresentação mobile-first do ledger (ex.: lista/card por item em `<md`, mantendo tabela para `md+`).
- **Por que ajustar:** tabela de 7 colunas em celular gera fricção alta de leitura e navegação.
- **Impacto esperado:** consulta mais rápida, menos rolagem horizontal, menor erro de interpretação.

### Problema: Excesso de CTAs equivalentes no compartilhamento
- **O que ajustar:** destacar “Copiar link oficial” como CTA dominante e rebaixar ações secundárias (código/mensagem/QR) para distribuição em 2 linhas padronizadas ou menu secundário já existente no projeto (se houver padrão equivalente).
- **Por que ajustar:** reduz carga de decisão e melhora taxa de ação principal no celular.
- **Impacto esperado:** mais clareza de fluxo “abrir painel → copiar link → compartilhar”.

### Problema: Topo longo e pesado
- **O que ajustar:** reordenar blocos no mobile para priorizar ação + resultado imediato (Compartilhamento → KPIs essenciais → Alertas críticos → Empresas/Ledger → demais blocos contextuais).
- **Por que ajustar:** representante móvel precisa rapidez, não leitura extensa inicial.
- **Impacto esperado:** menor tempo até ação e até consulta de resultado.

### Problema: Empresas vinculadas em tabela
- **O que ajustar:** no mobile, transformar linha em card compacto (empresa, status, data, vendas/comissão); manter tabela em telas maiores.
- **Por que ajustar:** melhora escaneabilidade sem alterar origem de dados.
- **Impacto esperado:** leitura mais natural em rolagem vertical.

### Problema: Checklist/alertas empurrando conteúdo
- **O que ajustar:** compactar visualmente (resumo inicial + expansão opcional) mantendo conteúdo intacto.
- **Por que ajustar:** reduz altura ocupada sem perder informação operacional.
- **Impacto esperado:** tela mais leve e menos burocrática no celular.

### Problema: Legibilidade de microtextos
- **O que ajustar:** revisar rótulos críticos que estão em `text-xs` para garantir contraste/tamanho em mobile, especialmente em KPI e metadados de tabela.
- **Por que ajustar:** legibilidade impacta compreensão instantânea.
- **Impacto esperado:** melhor escaneabilidade e menor esforço visual.

---

## 5) Proposta de direção de melhoria (sem implementar)

## Direção estrutural sugerida para mobile

1. **Ordem recomendada dos blocos (`<md`)**
   1) Header compacto  
   2) Compartilhamento comercial (CTA principal dominante)  
   3) KPIs essenciais (2–3 indicadores principais)  
   4) Alertas críticos (wallet/status/bloqueio)  
   5) Empresas vinculadas (lista/card)  
   6) Ledger (lista/card + filtros compactos)  
   7) Checklist e indicadores complementares (colapsáveis)

2. **Empilhamento e grid**
   - Forçar **1 coluna** para blocos compostos em mobile.
   - Manter lado a lado somente a partir de `lg` para preservar leitura.

3. **Colapsos/compactação**
   - Checklist e indicadores com versão resumida por padrão em mobile.
   - Alertas com priorização (primeiro críticos), evitando mural longo no topo.

4. **Tabelas → listas/cards no mobile**
   - Empresas: card de vínculo por empresa.
   - Ledger: card por lançamento com campos em ordem de decisão (comissão, status, data, empresa, venda/base/%).

5. **CTA principal de compartilhamento**
   - “Copiar link oficial” como botão dominante de largura total no mobile.
   - Ações secundárias com hierarquia visual reduzida, mantendo funcionalidade atual.

6. **Toque, espaçamento e legibilidade**
   - Padronizar altura mínima de botões e ritmo de espaçamento entre blocos críticos.
   - Evitar microtexto concentrado em áreas de decisão rápida.

---

## 6) Mapa de ação sugerido

## Etapa 1 — Ajustes estruturais (baixo risco)
- Reordenar blocos no mobile sem alterar dados/regra.
- Garantir sequência orientada a ação principal e consulta rápida.

## Etapa 2 — Blocos principais (compartilhamento + KPIs + alertas)
- Hierarquizar CTA principal.
- Compactar KPIs para visão inicial mais objetiva.
- Priorizar e resumir alertas em mobile.

## Etapa 3 — Empresas e ledger (maior impacto em usabilidade)
- Adaptar apresentação tabular para card/lista em mobile.
- Manter tabela atual para desktop/tablet maior.
- Ajustar filtros/paginação para interação de polegar e leitura vertical.

## Etapa 4 — Polimento final
- Revisão de tipografia, espaçamento e consistência de touch targets.
- Validação prática em 2–3 larguras de referência (ex.: 360, 390, 430 px).

---

## Conclusão executiva

A tela `/representante/painel` já tem avanços importantes de prioridade comercial e base responsiva, mas ainda apresenta sinais claros de **desktop-first adaptado** em pontos críticos de uso móvel (principalmente ledger e densidade geral de blocos). O caminho recomendado não é redesign amplo: é **ajuste incremental de ordem, compactação e apresentação mobile dos dados tabulares**, preservando componentes existentes, regra de negócio e padrão visual do projeto.
