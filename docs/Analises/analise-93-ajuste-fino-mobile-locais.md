# Ajuste fino mobile — `/admin/locais`

## 1. Objetivo
Aplicar um refinamento de UX mobile na tela de locais de embarque, priorizando compactação, hierarquia clara de ações e preservação do comportamento no desktop.

## 2. Problemas atacados
- Excesso de empilhamento vertical no topo por conta dos botões de exportação.
- Hierarquia invertida entre ação principal (Adicionar Local) e ações secundárias (Excel/PDF).
- Cards de KPI com ocupação vertical acima do necessário no mobile.
- Ações por linha pouco evidentes na listagem em telas pequenas.
- Sensação geral de interface “esticada” no uso administrativo via celular.

## 3. Ajustes realizados
- **Topo (mobile):**
  - Mantido `Adicionar Local` como ação principal visível e com maior destaque estrutural.
  - Movidos `Excel` e `PDF` para um menu secundário compacto via botão de reticências (`...`) apenas no mobile.
  - Mantido layout anterior no desktop (botões de exportação visíveis).
- **KPIs:**
  - Reduzido espaçamento interno dos cards no mobile (`p-3`), preservando desktop (`sm:p-4`).
  - Reorganização para grid em 2 colunas no mobile para reduzir consumo da dobra inicial.
- **Listagem:**
  - Ajustado espaçamento vertical das linhas para reduzir altura total no mobile.
  - Reforçada a affordance da célula de ações com rótulo contextual “Ações” no mobile e contorno discreto do gatilho.

## 4. O que foi mantido por segurança
- Estrutura geral da tela, filtros, tabela, modais e fluxo CRUD.
- Componentes globais não foram alterados (`PageHeader`, `FilterCard`, `Table`, `Dialog`, `AppLayout`, `AdminSidebar`, `index.css`).
- Regras de negócio, permissões e integração Supabase permanecem intactas.
- Comportamento desktop preservado sem quebra de layout.

## 5. Resultado esperado no mobile
- Header mais limpo e compacto.
- `Adicionar Local` com prioridade visual correta.
- Exportações acessíveis sem poluição visual.
- KPIs mais eficientes em área útil.
- Percepção mais profissional e operacional na rotina admin mobile.

## 6. Checklist de regressão desktop
- [ ] Botões de exportação continuam visíveis no topo.
- [ ] Abertura do modal de criação/edição segue funcional.
- [ ] Tabela mantém colunas e comportamento responsivo esperado.
- [ ] Menu de ações por linha segue funcional para editar/ativar/desativar.
- [ ] Filtros e estados vazios permanecem sem regressão.

## 7. Pontos que ainda podem evoluir
- Validar, com telemetria de uso, se o ícone de reticências no topo tem descobribilidade suficiente.
- Considerar versão “quick actions” contextual para exportação quando lista estiver vazia/filtrada.
- Ajustar microtipografia dos KPIs se houver diretriz de design system específica para mobile denso.

## 8. Conclusão
O ajuste prioriza UX de produto real no mobile, com foco em compactação e hierarquia sem ruptura do desktop. A implementação é local à tela `/admin/locais`, segura, incremental e sem alteração de contratos funcionais.
