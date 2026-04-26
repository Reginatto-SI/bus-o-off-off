## Diagnóstico real (após investigação no código + banco)

### Estado atual no banco (multiempresa OK)
- Tabela `services`: **1 serviço ativo** existe para a empresa (`company_id = a000…001`, `status = ativo`).
- Tabela `event_services`: **0 registros** — confirma que o usuário **nunca conseguiu salvar nenhum vínculo**, apesar das tentativas das análises 6 e 7.
- RLS: políticas `Admins can manage` + `Users can view` em `services` e `event_services` estão corretas e simétricas com o padrão multiempresa do projeto. **Não é problema de RLS.**

### Causa raiz real (que escapou às análises 6 e 7)
O `EventServicesTab` é renderizado **dentro** do `<form onSubmit={handleSubmit}>` do wizard de evento (linhas 2994–4576 de `Events.tsx`). A análise 7 já adicionou `type="button"` em todos os botões visíveis do `EventServicesTab` e do `ActionsDropdown`, **mas faltam dois pontos críticos**:

1. **Submit implícito por `Enter` nos inputs** "Valor base" e "Capacidade total" do modal de vínculo. Apesar do `<Dialog>` usar Portal no DOM, **eventos React sintéticos sobem pela árvore de componentes React até o `<form>` pai**. Pressionar Enter dentro de qualquer `Input` do modal aciona o `onSubmit` do form do evento → executa `handleSubmit` em modo edição → exibe toast "Evento atualizado com sucesso" e fecha o dialog inteiro **antes** de o usuário conseguir clicar em "Vincular serviço".

2. **Toda interação dentro do conteúdo da aba `Serviços`** (clique no `Select`, `Switch`, `SelectItem` do Radix) cria um caminho de bubbling pelo React tree. Mesmo que cada `<button>` tenha `type="button"`, qualquer evento `submit` disparado em sub-componentes (ex.: `form` interno gerado pelo Radix em algumas versões) propaga para o form pai.

3. **Mensagem duplicada "Salve o evento na aba Geral para liberar Serviços"**: o toast é disparado por `handleTabChange` (linha 757). Quando o `submit` acidental fecha o dialog e o usuário reabre o evento, em alguns caminhos `editingId` ainda não foi remontado quando a aba ativa volta a "servicos", disparando o lock indevidamente.

### Hipóteses validadas
| # | Hipótese | Resultado |
|---|---|---|
| 1 | Serviço salvo na tabela correta? | ✅ Sim, em `services`. |
| 2 | `company_id` igual ao `activeCompanyId`? | ✅ Sim. |
| 3 | `status = ativo`? | ✅ Sim. |
| 4 | Query do `EventServicesTab` correta? | ✅ Sim — filtra `company_id` + `status='ativo'`. |
| 5 | RLS bloqueando leitura de `services`? | ❌ Não. |
| 6 | RLS bloqueando insert/read em `event_services`? | ❌ Não. |
| 7 | Modal está dentro do `<form>` do evento e sofre submit acidental? | ✅ **SIM — causa raiz.** |
| 8 | Botões internos com `type="button"`? | Parcial — botões OK, mas falta isolar Enter dos `Input`s e o bubbling do submit. |
| 9 | `Select` em modal aninhado funciona? | ✅ Sim (Radix). O problema é o bubbling do click até o form pai. |
| 10 | `event_services` é criado? | ❌ Nunca, porque o dialog fecha antes do save. |
| 11 | `/vendas/servicos` filtra corretamente? | ✅ Filtros estão corretos para listar vínculos ativos. |
| 12 | Filtros escondem serviços indevidamente? | ❌ Não — análise 7 já removeu o filtro estrito de `allow_standalone_sale`. |
| 13 | Erros no console/network? | Nenhum erro relevante (snapshot atual sem logs de service). |
| 14 | `editingId`/`effectiveEventId`/`activeCompanyId` corretos? | ✅ Sim quando o dialog não é fechado por submit acidental. |

---

## Correções mínimas a aplicar

### 1) `src/components/admin/EventServicesTab.tsx` — isolar do form pai
- **Envolver toda a renderização do componente em um `<div>` que captura e bloqueia o `submit` propagado**: adicionar handler `onSubmitCapture={(e) => { e.preventDefault(); e.stopPropagation(); }}` no wrapper externo. Isso impede que qualquer submit acidental gerado por sub-componentes do Radix/inputs internos chegue ao `<form>` pai do `Events.tsx`.
- **Adicionar `onKeyDown` no wrapper interceptando `Enter`** quando o foco estiver em `INPUT` dentro do modal de vínculo: `if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); }`. Evita submit implícito do navegador.
- Manter os `type="button"` já existentes (não regredir).

