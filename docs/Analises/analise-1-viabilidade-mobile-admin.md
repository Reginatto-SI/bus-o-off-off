# Análise de viabilidade mobile do admin Smartbus BR

## 1. Objetivo da análise
Avaliar, com base nas telas administrativas reais já implementadas no projeto, a viabilidade de uso em celular **sem converter o admin para mobile-first**. O desktop permanece como referência principal, e o mobile deve atingir usabilidade razoável para consulta e ações rápidas.

## 2. Premissas adotadas
- Escopo baseado nas rotas administrativas ativas em `src/App.tsx` (`/admin/...`).
- Estrutura visual/funcional consolidada do admin foi tratada como base (AppLayout com sidebar/header, PageHeader, KPI cards, FilterCard, tabelas e ações por `...`).
- Sem proposta de arquitetura nova, sem fluxos paralelos e sem quebra de padrão existente.
- Multiempresa (`company_id`) e consistência operacional são premissas não negociáveis.
- Classificação considera uso real em telas com dados densos, formulários longos, modais e relatórios.

## 3. Critérios de avaliação
Classificação por tela:
- **A — Alta viabilidade mobile:** adaptação simples, perda operacional baixa.
- **B — Viabilidade moderada:** funciona bem com ajustes relevantes de responsividade/organização.
- **C — Viabilidade parcial:** boa para consulta e ações rápidas; operação intensa deve ficar no desktop.
- **D — Baixa viabilidade:** uso pleno em celular é inadequado; ideal limitar escopo no mobile.

Critérios usados em cada tela:
1. Densidade de informação (tabela, KPI, blocos técnicos/financeiros).
2. Complexidade de entrada (formulários, validações, múltiplas abas).
3. Dependência de visão horizontal ampla.
4. Necessidade de precisão operacional (ações em lote, reconciliação, diagnóstico).
5. Frequência provável de uso em mobilidade (consulta rápida vs. operação pesada).

## 4. Mapeamento das telas administrativas encontradas
Rotas administrativas identificadas:
- `/admin/dashboard`
- `/admin/eventos`
- `/admin/eventos/:id`
- `/admin/frota`
- `/admin/motoristas`
- `/admin/auxiliares-embarque`
- `/admin/locais`
- `/admin/vendedores`
- `/admin/vendas`
- `/admin/usuarios`
- `/admin/empresa`
- `/admin/indicacoes`
- `/admin/minha-conta`
- `/admin/patrocinadores`
- `/admin/socios`
- `/admin/parceiros`
- `/admin/programas-beneficio`
- `/admin/programas-beneficio/novo`
- `/admin/programas-beneficio/:id`
- `/admin/relatorios/vendas`
- `/admin/relatorios/eventos`
- `/admin/relatorios/comissao-vendedores`
- `/admin/relatorios/lista-embarque`
- `/admin/templates-layout`
- `/admin/diagnostico-vendas`

## 5. Classificação de viabilidade por tela

### 5.1 `/admin/dashboard`
- **Objetivo:** visão executiva/operacional com KPIs e gráficos.
- **Tipo:** dashboard.
- **Principais elementos:** header com ações, filtros de período, cards KPI, gráficos, cards de ação rápida, popup de onboarding.
- **Riscos no celular:** excesso de blocos na dobra, perda de comparação lateral entre métricas.
- **Viabilidade:** **B**.
- **Motivo:** leitura funciona bem no mobile, mas com necessidade de empilhamento e priorização de blocos.
- **Regra geral vs específico:** majoritariamente regra geral.
- **Recomendação mobile:** KPIs em 1–2 colunas, gráficos em altura reduzida e ordem “métricas principais → tendências → detalhes”.

