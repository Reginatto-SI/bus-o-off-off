# Análise — `/admin/programas-beneficio`

## 1. Resumo executivo

A tela atual concentra, dentro de um único modal com abas, **cadastro do programa**, **vínculo com eventos** e **operação completa de CPFs elegíveis** (cadastro manual, edição, remoção, ativação/inativação, importação CSV/XLSX e busca/listagem). Essa densidade funcional, somada à altura útil limitada do dialog (`90vh`) e à presença de múltiplas áreas com scroll, caracteriza um fluxo **operacional pesado** para popup.

Conclusão: para este caso específico, a melhor direção é **criar tela dedicada para o CRUD principal** e remover o modal como ponto central de edição.

---

## 2. Estrutura atual encontrada

### 2.1 Página base e rota
- A rota administrativa existe em `App.tsx` como `/admin/programas-beneficio`.
- A página é `src/pages/admin/BenefitPrograms.tsx`.
- O layout segue `AdminLayout`, `PageHeader`, `StatsCard`, `FilterCard`, tabela e `ActionsDropdown`, consistente com padrão admin.

### 2.2 Fluxo atual de create/edit
- Botão **Adicionar Programa** abre um `Dialog`.
- Ações da tabela (`Editar`, `Gerenciar CPFs elegíveis`, `Gerenciar eventos vinculados`) também abrem o mesmo dialog em abas específicas.
- O formulário está todo dentro do modal com `Tabs`:
  - `dados`
  - `eventos`
  - `cpfs`

### 2.3 Estrutura do modal
- `DialogContent` com classes: `h-[90vh] max-h-[90vh] w-[95vw] max-w-6xl`.
- Estrutura vertical:
  1. Header fixo visual (`admin-modal__header`)
  2. Tabs list (`admin-modal__tabs`)
  3. Body com `flex-1 overflow-y-auto`
  4. Footer fixo visual (`admin-modal__footer`) com ações de salvar/cancelar.

### 2.4 Componentes e responsabilidades dentro das abas

#### Aba “Dados do programa”
- Nome, descrição, status, tipo de benefício, valor, abrangência (todos os eventos ou não), vigência inicial/final.

#### Aba “Eventos”
- Quando não é “todos os eventos”, mostra:
  - card com seleção de eventos da empresa (lista com checkbox e scroll interno)
  - card com eventos vinculados.

#### Aba “CPFs elegíveis”
- Bloco 1: cadastro/edição manual de CPF elegível com vigência/status/observação.
- Bloco 2: importação em massa CSV/XLSX + download de template + colagem rápida + resumo da importação.
- Bloco 3: listagem operacional de CPFs com busca, tabela, ações por linha (editar, ativar/inativar, remover).

### 2.5 CRUD e multiempresa (`company_id`)
- Leitura de programas: filtro por `company_id`.
- Criação/edição de programa: payload com `company_id`; update também com filtro por `company_id`.
- Vínculo com eventos: delete/insert com `company_id`.
- CPFs elegíveis: insert/update/delete/upsert sempre com `company_id`.
- Exclusão de programa não existe como ação explícita; o controle operacional principal é ativar/inativar.

---

## 3. Problemas de front e UX encontrados

## 3.1 Altura útil e scroll excessivo no modal
- O modal ocupa `90vh`, mas parte relevante da altura é consumida por header + tabs + footer + paddings.
- Sobra uma área útil reduzida para conteúdo muito denso, especialmente na aba CPFs.
- Em desktop padrão (ex.: 1366x768), a área efetiva da aba tende a ficar apertada para executar fluxo completo sem rolagem frequente.

## 3.2 Múltiplos scrolls concorrentes
- Scroll principal do body (`overflow-y-auto` no container da aba).
- Scroll interno em listas específicas (`max-h-72 overflow-auto`) na seleção de eventos e na tabela de CPFs.
- Resultado: experiência de navegação fragmentada (scroll da página/modal + scroll do bloco interno), aumentando fricção.

## 3.3 Alta densidade funcional em popup
- A aba CPFs concentra tarefas de natureza operacional contínua (cadastro, edição, importação, auditoria rápida por busca/status).
- Isso extrapola o perfil ideal de “edição rápida contextual” típico de modal.

## 3.4 Organização por abas ajuda, mas não resolve sobrecarga
- As abas segmentam o conteúdo, porém não reduzem o volume funcional total por sessão.
- O usuário precisa alternar abas para concluir configurações relacionadas (dados, eventos e elegibilidade), mantendo carga cognitiva alta em um contexto espacial limitado.

## 3.5 Risco de campos críticos “fora da dobra”
- No fluxo CPFs, ações e feedbacks importantes (botão de adicionar, resumo de importação, tabela e ações por linha) competem por espaço vertical.
- Há probabilidade alta de o usuário precisar rolar várias vezes para completar tarefas simples de manutenção.

---

## 4. Complexidade funcional do cadastro

Classificação: **cadastro pesado (estrutural + operacional)**.

Motivos:
1. **Núcleo estrutural do programa**: tipo, valor, vigência, status, escopo de aplicação por eventos.
2. **Dependência relacional com eventos**: vínculo N:N com manutenção por seleção.
3. **Elegibilidade por CPF em escala**:
   - manutenção unitária;
   - importação em massa (arquivo);
   - importação por colagem;
   - validações de CPF e vigência;
   - prevenção de duplicidade;
   - status por CPF;
   - listagem com busca e ações por linha.