### 2) `src/components/admin/EventServicesTab.tsx` — robustez do Select
- O `<Select>` do Radix usa Portal e funciona em modal aninhado. **Não mexer no Select.** Apenas a barreira do item 1 já resolve o sintoma de "modal piscando" quando o dropdown é aberto.

### 3) `src/pages/admin/Events.tsx` — defesa em profundidade no `handleSubmit`
- Adicionar guarda no início do `handleSubmit` (linha 1632): se `activeTab !== 'publicacao' && activeTab !== 'geral'` e o submit não veio do botão "Próximo"/"Finalizar" (detectável via `e.nativeEvent.submitter`), ignorar a submissão. Isso previne que QUALQUER submit indevido vindo de sub-componentes finalize o evento.

  ```ts
  const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
  const isExplicitSubmit = submitter?.getAttribute('type') === 'submit';
  if (!isExplicitSubmit) {
    e.preventDefault();
    return;
  }
  ```

### 4) `src/pages/admin/Events.tsx` — não remostrar mensagem de lock no render inicial
- `getTabLockMessage('servicos')` é chamado em loop no `TabsList` (linha 3021) apenas para indicador visual (Lock icon). Está OK no render — não dispara toast. O toast só vem de `handleTabChange`. Após corrigir o submit acidental, a mensagem duplicada desaparece naturalmente porque o dialog para de fechar/reabrir.

### 5) `src/pages/admin/ServiceSales.tsx` — sem mudanças funcionais
- A query e os filtros já estão corretos após análise 7. Apenas validaremos manualmente que após criar o primeiro vínculo, o serviço aparece no dropdown.

### 6) RLS / migrations
- **Nenhuma alteração de RLS necessária**. As políticas atuais permitem leitura/escrita corretamente para admins da empresa.
- **Nenhuma migration nova** será criada.

---

## Fluxo manual de validação (critério de sucesso)

1. Acessar `/admin/servicos` e confirmar que o serviço "Passeio De Buggy (Tamandaré)" está ativo.
2. Ir para `/admin/eventos`, clicar em **Editar** em um evento existente.
3. Abrir aba **Serviços** — não deve aparecer toast indevido.
4. Clicar em **Vincular serviço** — modal abre.
5. Abrir o dropdown **Serviço** — modal **não fecha**, **nenhum toast** de "Evento atualizado" aparece.
6. Selecionar o serviço, informar valor (ex.: 150) e capacidade (ex.: 20).
7. Pressionar Enter dentro de um Input — modal **não fecha**.
8. Marcar "Permitir venda avulsa".
9. Clicar em **Vincular serviço** (botão do modal) — vínculo é salvo, toast "Serviço vinculado ao evento", linha aparece na tabela.
10. Fechar modal de evento.
11. Acessar `/vendas/servicos`, selecionar o evento.
12. O dropdown **Serviço** deve listar o serviço vinculado.
13. Selecionar serviço, avançar para Quantidade e Pagamento normalmente.

---

## Arquivos que serão alterados

1. `src/components/admin/EventServicesTab.tsx` — wrapper com `onSubmitCapture` + `onKeyDown` para barrar submit/Enter.
2. `src/pages/admin/Events.tsx` — guarda em `handleSubmit` baseada em `e.nativeEvent.submitter`.
3. `docs/Analises/analise-8-correcao-fluxo-servicos.md` — entregável obrigatório com diagnóstico, hipóteses, correções e checklist.

---

## Fora de escopo (mantido conforme PRD)

- QR Code, validação de uso, consumo parcial, checkout público com serviços, relatórios novos, split/repasse, guias, horários, fornecedores, veículos específicos, nova arquitetura, entidade "agência".

## Restrições respeitadas

- Reuso total da entidade `companies` (sem nova entidade "agência").
- Filtro multiempresa (`company_id`) preservado em todas as queries.
- Sem alteração no fluxo de passagens / wizard de evento (apenas guarda defensiva no submit).
- Sem refatoração — mudanças cirúrgicas em 2 arquivos.
- Sem nova migration / sem alteração de RLS.

## Checklist final esperado

- [ ] Serviço cadastrado aparece no dropdown de vínculo do evento.
- [ ] Vínculo é salvo em `event_services`.
- [ ] Modal não fecha ao clicar no dropdown ou pressionar Enter.
- [ ] Evento não é salvo indevidamente ao interagir com a aba Serviços.
- [ ] Não aparecem mensagens duplicadas de "Salve o evento".
- [ ] Serviço vinculado aparece em `/vendas/servicos` após selecionar o evento.
- [ ] Documento `analise-8-correcao-fluxo-servicos.md` criado.