### 5.2 `/admin/eventos`
- **Objetivo:** CRUD operacional completo de eventos/viagens/configurações.
- **Tipo:** listagem + cadastro operacional.
- **Principais elementos:** filtros, KPIs, tabela/lista, ações por linha (`...`), diálogos e abas extensas no formulário.
- **Riscos no celular:** alta densidade de campos e configurações, risco de erro em edição extensa.
- **Viabilidade:** **C**.
- **Motivo:** consulta e ajustes rápidos são viáveis; criação/edição completa é pesada no celular.
- **Regra geral vs específico:** precisa de regra geral + tratamentos específicos em formulário por abas.
- **Recomendação mobile:** priorizar consulta, status, publicação e ações rápidas; edição profunda preferencialmente desktop.

### 5.3 `/admin/eventos/:id`
- **Objetivo:** detalhamento operacional de um evento (viagens, locais, vendas).
- **Tipo:** single-record operacional.
- **Principais elementos:** tabs, tabelas internas, cards e diálogos de manutenção.
- **Riscos no celular:** leitura de múltiplas seções com tabelas, navegação longa vertical.
- **Viabilidade:** **C**.
- **Motivo:** bom para consulta de contexto e intervenções curtas; manutenção ampla tende a fricção alta.
- **Regra geral vs específico:** exige tratamento específico de tabs e tabelas internas.
- **Recomendação mobile:** foco em consulta + pequenas correções; operações de estrutura do evento no desktop.

### 5.4 `/admin/frota`
- **Objetivo:** cadastro e gestão de veículos.
- **Tipo:** listagem + cadastro.
- **Principais elementos:** KPI cards, filtros, tabela com ações, modal com abas de formulário.
- **Riscos no celular:** formulário técnico extenso em modal.
- **Viabilidade:** **B**.
- **Motivo:** padrão repetível e previsível; precisa apenas de boa quebra de layout.
- **Regra geral vs específico:** quase todo por regra geral.
- **Recomendação mobile:** tabela em cards por linha + modal em coluna única mantendo abas.

### 5.5 `/admin/motoristas`
- **Objetivo:** cadastro/gestão de motoristas.
- **Tipo:** listagem + cadastro.
- **Principais elementos:** KPIs, filtros, tabela, modal com campos de cadastro e ações por linha.
- **Riscos no celular:** perda de contexto com muitas colunas e múltiplas ações.
- **Viabilidade:** **B**.
- **Motivo:** semelhante a Frota; fluxo é administrável com adaptação padrão.
- **Regra geral vs específico:** regra geral.
- **Recomendação mobile:** ocultar colunas secundárias e manter ações no menu `...`.

### 5.6 `/admin/auxiliares-embarque`
- **Objetivo:** gestão de auxiliares operacionais.
- **Tipo:** listagem + cadastro operacional.
- **Principais elementos:** KPIs, filtros, tabela, modal com tabs, exportações.
- **Riscos no celular:** cadastro multiaba em espaço reduzido.
- **Viabilidade:** **B**.
- **Motivo:** complexidade moderada e fluxo similar aos demais cadastros.
- **Regra geral vs específico:** regra geral com ajuste leve em tabs.
- **Recomendação mobile:** priorizar listagem/ativação rápida; edição completa com cuidado de usabilidade.

### 5.7 `/admin/locais`
- **Objetivo:** cadastro de pontos de embarque.
- **Tipo:** listagem + cadastro.
- **Principais elementos:** filtros, KPIs, tabela, modal com formulário.
- **Riscos no celular:** campos de endereço/descrição mais longos.
- **Viabilidade:** **A**.
- **Motivo:** complexidade baixa a moderada e operação direta.
- **Regra geral vs específico:** regra geral.
- **Recomendação mobile:** manter CRUD praticamente completo no celular.

### 5.8 `/admin/vendedores`
- **Objetivo:** gestão de vendedores, comissão e vínculo operacional.
- **Tipo:** listagem + cadastro.
- **Principais elementos:** KPIs, filtros, tabela, modal com tabs, exportações.
- **Riscos no celular:** mistura de dados cadastrais e comerciais em formulário maior.
- **Viabilidade:** **B**.
- **Motivo:** funcional no mobile com ajustes estruturais clássicos.
- **Regra geral vs específico:** regra geral.
- **Recomendação mobile:** manter criação/edição mínima e consulta diária completa.

