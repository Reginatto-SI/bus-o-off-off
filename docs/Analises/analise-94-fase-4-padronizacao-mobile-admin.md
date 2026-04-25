# Fase 4 — Padronização mobile do admin

## 1. Objetivo
Aplicar, de forma controlada e reversível, o padrão mobile validado em `/admin/locais` nas telas administrativas de viabilidade moderada, priorizando compactação, hierarquia de ações e escaneabilidade sem regressão no desktop.

## 2. Tela de referência adotada
A tela `/admin/locais` foi usada como base provisória validada por já consolidar:
- ação principal destacada no topo
- ações secundárias recolhidas no mobile
- KPIs compactos
- melhor leitura por linha e ações mais perceptíveis

A reaplicação nesta fase foi **adaptativa**, não literal.

## 3. Telas trabalhadas
- `/admin/frota` (`src/pages/admin/Fleet.tsx`)
- `/admin/motoristas` (`src/pages/admin/Drivers.tsx`)
- `/admin/parceiros` (rota existente: `src/pages/admin/CommercialPartners.tsx`)
- `/admin/patrocinadores` (`src/pages/admin/Sponsors.tsx`)
- `/admin/usuarios` (`src/pages/admin/Users.tsx`)

## 4. O que foi padronizado por tela
### Frota
- **Problema antes:** no mobile, topo com excesso de ações concorrentes (Excel/PDF + principal) e ações de linha discretas.
- **Ajuste aplicado:** ação principal visível; Excel/PDF foram para menu compacto no mobile; KPIs compactados; célula de ações com affordance discreta.
- **Relação com Locais:** replicado padrão de hierarquia e percepção de ação.
- **Impacto esperado:** menos ruído no topo e leitura mais fluida por linha em celular.

### Motoristas
- **Problema antes:** mesmo padrão de empilhamento no topo e baixa percepção do menu de ações por linha.
- **Ajuste aplicado:** ação principal mantida; exportações em menu secundário no mobile; KPIs mais compactos; reforço visual da célula de ações.
- **Relação com Locais:** reaplicação direta da lógica de prioridade e compacidade.
- **Impacto esperado:** dobra inicial mais eficiente e ações mais descobríveis.

### Parceiros
- **Problema antes:** grade de KPIs extensa no mobile e tabela com excesso de colunas visíveis para leitura rápida.
- **Ajuste aplicado:** KPIs compactados; ocultação progressiva de colunas secundárias (`logo`/`ordem`) no mobile; bloco principal semântico no nome; ações mais perceptíveis.
- **Relação com Locais:** princípio de “primeira célula como foco principal” e ação por linha com melhor pista visual.
- **Impacto esperado:** menos varredura lateral e melhor compreensão de cada linha em viewport pequena.

### Patrocinadores
- **Problema antes:** cenário similar a Parceiros: ruído de colunas no mobile e ações pouco evidentes.
- **Ajuste aplicado:** KPIs compactos; colunas secundárias progressivamente ocultadas; bloco principal com contexto de ordem no mobile; reforço da célula de ações.
- **Relação com Locais:** reaplicação dos mesmos princípios de compactação e hierarquia.
- **Impacto esperado:** tabela mais escaneável e operação mobile mais madura.

### Usuários
- **Problema antes:** topo com disputa de prioridade entre ações; KPIs densos; ações por linha com baixa sinalização no mobile.
- **Ajuste aplicado:** principal visível + exportações em menu compacto no mobile; KPIs com menor altura; reforço visual de ações por linha.
- **Relação com Locais:** mesma lógica de ação primária e redução de ruído.
- **Impacto esperado:** melhor foco operacional sem alterar regras sensíveis de acesso/perfil.

## 5. O que NÃO foi alterado por segurança
- AppLayout
- AdminSidebar
- PageHeader global
- FilterCard base
- Table base global
- Dialog base global
- StatsCard global
- `index.css` global
- backend, regras de negócio, RLS, multiempresa e integrações

## 6. Pontos onde a tela exigiu adaptação própria
- **Parceiros/Patrocinadores:** não havia exportações no topo, então não foi criado menu secundário artificial; foco ficou em compactação de KPIs e semântica da tabela.
- **Usuários:** mantida cautela operacional (status, vínculos, perfil) sem alterar fluxo funcional; somente refinamento visual/local.
- **Frota/Motoristas:** padrão do topo foi alinhado ao de Locais, preservando formulários e fluxo existentes.

## 7. Checklist de regressão desktop
- [ ] Topos mantidos funcionais com ações já existentes.
- [ ] Tabelas preservadas sem quebra de colunas no desktop.
- [ ] Menus de ação por linha continuam operacionais.
- [ ] Modais de criação/edição continuam abrindo/salvando normalmente.
- [ ] Sem regressão de layout em breakpoints `sm`, `md`, `lg`.

## 8. Checklist de validação mobile
- [ ] Ação principal evidente no topo (quando aplicável).
- [ ] Ações secundárias não poluem a dobra inicial (quando aplicável).
- [ ] KPIs mais compactos.
- [ ] Leitura da primeira célula mais informativa.
- [ ] Ações por linha mais perceptíveis sem expor muitos botões.

## 9. Limites atuais do padrão
Ainda **não** deve ser tratado como padrão fechado para telas críticas de alta densidade (ex.: `/admin/vendas`, `/admin/empresa`, `/admin/socios`, programas de benefício e diagnósticos/relatórios analíticos), que exigem estratégia própria por volume de dados e risco operacional.

## 10. Próximos passos recomendados
1. Validar em homologação com usuários admin reais (mobile) para ajuste fino de descobribilidade.
2. Consolidar guideline interno curto para “header mobile admin” por tipo de tela (com/sem exportação).
3. Planejar fase específica para telas críticas com critérios de densidade e segurança operacional.
