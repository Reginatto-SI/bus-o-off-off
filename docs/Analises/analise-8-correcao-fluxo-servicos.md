# Análise 8 — Correção do fluxo completo de Serviços (vínculo no evento + venda avulsa)

## 1) Diagnóstico da causa raiz real

Após investigação no código + leitura direta do banco, foi possível confirmar a causa que escapou às análises 6 e 7:

- A tabela `services` continha 1 serviço ativo da empresa, mas a tabela `event_services` estava **vazia**. Isto é, **nenhum vínculo nunca foi salvo**, mesmo após as correções anteriores.
- O componente `EventServicesTab` é renderizado **dentro do `<form onSubmit={handleSubmit}>` do wizard de evento** (`src/pages/admin/Events.tsx`, linhas 2994 a 4576).
- A análise 7 já tinha colocado `type="button"` em todos os botões visíveis do `EventServicesTab` e do `ActionsDropdown`, mas faltavam dois pontos críticos:

### Causa raiz consolidada

1. **Submit implícito por `Enter` em Inputs internos**
   Os campos "Valor base" e "Capacidade total" do modal de vínculo são `<input>`s. Pressionar Enter neles dispara o submit implícito do navegador, que percorre a árvore React e atinge o `<form>` pai do evento, executando `handleSubmit` → toast "Evento atualizado com sucesso" + dialog do evento fechado antes de salvar o vínculo.

2. **Bubbling de eventos sintéticos React através do Portal do Dialog**
   Mesmo o `<Dialog>` do Radix usando Portal no DOM, **eventos sintéticos do React continuam subindo pela árvore de componentes**, atingindo o `<form>` pai. Cliques em sub-componentes Radix dentro do modal aninhado podiam disparar submits indiretos.

3. **Mensagens duplicadas "Salve o evento na aba Geral para liberar Serviços"**
   Eram um sintoma do submit acidental: o dialog era fechado pelo submit indevido, o usuário reabria o evento, e o toast do `getTabLockMessage('servicos')` aparecia em alguns cenários antes de o `editingId` ser reidratado.

---

## 2) Resultado das hipóteses investigadas

| # | Hipótese | Resultado |
|---|---|---|
| 1 | Serviço salvo na tabela correta (`services`)? | ✅ Sim. |
| 2 | `company_id` do serviço igual ao `activeCompanyId`? | ✅ Sim. |
| 3 | Serviço com `status = ativo`? | ✅ Sim. |
| 4 | Query do `EventServicesTab` busca corretamente o catálogo? | ✅ Sim — filtra `company_id` + `status='ativo'`. |
| 5 | RLS bloqueando leitura de `services`? | ❌ Não. |
| 6 | RLS bloqueando insert/read em `event_services`? | ❌ Não. |
| 7 | Modal está dentro do `<form>` do evento e sofre submit acidental? | ✅ **SIM — causa raiz.** |
| 8 | Botões internos com `type="button"`? | Parcial — botões já corretos desde análise 7, mas faltava barreira contra Enter e bubbling. |
| 9 | `Select` em modal aninhado funciona? | ✅ Sim (Radix). O sintoma era o bubbling do submit, não falha do Select. |
| 10 | `event_services` é criado após vincular? | ❌ Nunca chegou a ser, porque o dialog fechava antes. |
| 11 | `/vendas/servicos` filtra eventos/serviços corretamente? | ✅ Filtros corretos após análise 7. |
| 12 | Filtros de `allow_standalone_sale` / `is_active` / `services.status` escondendo serviços? | ❌ Não — análise 7 já removeu o filtro estrito de `allow_standalone_sale` na query. |
| 13 | Erros no console/network ao abrir dropdown ou salvar vínculo? | Nenhum erro relevante (o submit acidental era silencioso). |
| 14 | `editingId` / `effectiveEventId` / `activeCompanyId` corretos no wizard? | ✅ Sim quando o dialog não é fechado por submit acidental. |

### Classificação final

- **Problema principal:** submit acidental do form pai disparado por Enter / bubbling.
- **Problema secundário:** já resolvido na análise 7 (filtro de `allow_standalone_sale`).
- **Não envolve RLS, query ou state.** Envolve **propagação de eventos** entre componente filho e form pai.

---