### 5.9 `/admin/vendas`
- **Objetivo:** operação de vendas, suporte, ajustes e ações financeiras.
- **Tipo:** operacional.
- **Principais elementos:** filtros extensos, KPIs, tabela densa, ações por linha, modais/alertas, blocos financeiro/operação.
- **Riscos no celular:** alta criticidade + risco de erro de operação por baixa visibilidade.
- **Viabilidade:** **C**.
- **Motivo:** excelente para consulta e intervenções rápidas; gestão intensa deve permanecer desktop.
- **Regra geral vs específico:** requer tratamento específico para ações críticas.
- **Recomendação mobile:** consulta + ações seguras de baixo risco; operações sensíveis priorizadas no desktop.

### 5.10 `/admin/usuarios`
- **Objetivo:** gestão de acessos/perfis de usuário.
- **Tipo:** configuração + cadastro.
- **Principais elementos:** KPIs, filtros, tabela, modal com abas, ações por linha.
- **Riscos no celular:** erro de permissão por interação rápida em tela pequena.
- **Viabilidade:** **B**.
- **Motivo:** tela estruturada e previsível, mas sensível por impacto de permissões.
- **Regra geral vs específico:** regra geral com atenção às confirmações.
- **Recomendação mobile:** edição pontual viável; revisões amplas de acesso preferir desktop.

### 5.11 `/admin/empresa`
- **Objetivo:** configuração institucional da empresa (dados, identidade e parâmetros).
- **Tipo:** configuração (single-record).
- **Principais elementos:** tabs, formulários longos, upload, seções institucionais/financeiras.
- **Riscos no celular:** formulário extenso com diversos contextos, risco de navegação cansativa.
- **Viabilidade:** **C**.
- **Motivo:** manutenção completa em celular é pesada; porém consulta e ajustes básicos são viáveis.
- **Regra geral vs específico:** exige tratamento específico em organização por blocos.
- **Recomendação mobile:** permitir edição essencial (contato, dados básicos), deixar ajustes estruturais para desktop.

### 5.12 `/admin/indicacoes`
- **Objetivo:** acompanhamento de indicações e progresso/ganhos.
- **Tipo:** dashboard + listagem.
- **Principais elementos:** KPIs, filtros, tabela, cards de resumo e modal de detalhe.
- **Riscos no celular:** leitura de tabela com colunas financeiras.
- **Viabilidade:** **A**.
- **Motivo:** fluxo predominantemente de consulta e acompanhamento.
- **Regra geral vs específico:** regra geral.
- **Recomendação mobile:** alta prioridade para disponibilizar consulta completa.

### 5.13 `/admin/minha-conta`
- **Objetivo:** gestão de perfil e segurança do usuário logado.
- **Tipo:** single-record configuração.
- **Principais elementos:** tabs, formulário pessoal, diálogo de senha.
- **Riscos no celular:** baixos.
- **Viabilidade:** **A**.
- **Motivo:** escopo individual, baixa densidade comparado ao restante do admin.
- **Regra geral vs específico:** regra geral.
- **Recomendação mobile:** manter edição completa no celular.

### 5.14 `/admin/patrocinadores`
- **Objetivo:** cadastro e gestão de patrocinadores.
- **Tipo:** listagem + cadastro.
- **Principais elementos:** KPIs, filtros, tabela, modal com tabs, alertas de confirmação.
- **Riscos no celular:** upload/mídia e campos descritivos podem alongar o fluxo.
- **Viabilidade:** **B**.
- **Motivo:** operação padrão de cadastro, com complexidade moderada.
- **Regra geral vs específico:** regra geral.
- **Recomendação mobile:** manter CRUD com adaptação padrão; ações destrutivas com confirmação clara.

