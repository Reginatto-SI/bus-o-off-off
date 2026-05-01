## Objetivo

Aplicar melhorias de UX/clareza no módulo **Tipos de Passagem por Evento**, sem refatorar arquitetura, sem mexer em pagamentos/Asaas e sem criar componentes novos. Foco em compactação visual, hierarquia, clareza conceitual e prevenção de erro do operador.

---

## 1. Tela `/admin/eventos` → guia "Passagens" (`src/pages/admin/Events.tsx`, ~linhas 3870–4030)

**Problemas atuais**

- Bloco "Tipos de passagem" fica abaixo de "Preço base" + "Limite por compra", apenas como lista de inputs soltos. Usuário não percebe que **tipos** são o conceito principal.
- Cabeçalho do card diz "Configuração da Passagem" — genérico.
- Linhas dos tipos usam grid 12-col com inputs altos (`h-8` mas com padding generoso) e **sem header de coluna** (Nome / Preço / Status), gerando espaço desperdiçado e ambiguidade.
- Botão "Adicionar tipo de passagem" só aparece quando há `editingId` e fica em texto pequeno acima da lista.
- Não mostra resumo ("3 tipos • 2 ativos • R$ 80–R$ 150").
- Estado vazio é texto cinza pequeno.

**Mudanças (apenas no card "Configuração da Passagem")**

1. Renomear título do card para **"Passagens e Tipos"** e adicionar `CardDescription` curta: "Defina os tipos de passagem que serão vendidos neste evento (ex.: Adulto, Criança, Estudante)."
2. **Reposicionar** o bloco "Tipos de passagem" para logo abaixo do título do card, **acima** de Preço Base / Limite. Tipos passam a ser o conteúdo principal; "Preço base" é rotulado como **"Preço base (fallback)"** com helper text reforçando que só é usado quando nenhum tipo está disponível.
3. Adicionar **resumo inline** ao lado do label "Tipos de passagem":
   `<Badge variant="secondary">{total} tipos · {ativos} ativos</Badge>` e, quando houver ≥1 tipo, intervalo de preço (`R$ menor – R$ maior`) em texto `text-xs text-muted-foreground`.
4. **Botão "Adicionar tipo"** vira `size="sm" variant="default"` (não `outline`) e ganha alias mais curto: **"Novo tipo"**. Mantém na mesma linha do label.
5. Adicionar **header de colunas** (uma linha cinza compacta `text-[11px] uppercase text-muted-foreground`):
   `Nome | Preço | Status | Ações` — col-spans iguais aos das linhas (5/3/2/2).
6. Reduzir padding das linhas de tipo: `p-2` → `px-2 py-1.5`, e `gap-2` mantém. Inputs já estão `h-8`. Trocar `Badge "Ativo/Inativo"` por texto curto ao lado do Switch (`text-xs`) para economizar largura — ou manter Badge mas remover label duplicado.
7. **Estado vazio** vira um bloco com borda tracejada (`border-dashed rounded-md p-4 text-center`) + ícone `Ticket`/`Tags` + texto "Nenhum tipo cadastrado ainda" + botão "Adicionar primeiro tipo".
8. Estado pré-save (`!editingId`): manter mensagem mas em formato `Alert` `variant="default"` discreto (sem novo componente — usa `Alert` existente do shadcn).

**O que NÃO muda**

- Lógica de insert/update/delete, validação "manter ao menos 1 ativo", regra de fallback, schema, RPC.

---

## 2. Checkout público (`src/pages/public/Checkout.tsx`, ~linhas 1801–1829 e 1707–1714)

**Problemas atuais**

- Seleção de tipo só aparece quando `eventTicketTypes.length > 1` — OK.
- Está como `<Select>` simples no fim do accordion do passageiro. Passa despercebido (logo após "Telefone (opcional)").
- Header do accordion mostra apenas `Assento X — Nome`. Não mostra qual tipo o passageiro tem.
- Resumo ("Ver detalhes") não detalha tipos comprados.

