

# Correcao do Wizard de Criacao de Evento

## Problema

O botao "Salvar" aparece no lugar de "Proximo" porque `isCreateWizardMode` nunca e ativado ao criar um evento novo. Os 3 pontos de abertura do modal de criacao chamam `resetForm()` + `setDialogOpen(true)`, mas nenhum deles chama `setIsCreateWizardMode(true)`.

Isso faz com que o rodape do modal caia na condicao `!isCreateWizardMode`, mostrando "Cancelar / Salvar" em vez de "Voltar / Proximo". E ao clicar em "Salvar", o `handleSubmit` executa o fluxo nao-wizard que salva o evento incompleto e fecha o modal.

---

## Correcao

Adicionar `setIsCreateWizardMode(true)` em todos os 3 locais onde o modal de criacao e aberto:

| Local (linha aprox.) | Contexto | Mudanca |
|---|---|---|
| ~1895 | Botao "Criar Evento" principal | Adicionar `setIsCreateWizardMode(true)` apos `resetForm()` |
| ~2122 | Botao "Criar Evento" no estado vazio | Adicionar `setIsCreateWizardMode(true)` apos `resetForm()` |
| ~368 | Continuidade apos conectar Stripe | Adicionar `setIsCreateWizardMode(true)` apos `resetForm()` |

Nenhuma outra mudanca e necessaria. O rodape wizard (Voltar / Proximo / Salvar rascunho) ja esta implementado corretamente na condicao `isCreateWizardMode`, e a funcao `handleWizardAdvance` ja valida antes de avancar. O problema era exclusivamente a flag nao ser ativada.

---

## Detalhes Tecnicos

Arquivo afetado: `src/pages/admin/Events.tsx`

Cada um dos 3 blocos passa de:
```typescript
resetForm();
setDialogOpen(true);
```
Para:
```typescript
resetForm();
setIsCreateWizardMode(true);
setDialogOpen(true);
```

O `resetForm()` ja faz `setIsCreateWizardMode(false)` internamente, entao a ordem e importante: primeiro reseta tudo, depois ativa o wizard, depois abre o modal.

---

## Resultado

- Etapa 1 mostrara "Proximo" no rodape (nao "Salvar")
- Clicar "Proximo" valida campos obrigatorios antes de avancar
- O evento so e salvo como rascunho ao avancar de etapa (comportamento correto)
- O fluxo wizard completo funciona: progresso, validacao, popup celebrativo