### 5.15 `/admin/socios`
- **Objetivo:** configuração de sócios e split financeiro.
- **Tipo:** configuração financeira.
- **Principais elementos:** tabela, modal/formulário, seleção de parâmetros financeiros.
- **Riscos no celular:** impacto financeiro e necessidade de precisão alta.
- **Viabilidade:** **C**.
- **Motivo:** tecnicamente adaptável, mas criticidade recomenda uso cuidadoso.
- **Regra geral vs específico:** precisa regra específica para confirmação/validação.
- **Recomendação mobile:** consulta e ajustes mínimos; mudanças complexas preferir desktop.

### 5.16 `/admin/parceiros`
- **Objetivo:** cadastro de parceiros comerciais.
- **Tipo:** listagem + cadastro.
- **Principais elementos:** KPIs, filtros, tabela, modal com tabs e confirmações.
- **Riscos no celular:** moderados, sem densidade extrema.
- **Viabilidade:** **B**.
- **Motivo:** padrão recorrente de CRUD com esforço previsível.
- **Regra geral vs específico:** regra geral.
- **Recomendação mobile:** operação quase completa viável.

### 5.17 `/admin/programas-beneficio`
- **Objetivo:** gestão de programas de benefício.
- **Tipo:** listagem + controle de regras.
- **Principais elementos:** KPIs, filtros, tabela, ações por linha, exportações.
- **Riscos no celular:** leitura de regras/estado de benefício em tabela.
- **Viabilidade:** **B**.
- **Motivo:** listagem administrável; complexidade maior fica no editor detalhado.
- **Regra geral vs específico:** regra geral.
- **Recomendação mobile:** consulta/listagem e ativação básica com boa viabilidade.

### 5.18 `/admin/programas-beneficio/novo` e `/admin/programas-beneficio/:id`
- **Objetivo:** criar/editar programa com regras, eventos vinculados e elegibilidade por CPF.
- **Tipo:** cadastro complexo.
- **Principais elementos:** tabs, formulários extensos, tabelas internas, diálogos e ações contextuais.
- **Riscos no celular:** alta densidade de configuração e risco de erro sem visão ampla.
- **Viabilidade:** **D**.
- **Motivo:** uso pleno no celular tende a comprometer precisão operacional.
- **Regra geral vs específico:** necessita tratamento específico forte.
- **Recomendação mobile:** permitir consulta e microedições; criação/edição completa recomendada no desktop.

### 5.19 `/admin/relatorios/vendas`
- **Objetivo:** análise executiva e detalhada de vendas.
- **Tipo:** relatório financeiro/operacional.
- **Principais elementos:** KPIs, filtros avançados, tabs (resumo/detalhado), tabela densa, exportação.
- **Riscos no celular:** leitura densa e comparação de colunas/valores.
- **Viabilidade:** **C**.
- **Motivo:** ótimo para consulta rápida de indicadores, ruim para análise profunda contínua.
- **Regra geral vs específico:** exige tratamento específico para visualização dos detalhes.
- **Recomendação mobile:** priorizar resumo e KPIs; detalhamento avançado como secundário.

### 5.20 `/admin/relatorios/eventos`
- **Objetivo:** análise de desempenho por evento.
- **Tipo:** relatório.
- **Principais elementos:** filtros, KPIs, tabs, tabela (resumo/detalhado/ocupação), exportação.
- **Riscos no celular:** múltiplos cortes analíticos em pouco espaço.
- **Viabilidade:** **C**.
- **Motivo:** boa consultabilidade, baixa ergonomia para análise extensa.
- **Regra geral vs específico:** específico em tabs e visualização analítica.
- **Recomendação mobile:** consulta de status e números-chave; exploração completa no desktop.

