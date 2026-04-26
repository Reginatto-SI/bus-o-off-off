# Análise 6 — Ajustes mínimos de Serviços no Evento e Venda de Serviços

## 1) Diagnóstico do problema

### Sintomas observados
1. O serviço cadastrado em `/admin/servicos` não aparecia no fluxo principal de criação/edição de evento.
2. Em `/vendas/servicos`, o evento podia aparecer, mas o seletor de serviço ficava vazio em cenários operacionais.
3. A tela `/vendas/servicos` estava com espaçamento diferente do padrão administrativo (sem o container padrão).
4. A lista de eventos em `/vendas/servicos` incluía eventos fora da janela operacional.

### Causas identificadas no código
- A vinculação de serviços por evento estava disponível em `EventServicesTab`, porém conectada em `EventDetail` (rota de detalhes), não no wizard/modal principal usado em `/admin/eventos` (`Events.tsx`).
- Em `/vendas/servicos`, a consulta de eventos não reaproveitava o filtro operacional já usado em outros fluxos (janela operacional + exclusão de encerrados/arquivados).
- O wizard de venda carregava `event_services`, mas a operação avulsa precisava filtrar apenas vínculos válidos para venda avulsa (`allow_standalone_sale = true`) e serviço base ativo.
- O layout da página de venda de serviços não usava `page-container`, causando desalinhamento com telas administrativas.

---

## 2) Fluxo real de criação/edição de evento encontrado

Fluxo real utilizado pela operação:
- Página `src/pages/admin/Events.tsx` (modal/wizard com abas e progressão de etapas).
- Etapas existentes antes do ajuste: `Geral → Frotas → Embarques → Passagens → Patrocinadores → Publicação`.
- Esse é o fluxo principal de criação/edição acionado por “Criar Evento” e por “Editar” na listagem.

Conclusão: o usuário operacional não dependia da rota de detalhe para montar evento; logo, a etapa de serviços precisava existir dentro desse wizard.

---

## 3) Onde a aba Serviços estava conectada e onde precisava estar

- **Antes:** `EventServicesTab` estava ligada em `src/pages/admin/EventDetail.tsx` (aba “services”).
- **Correção mínima aplicada:** inclusão da etapa/aba `Serviços` no wizard de `src/pages/admin/Events.tsx`, reutilizando o mesmo componente `EventServicesTab` (sem criar arquitetura nova).
- Também foi adicionada trava coerente de navegação da aba (`getTabLockMessage`) exigindo evento salvo para liberar vínculo de serviços.

---

## 4) Por que o serviço não aparecia no dropdown da venda

Foram identificados dois fatores principais:

1. **Ausência de vínculo operacional no fluxo principal**
   - Como o vínculo ficava fora do wizard principal, muitos eventos não tinham registro em `event_services` no momento da venda.

2. **Filtro insuficiente para venda avulsa**
   - A venda avulsa deve listar apenas serviços vinculados ao evento e habilitados para esse tipo de venda.
   - Ajustado em `/vendas/servicos` para considerar `event_services.is_active = true`, `allow_standalone_sale = true` e serviço base ativo (`services.status = ativo`).

Resultado: o dropdown passa a refletir apenas serviços realmente vendáveis no evento selecionado.

---

## 5) Qual regra de evento ativo/válido foi reutilizada

Foi reutilizada a mesma lógica operacional já existente no sistema (sem regra nova):

- Base de eventos não encerrados e não arquivados (`status != encerrado` e `is_archived = false`);
- Aplicação da janela operacional por embarques via utilitários existentes:
  - `buildEventOperationalEndMap`
  - `filterOperationallyVisibleEvents`

Essa abordagem já é usada em fluxos como venda/admin e telas operacionais, mantendo consistência.

---

## 6) Ajustes visuais realizados em `/vendas/servicos`

Mudanças mínimas de alinhamento com padrão administrativo:
- A página passou a usar `page-container` (mesmo padrão das páginas admin).
- O card principal deixou de usar largura fixa reduzida (`max-w-4xl`) para seguir o espaçamento/layout padrão.

---

## 7) Arquivos alterados

1. `src/pages/admin/Events.tsx`
   - Inclusão da aba/etapa `Serviços` no wizard real.
   - Reuso de `EventServicesTab` dentro do fluxo principal.
   - Ajuste de ordem/labels das etapas e lock de navegação.

2. `src/pages/admin/ServiceSales.tsx`
   - Reuso da lógica existente de visibilidade operacional de eventos.
   - Filtro de serviços vinculados e válidos para venda avulsa.
   - Ajuste de container/margens para padrão administrativo.

3. `docs/Analises/analise-6-ajustes-servicos-evento-venda.md`
   - Documento desta análise e correções.

---

## 8) O que continua fora de escopo

Mantido fora de escopo (sem implementação):
- QR Code
- validação de uso
- consumo parcial
- checkout público com serviços
- relatórios novos
- split/repasse
- guias
- horários
- veículos específicos
- fornecedores

---

## 9) Checklist final de validação

- [x] No wizard real de evento (`/admin/eventos`), existe etapa clara para vincular serviços.
- [x] Serviços do catálogo base (`/admin/servicos`) podem ser vinculados ao evento no fluxo principal.
- [x] `/vendas/servicos` lista somente serviços vinculados ao evento selecionado e aptos para venda avulsa.
- [x] Reuso da lógica existente de eventos ativos/válidos (sem regra nova inventada).
- [x] Ajuste visual de espaçamento/margens para padrão administrativo.
- [x] Nenhum item fora de escopo foi implementado.