**Mudanças**

1. **Mover** o `<Select>` "Tipo de passagem" para o **topo** do conteúdo do accordion (acima de Nome), pois é a primeira decisão comercial. Manter o mesmo `<Select>`.
2. Reforçar o label: **"Tipo de passagem *"** + helper `text-xs text-muted-foreground`: "Define o valor cobrado deste passageiro."
3. No header colapsado do accordion, adicionar **Badge** com o nome do tipo escolhido quando `eventTicketTypes.length > 1`:
   `Assento {seatLabel} · {passenger.ticket_type_name} — {passenger.name || "Pendente"}`. Usar `Badge variant="outline" className="text-[10px]"` para o tipo. Não criar componente.
4. No bloco de **Resumo expandido** (CollapsibleContent ~linha 1547), adicionar — somente quando houver mais de 1 tipo distinto comprado — uma linha "Tipos" agrupando: `2× Adulto · 1× Criança`. Calcular via `useMemo` simples sobre `passengers`.
5. Manter validação atual; tipo padrão (primeiro ativo) já é pré-selecionado.

---

## 3. Venda manual (`src/components/admin/NewSaleModal.tsx`, ~linhas 1699–1725)

**Problemas atuais**

- Select "Tipo de passagem" sempre visível com opção `__default__` "Padrão do evento" — confunde o operador (não fica claro qual o preço do "padrão").
- Está em grid junto a Telefone, mesmo peso visual.
- Sem feedback do preço resultante na hora.

**Mudanças**

1. Quando `eventTicketTypes.length === 0` → não renderizar o `<Select>` (evita ruído).
2. Quando `eventTicketTypes.length >= 1` → remover a opção `__default__` e **pré-selecionar** o primeiro tipo automaticamente (`ticketTypeId` setado no momento de criar passageiro). Operador sempre escolhe um tipo real.
3. Mover o select para a **primeira posição** dentro do bloco do passageiro (antes de Nome), com label `Tipo de passagem *` em destaque.
4. Adicionar abaixo do select um helper inline com o preço efetivo: `text-[11px] text-muted-foreground` mostrando `Preço base do tipo: R$ XX,XX` (lê de `ticketTypePrice`).
5. Manter override manual de preço onde já existe (não tocar nessa lógica).

---

## 4. Consistência e regras

- Reutilizar somente `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `Badge`, `Button`, `Input`, `Switch`, `Select`, `Alert` — todos já presentes.
- Nenhuma migração SQL. Nenhuma mudança em edge functions. Nenhum impacto em snapshot/Asaas/RLS.
- Manter precedência atual: tipo > categoria > preço base.
- Manter regra "≥1 tipo ativo" e mensagens de erro existentes.

---

## Arquivos a editar

1. `src/pages/admin/Events.tsx` — reorganizar card "Configuração da Passagem" (linhas ~3872–4030).
2. `src/pages/public/Checkout.tsx` — reposicionar select de tipo no accordion, badge no header, linha de resumo (linhas ~1547–1610 e ~1690–1830).
3. `src/components/admin/NewSaleModal.tsx` — pré-selecionar tipo, remover `__default__`, mover select para topo, adicionar helper de preço (linhas ~614–624 e ~1699–1725).

## Validação manual após implementação

1. `/admin/eventos` → editar evento: card "Passagens e Tipos" mostra resumo, header de colunas, novo tipo entra com 1 clique, estado vazio dá CTA claro.
2. Checkout com 2+ tipos: select aparece no topo do passageiro, badge do tipo aparece no header colapsado, resumo lista quantidade por tipo.
3. Venda manual com 2 tipos: passageiro nasce já com tipo selecionado (não `__default__`), preço do tipo aparece como helper.
4. Conferir que venda real (checkout + manual) ainda persiste `ticket_type_*` em `sale_passengers`/`tickets` igual a hoje.