### 5.21 `/admin/relatorios/comissao-vendedores`
- **Objetivo:** apuração e conferência de comissão.
- **Tipo:** relatório financeiro.
- **Principais elementos:** filtros, KPIs, tabs, tabela detalhada, exportações.
- **Riscos no celular:** alto risco de interpretação incorreta de valores/totais.
- **Viabilidade:** **C**.
- **Motivo:** adequado para acompanhamento rápido, não ideal para fechamento operacional.
- **Regra geral vs específico:** precisa tratamento específico para tabela financeira.
- **Recomendação mobile:** visão resumida como padrão; fechamento e conferência fina no desktop.

### 5.22 `/admin/relatorios/lista-embarque`
- **Objetivo:** operação/geração de manifesto de embarque com pré-visualização.
- **Tipo:** relatório operacional crítico.
- **Principais elementos:** filtros de evento/viagem, preview, geração de PDF, dialog.
- **Riscos no celular:** conferência operacional detalhada pode ficar limitada em tela pequena.
- **Viabilidade:** **B**.
- **Motivo:** fluxo enxuto e orientado a geração/consulta, com complexidade controlada.
- **Regra geral vs específico:** regra geral com ajuste no preview.
- **Recomendação mobile:** manter consulta e geração; conferência extensa ideal no desktop.

### 5.23 `/admin/templates-layout`
- **Objetivo:** catálogo oficial de templates de layout.
- **Tipo:** configuração técnica.
- **Principais elementos:** filtros, tabela, tabs, formulários e confirmações.
- **Riscos no celular:** campos técnicos e organização de template exigem contexto amplo.
- **Viabilidade:** **C**.
- **Motivo:** viável para consulta e edição simples; manutenção detalhada é menos confortável.
- **Regra geral vs específico:** precisa ajustes específicos em edição.
- **Recomendação mobile:** consulta e pequenas alterações; modelagem de template no desktop.

### 5.24 `/admin/diagnostico-vendas`
- **Objetivo:** diagnóstico técnico de vendas/pagamentos/integridade operacional.
- **Tipo:** diagnóstico técnico-operacional.
- **Principais elementos:** filtros avançados, tabs, accordions, cards, ações contextuais, conteúdo técnico denso.
- **Riscos no celular:** alta densidade cognitiva e necessidade de leitura minuciosa.
- **Viabilidade:** **D**.
- **Motivo:** tela crítica e investigativa; mobile atende suporte emergencial, não operação analítica profunda.
- **Regra geral vs específico:** exige tratamento específico forte.
- **Recomendação mobile:** uso focado em consulta emergencial e ações pontuais; investigação completa no desktop.

## 6. Padrões globais viáveis para o admin mobile
Validação dos padrões propostos com base no admin atual:

1. **Sidebar em drawer/off-canvas no celular — viável e já alinhado ao padrão atual.**
2. **Tabelas virando cards por linha (quando necessário) — viável para CRUDs de cadastro (frota, motoristas, locais, vendedores etc.).**
3. **Ocultação de colunas secundárias no mobile — altamente recomendada em quase todos os relatórios/listagens.**
4. **Ações por linha no menu `...` — manter padrão atual, bom para reduzir ruído visual.**
5. **Filtros recolhidos/expansíveis — recomendável como padrão global para reduzir altura inicial.**
6. **KPIs em grid 1 ou 2 colunas — viável e suficiente para dashboard/relatórios.**
7. **Modais com abas mantidos, mas com empilhamento melhor — viável; essencial para não quebrar o padrão existente.**
8. **Formulários multi-coluna do desktop em coluna única no mobile — viável e desejável em praticamente todas as telas de cadastro.**
9. **Áreas densas com blocos recolhíveis/abas — viável para telas longas (empresa, editor de benefício, diagnóstico).**
10. **Headers administrativos compactos no mobile — viável e importante para ganho de área útil.**