4. **Uso operacional recorrente** (não só cadastro inicial): ajustes frequentes em CPFs e status.

Isso não é apenas um “formulário simples”; é um mini-submódulo de administração com regras e operação contínua.

---

## 5. Comparativo de alternativas

## 5.1 Manter modal

### Vantagens
- Menor alteração estrutural inicial.
- Mantém padrão já usado em vários CRUDs do admin.
- Menor impacto de roteamento no curto prazo.

### Desvantagens
- Limitação física do viewport do dialog para volume atual de conteúdo.
- Experiência com rolagem excessiva e múltiplos scrolls.
- Continua concentrando responsabilidades operacionais pesadas em popup.

### Riscos de UX
- Perda de contexto ao alternar abas e navegar em blocos longos.
- Aumento de erros operacionais por interface comprimida.
- Baixa eficiência para manutenção de CPFs em volume.

### O que precisaria corrigir para funcionar bem
- Reprojeto de densidade da aba CPFs (provavelmente quebrando fluxo em etapas internas).
- Revisão de alturas, sticky sections e redução de áreas concorrentes de scroll.
- Rebalanceamento de layout para desktop padrão.

### Alinhamento ao padrão do projeto
- Parcialmente alinhado (uso de modal com abas), **mas no limite** da proposta original de modal.
- O esforço para “salvar o modal” pode crescer e ficar próximo (ou maior) ao esforço de migrar para tela dedicada.

---

## 5.2 Criar tela dedicada

### Vantagens
- Mais espaço útil e previsibilidade visual para fluxo pesado.
- Melhor separação entre:
  - configuração estrutural do programa;
  - operação diária de CPFs/eventos.
- Redução de scroll concorrente e aumento de legibilidade.
- Melhora manutenção e escalabilidade da feature sem mudar regra de negócio.

### Desvantagens
- Exige criação de rotas e reorganização do fluxo de abertura/edição.
- Mudança maior que “ajuste cosmético” no curto prazo.

### Riscos
- Virar fluxo paralelo se modal antigo for mantido junto com página completa.
- Inconsistência com padrão admin caso não siga a base visual (`/admin/frota`, `PageHeader`, `FilterCard`, `ActionsDropdown`, cards e tabela).

### Impacto no fluxo
- Lista `/admin/programas-beneficio` continua como hub.
- Ações de “Adicionar/Editar/Gerenciar CPFs” passam a navegar para tela dedicada do programa.
- Modal deixa de ser CRUD principal.

### Manutenção, clareza e escalabilidade
- Melhora clareza do domínio (programa + elegibilidade + eventos).
- Facilita evolução futura sem comprimir UX em popup.
- Mantém auditabilidade e previsibilidade ao separar contexto de listagem e contexto de edição operacional.

### Como evitar fluxo paralelo desnecessário
- Definir **um único fluxo principal**:
  - CRUD completo somente na tela dedicada.
- Modal residual:
  - preferencialmente **deixar de existir** para CRUD deste módulo;
  - se necessário, manter apenas modais pequenos de confirmação/ações rápidas pontuais (ex.: confirmar inativação), sem duplicar formulário completo.

---

## 6. Recomendação final

## **Recomendação principal: criar tela dedicada**

Justificativa objetiva:
1. O volume e a natureza das tarefas (principalmente CPFs elegíveis em massa) caracterizam operação pesada para modal.
2. O dialog atual já está no teto de tamanho (`90vh`, `95vw`, `max-w-6xl`) e ainda assim concentra múltiplos blocos com scroll.
3. A solução dedicada melhora clareza e produtividade sem alterar regras de negócio nem quebrar multiempresa.
4. É possível manter consistência com o padrão admin ao reutilizar os mesmos componentes e linguagem visual.

---

## 7. Escopo mínimo recomendado para implementação

Para próxima etapa (mínimo seguro):

1. **Manter a página de listagem atual** em `/admin/programas-beneficio` com filtros, stats, tabela e menu `...`.
2. **Criar rota dedicada de edição/cadastro** do programa (ex.: `/admin/programas-beneficio/novo` e `/admin/programas-beneficio/:id`).
3. **Reutilizar os blocos já existentes** (dados, eventos, CPFs) em layout de página, sem mudar regra de validação e persistência.
4. **Remover o dialog como CRUD principal** e trocar gatilhos por navegação de rota.
5. **Manter ações rápidas** (ativar/inativar) na listagem via menu `...`.
6. **Preservar 100% da lógica com `company_id`** nas queries atuais.

---

## 8. Riscos e pontos de atenção

1. **Consistência visual**
   - Seguir padrões do admin (`AdminLayout`, `PageHeader`, cards, tabela, `ActionsDropdown`).
2. **Não duplicar fluxo**
   - Evitar coexistência de modal completo + página completa para o mesmo CRUD.
3. **Integridade de regras**
   - Não alterar validações de vigência, CPF, duplicidade e status.
4. **Multiempresa e segurança**
   - Garantir manutenção de todos os filtros e payloads com `company_id`.
5. **Paridade funcional**
   - Preservar importação CSV/XLSX, importação por colagem, ações por CPF e vínculo de eventos.
6. **Controle de escopo**
   - Evitar refatorações amplas fora de `/admin/programas-beneficio`.

