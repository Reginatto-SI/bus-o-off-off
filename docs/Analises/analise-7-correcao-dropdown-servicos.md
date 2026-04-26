# Análise 7 — Correção do dropdown de serviços (wizard de evento e venda)

## 1) Diagnóstico da causa raiz

### Sintoma
- Na aba **Serviços** do wizard de evento, ao abrir o modal e interagir com ações internas, o formulário principal do evento era submetido indevidamente.
- Efeito observado: modal fechando/piscando e toast de **"Evento atualizado com sucesso"** fora de contexto.
- Em `/vendas/servicos`, após selecionar evento, o dropdown podia permanecer vazio.

### Onde ocorre
- `src/components/admin/EventServicesTab.tsx` (componente embutido dentro do `<form onSubmit={handleSubmit}>` de `src/pages/admin/Events.tsx`).
- `src/pages/admin/ServiceSales.tsx` (filtro de carregamento dos serviços exibidos no seletor).

### Evidência técnica levantada
1. **Submit acidental no wizard**
   - Botões internos de `EventServicesTab` (como “Vincular serviço”, “Cancelar” e “Vincular serviço/Salvar alterações”) estavam sem `type="button"`.
   - Dentro de formulário pai, o tipo padrão de `<button>` é `submit`, disparando `handleSubmit` do evento.

2. **Dropdown vazio na venda**
   - O carregamento de `event_services` em `/vendas/servicos` estava com filtro adicional de `allow_standalone_sale = true`.
   - Isso escondia serviços vinculados que não estavam marcados para venda avulsa, gerando lista vazia mesmo com vínculo existente.

### Causa raiz
- Combinação de:
  1. **submit acidental** por botões internos sem `type="button"` no contexto do formulário pai;
  2. **sobre-filtro** em `/vendas/servicos` que removia serviços vinculados do dropdown.

---

## 2) Classificação do problema

- Problema principal: **submit acidental**.
- Problema secundário: **filtro excessivo** no carregamento do dropdown de venda.
- Não foi identificado ajuste obrigatório de RLS para essa correção mínima.

---

## 3) Arquivos alterados

1. `src/components/admin/EventServicesTab.tsx`
2. `src/pages/admin/ServiceSales.tsx`
3. `src/components/admin/ActionsDropdown.tsx`
4. `docs/Analises/analise-7-correcao-dropdown-servicos.md`

---

## 4) Correções aplicadas

### 4.1 Prevenção de submit acidental
- Adicionado `type="button"` nos botões internos de `EventServicesTab` que não devem submeter o formulário do evento.
- Adicionado comentário de manutenção explicando a prevenção de submit acidental.
- Em `ActionsDropdown`, o trigger também passou a `type="button"` para segurança quando usado dentro de formulários.

### 4.2 Ajuste de disponibilidade inicial no vínculo
- `allow_standalone_sale` no formulário de vínculo passou a iniciar como `true` (configuração operacional padrão para não bloquear a venda avulsa por omissão).

### 4.3 Ajuste do dropdown em `/vendas/servicos`
- Removido filtro estrito `allow_standalone_sale = true` da query de carregamento.
- Mantida regra de segurança multi-tenant e catálogo ativo (`company_id`, `event_services.is_active`, `services.status = ativo`).
- Melhoradas mensagens de estado vazio no seletor de serviços:
  - sem evento selecionado;
  - evento sem serviços vinculados.

### 4.4 Mensagens vazias no vínculo de evento
- Mantida mensagem para ausência total de cadastro em `/admin/servicos`.
- Adicionada mensagem específica quando todos os serviços já estão vinculados e não há novos serviços para vincular.

---

## 5) Validação esperada do fluxo

1. Cadastrar serviço em `/admin/servicos` (ativo e com `company_id` da empresa ativa).
2. Editar evento em `/admin/eventos`.
3. Abrir aba **Serviços** e clicar em **Vincular serviço**.
4. Abrir dropdown **Serviço** sem fechar modal e sem disparar toast de atualização do evento.
5. Salvar vínculo.
6. Ir para `/vendas/servicos`.
7. Selecionar evento.
8. Visualizar serviço no dropdown e seguir com a venda.

---

## 6) O que continua fora de escopo

- QR Code
- validação de uso
- checkout público
- relatórios novos
- split/repasse
- guias/horários/fornecedores/veículos específicos

---

## 7) Checklist final

- [x] Corrigido submit acidental no fluxo de vínculo de serviços.
- [x] Dropdown de serviço no modal deixou de fechar por submit indevido.
- [x] Toast de “Evento atualizado com sucesso” não deve mais disparar indevidamente ao interagir com o vínculo.
- [x] Serviços vinculados voltam a ser listados em `/vendas/servicos`.
- [x] Mensagens vazias melhoradas para orientar operação.
- [x] Sem criação de nova arquitetura ou funcionalidades fora de escopo.