## 7. Exceções e telas que exigem tratamento específico
- **Editor de Programa de Benefício (`/admin/programas-beneficio/novo` e `/:id`)**: exige simplificação de percurso no mobile, não apenas quebra de grid.
- **Diagnóstico de Vendas (`/admin/diagnostico-vendas`)**: conteúdo técnico de alta densidade; precisa priorização explícita de blocos críticos.
- **Vendas (`/admin/vendas`)**: ações sensíveis financeiras/operacionais exigem fluxo de confirmação robusto e foco em ações de baixo risco no mobile.
- **Relatórios financeiros (`/admin/relatorios/*`)**: requerem versão mobile priorizando resumo em vez de detalhamento completo contínuo.
- **Empresa (`/admin/empresa`)**: tela com configuração extensa; precisa recorte claro do que é edição essencial no celular.

## 8. Telas que podem ser apenas parcialmente operáveis no mobile
Recomendação clara de “consulta + ação rápida”, sem pretensão de equivalência total:
- `/admin/eventos`
- `/admin/eventos/:id`
- `/admin/vendas`
- `/admin/empresa`
- `/admin/socios`
- `/admin/programas-beneficio/novo`
- `/admin/programas-beneficio/:id`
- `/admin/relatorios/vendas`
- `/admin/relatorios/eventos`
- `/admin/relatorios/comissao-vendedores`
- `/admin/templates-layout`
- `/admin/diagnostico-vendas`

## 9. Estratégia recomendada por fases

### Fase 1 — Base global de responsividade (alto impacto transversal)
- Consolidar regras globais de mobile no AppLayout/admin (header compacto, filtros recolhíveis, colunas secundárias ocultáveis, padrões de tabela/cards).
- Garantir consistência visual única (sem criar variantes paralelas por tela).

### Fase 2 — Telas A (ganho rápido com baixo risco)
- Priorizar: `/admin/locais`, `/admin/minha-conta`, `/admin/indicacoes`.
- Entregar experiência quase completa em celular.

### Fase 3 — Telas B (ajustes importantes sem redesign estrutural)
- Priorizar: `/admin/dashboard`, `/admin/frota`, `/admin/motoristas`, `/admin/auxiliares-embarque`, `/admin/vendedores`, `/admin/parceiros`, `/admin/patrocinadores`, `/admin/programas-beneficio`, `/admin/usuarios`, `/admin/relatorios/lista-embarque`.
- Ajustar densidade, hierarquia e empilhamento.

### Fase 4 — Telas C (uso parcial orientado)
- Definir explicitamente o “escopo mobile recomendado” para cada tela (consulta, alteração leve, aprovação rápida).
- Manter operações pesadas e conferências profundas no desktop.

### Fase 5 — Telas D (decisão executiva de limitação)
- `/admin/programas-beneficio/novo`, `/admin/programas-beneficio/:id`, `/admin/diagnostico-vendas`.
- Decidir formalmente: limitar uso mobile a consulta e microedições, com indicação explícita quando a tarefa ideal é desktop.

## 10. Conclusão executiva
- **O admin como um todo é viável no mobile?**
  - **Sim, de forma seletiva e orientada por tarefa**, não como equivalência total ao desktop.
- **A adaptação deve ser total ou seletiva?**
  - **Seletiva.** Tentar equivalência completa aumentaria risco operacional e custo sem retorno proporcional.
- **Quais telas devem ser priorizadas?**
  - Primeiro telas A/B com padrão repetível (cadastros e painéis de consulta).
- **Quais telas devem ter expectativa mais limitada no celular?**
  - Diagnóstico técnico, editor avançado de benefícios, vendas e relatórios financeiros detalhados.

## Checklist final da análise
- [x] A análise usou telas reais do projeto.
- [x] A análise evitou abstração genérica e conectou recomendações às rotas reais.
- [x] A classificação por tela está objetiva (A/B/C/D).
- [x] Existem recomendações práticas por tela.
- [x] Ficou claro o que pode seguir regra geral.
- [x] Ficou claro o que precisa exceção.
- [x] Ficou claro o que vale e o que não vale adaptar profundamente para mobile.