## 3) Arquivos alterados

1. `src/components/admin/EventServicesTab.tsx`
   - Adicionado wrapper `<div>` externo com `onSubmitCapture` (bloqueia bubbling de submit) e `onKeyDown` (bloqueia Enter implícito em qualquer `<input>` interno).
   - Mantidos todos os `type="button"` já existentes.
2. `src/pages/admin/Events.tsx`
   - Adicionado guard de defesa em profundidade no `handleSubmit`: só aceita submits cujo `e.nativeEvent.submitter` seja um `<button type="submit">` explícito (botão "Finalizar" da etapa publicação). Qualquer outro caminho é ignorado.
3. `docs/Analises/analise-8-correcao-fluxo-servicos.md` (este documento).

---

## 4) Migrations criadas

**Nenhuma.** O schema (`services`, `event_services`, FKs, RLS) já estava correto desde as análises 2 e 6.

---

## 5) Correções aplicadas (resumo técnico)

### 5.1 Barreira de eventos no `EventServicesTab`

```tsx
const blockBubblingSubmit = (e: React.FormEvent) => {
  e.preventDefault();
  e.stopPropagation();
};

const blockEnterImplicitSubmit = (e: React.KeyboardEvent<HTMLDivElement>) => {
  const target = e.target as HTMLElement | null;
  if (e.key === 'Enter' && target?.tagName === 'INPUT') {
    e.preventDefault();
  }
};

return (
  <div onSubmitCapture={blockBubblingSubmit} onKeyDown={blockEnterImplicitSubmit}>
    <Card>...</Card>
  </div>
);
```

### 5.2 Defesa em profundidade no `handleSubmit` do evento

```ts
const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
const isExplicitSubmit = submitter?.getAttribute('type') === 'submit';
if (!isExplicitSubmit) {
  return;
}
```

Garante que apenas o clique no botão "Finalizar" (etapa publicação, em modo edição) chega a executar `persistEvent`. Botões "Próximo", interações na aba Serviços, Enter em Inputs, etc., não acionam mais o save do evento.

---

## 6) Como validar manualmente

1. Acessar `/admin/servicos` e confirmar serviço ativo da empresa.
2. Ir para `/admin/eventos`, clicar em **Editar** em um evento existente.
3. Abrir aba **Serviços** — não deve aparecer toast indevido.
4. Clicar em **Vincular serviço** — modal abre.
5. Abrir o dropdown **Serviço** — modal **não fecha**, **nenhum toast** "Evento atualizado" aparece.
6. Selecionar o serviço, informar Valor (ex.: 150) e Capacidade (ex.: 20).
7. Pressionar Enter dentro de um Input — modal **não fecha**.
8. Marcar "Permitir venda avulsa".
9. Clicar em **Vincular serviço** (botão do modal) — vínculo salvo, toast "Serviço vinculado ao evento", linha aparece na tabela.
10. Fechar modal de evento.
11. Acessar `/vendas/servicos`, selecionar o evento.
12. O dropdown **Serviço** deve listar o serviço vinculado.
13. Selecionar serviço, avançar para Quantidade e Pagamento normalmente.

---

## 7) O que continua fora de escopo

Mantido conforme PRD do Módulo Serviços e tarefa atual:

- QR Code
- validação de uso
- consumo parcial
- checkout público com serviços
- relatórios novos
- split / repasse
- guias / horários / fornecedores / veículos específicos
- nova arquitetura
- entidade "agência" (Agência = `companies` existente)

---

## 8) Checklist final

- [x] Diagnóstico explícito da causa raiz real (submit acidental por Enter + bubbling).
- [x] Confirmação no banco de que `event_services` estava vazio antes da correção.
- [x] Hipóteses 1 a 14 documentadas com resultado objetivo.
- [x] Sem alteração de RLS / sem nova migration.
- [x] Mudanças cirúrgicas em 2 arquivos (`EventServicesTab.tsx`, `Events.tsx`).
- [x] Reuso do componente `EventServicesTab` no wizard real (sem fluxo paralelo).
- [x] Filtro multiempresa (`company_id`) preservado.
- [x] Sem alteração no fluxo de passagens.
- [x] Documento de análise criado em `/docs/Analises/analise-8-correcao-fluxo-servicos.md`.
