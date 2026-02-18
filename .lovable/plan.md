

# Evolucao do Wizard de Criacao de Evento

## Resumo

Transformar o modal de criacao/edicao de evento em um wizard guiado e profissional, adicionando indicador de progresso visual, rodape padronizado com navegacao (Voltar/Proximo/Salvar rascunho), validacao persistente por etapa, e popup celebrativo de conclusao. Tudo dentro do arquivo `src/pages/admin/Events.tsx`, sem criar telas ou entidades novas.

---

## O que ja existe (base solida)

O sistema ja possui:
- Modal com 5 abas (Geral, Frotas, Embarques, Passagens, Publicacao)
- `isCreateWizardMode` que ativa o modo wizard na criacao
- `handleWizardAdvance()` que salva como rascunho e avanca
- `getTabLockMessage()` que bloqueia abas sem pre-requisitos
- `publishChecklist` com validacao consolidada
- `publishDecisionDialogOpen` com popup de decisao final (simples)

---

## Mudancas Planejadas

### 1. Indicador de Progresso no Topo do Modal

Acima das abas, adicionar uma barra de progresso e texto "Etapa X de 5":

- Calcular o indice da aba atual (1 a 5)
- Barra de progresso (`Progress`) com valor percentual (20% a 100%)
- Texto: "Etapa 2 de 5 - Frotas"
- Visivel apenas no modo wizard (`isCreateWizardMode`) e tambem na edicao

Cada aba tera um indicador visual no TabsTrigger:
- Concluida: icone de check verde
- Atual: destaque azul (ja existe via `data-[state=active]`)
- Bloqueada: opacidade reduzida + icone de cadeado (ja existe parcialmente)

A logica de "concluida" sera:
- Geral: `isGeralComplete`
- Frotas: `hasAtLeastOneFleet`
- Embarques: `hasValidBoarding`
- Passagens: `hasTicketsRequirements`
- Publicacao: `publishChecklist.valid`

### 2. Rodape Padronizado do Modal

Substituir o rodape atual por um layout com 3 acoes:

**Lado esquerdo:**
- Botao "Salvar rascunho" (discreto, variant `ghost`) - visivel quando nao esta na primeira etapa e nao e read-only. Salva como rascunho sem fechar o modal.

**Lado direito:**
- Botao "Voltar" (variant `outline`) - visivel a partir da segunda etapa. Volta para a aba anterior sem salvar.
- Botao "Proximo" (variant `default`) - em todas as etapas exceto a ultima. Valida, salva e avanca.
- Na ultima etapa (Publicacao): substituir "Proximo" por "Finalizar" que abre o popup celebrativo.

No modo edicao (nao wizard): manter o botao "Salvar" existente.

### 3. Validacao Persistente por Etapa

Ao clicar "Proximo", se a validacao falhar:
- Nao mostrar apenas um toast temporario
- Exibir um bloco de alerta persistente (componente `Alert`) dentro da propria aba, listando os campos faltantes
- O alerta desaparece automaticamente quando todos os campos forem preenchidos (reativo via estado)

Estado novo: `showStepErrors: boolean` - ativado ao clicar "Proximo" com erros, desativado ao corrigir ou ao mudar de aba manualmente.

Mensagens por etapa:
- Geral: "Preencha: Nome, Data, Cidade" (conforme `geralMissingFields`)
- Frotas: "Adicione pelo menos 1 frota/transporte"
- Embarques: "Crie pelo menos 1 embarque vinculado a uma frota"
- Passagens: "Defina o preco da passagem (maior que zero)"

### 4. Popup Celebrativo de Conclusao

Substituir o `AlertDialog` atual de decisao (`publishDecisionDialogOpen`) por um `Dialog` mais elaborado:

- Icone grande de celebracao (confetti/rocket)
- Titulo: "Parabens! Seu evento foi criado com sucesso."
- Subtitulo: "Agora voce pode colocar seu evento online e comecar a vender."
- 3 botoes empilhados:
  1. **Publicar evento agora** (botao primario, destaque) - muda status para `a_venda`, fecha modal, toast de sucesso com icone de foguete
  2. **Manter como rascunho** (botao outline) - salva como rascunho, fecha modal
  3. **Ir para lista de eventos** (link discreto) - salva como rascunho e fecha

A validacao de publicacao (checklist + Stripe) continua sendo aplicada ao clicar "Publicar evento agora". Se falhar, mostra mensagem de pendencia dentro do popup sem fechar.

### 5. Ajustes na Navegacao entre Abas

- Botao "Voltar" navega para a aba anterior na ordem do wizard
- Novo helper: `getPreviousWizardTab(currentTab)` (inverso do `getNextWizardTab` existente)
- O clique direto nas abas continua funcionando (com validacao de lock), mas o fluxo principal e pelo rodape

### 6. Checklist na Aba Publicacao (evolucao)

O checklist existente sera mantido e expandido:
- Adicionar verificacao de Stripe (quando venda online ativa)
- Item: "Conta de pagamento conectada" com icone check/x
- Se Stripe nao conectado, mostrar botao inline para conectar (reutiliza `handleConnectStripeFromGate`)

---

## Detalhes Tecnicos

### Novos estados

```text
showStepErrors: boolean       - Mostra erros persistentes na aba atual
```

### Novos helpers

```text
getPreviousWizardTab(currentTab: string): string | null
getStepNumber(tab: string): number           - Retorna 1-5
getStepLabel(tab: string): string            - "Geral", "Frotas", etc.
isStepComplete(tab: string): boolean         - Verifica se a etapa esta concluida
```

### Fluxo do botao "Proximo"

```text
1. Ativar showStepErrors = true
2. Verificar validacao da etapa atual
3. Se invalido: mostrar alert persistente (showStepErrors ja ativo)
4. Se valido: chamar handleWizardAdvance() (salva + avanca)
5. Desativar showStepErrors ao avancar
```

### Fluxo do botao "Finalizar"

```text
1. Verificar publishChecklist.valid
2. Se invalido: mostrar pendencias na aba Publicacao
3. Se valido: salvar como rascunho e abrir popup celebrativo
```

---

## Arquivo Afetado

| Arquivo | Mudanca |
|---------|---------|
| `src/pages/admin/Events.tsx` | Adicionar indicador de progresso, rodape com navegacao, validacao persistente, popup celebrativo, helpers de navegacao |

Nenhum arquivo novo sera criado. Todas as mudancas sao dentro do componente existente, reutilizando componentes UI ja disponiveis (`Progress`, `Alert`, `Dialog`, `Button`).

---

## Resultado Visual Esperado

```text
+--------------------------------------------------+
|  Novo Evento                                      |
+--------------------------------------------------+
|  Etapa 2 de 5 - Frotas                            |
|  [============================............] 40%   |
+--------------------------------------------------+
|  [v Geral] [> Frotas] [x Embarques] [x Passag.]  |
+--------------------------------------------------+
|                                                    |
|  (conteudo da aba atual)                           |
|                                                    |
|  [!] Adicione pelo menos 1 frota  <- erro persist.|
|                                                    |
+--------------------------------------------------+
|  [Salvar rascunho]          [Voltar]  [Proximo]   |
+--------------------------------------------------+
```

