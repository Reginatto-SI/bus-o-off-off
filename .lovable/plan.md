

# Ajustes de UX e Conformidade — Tela /admin/eventos

Este plano modifica exclusivamente o arquivo `src/pages/admin/Events.tsx` (4072 linhas). Nenhum outro arquivo é alterado. Nenhuma migração de banco necessária.

---

## Mudanças

### 1. Etapa Geral — Redistribuir campos em colunas (desktop)

**Linhas ~2366-2591** — Reorganizar o `TabsContent value="geral"`:

- **Linha 1**: Manter grid existente `lg:grid-cols-[200px,1fr]` (Banner + Nome do Evento) — já está assim.
- **Linha 2**: Mover Data, Cidade e Tolerância para um grid de 3 colunas:
  ```
  <div className="grid gap-4 sm:grid-cols-3">
    Data | Cidade | Tolerância
  </div>
  ```
  Atualmente Data e Cidade estão em `sm:grid-cols-2` e Tolerância fica sozinha abaixo.
- **Linha 3**: Colocar Descrição e Informações lado a lado:
  ```
  <div className="grid gap-4 lg:grid-cols-2">
    Descrição | Informações e Regras
  </div>
  ```
  Atualmente ficam empilhadas verticalmente.

### 2. Etapa Frotas — Cards de viagem lado a lado

**Linhas ~2648-2715** — No bloco que renderiza `sortedEventTrips.map(...)`:

- Trocar container de `<div className="space-y-3">` para `<div className="grid gap-3 lg:grid-cols-2">`.
- Os cards individuais já são `<Card>`, ficarão lado a lado automaticamente quando houver Ida + Volta.

### 3. Etapa Embarques — Dropdown menor + resumo ao lado

**Linhas ~2745-2763** — No bloco do "Trip Selector":

- Envolver dropdown + resumo em grid:
  ```
  <div className="grid gap-4 lg:grid-cols-[40%,1fr] items-end">
    <div> Select (Viagem Selecionada) </div>
    <div> Resumo: Total de embarques | Horário base </div>
  </div>
  ```
- O resumo exibirá contagem de `filteredBoardings.length` e horário do primeiro embarque (stop_order 1).

### 4. Etapa Passagens — Reestruturar em 4 Cards

**Linhas ~2954-3211** — Reescrever o `TabsContent value="passagens"`:

Novo estado no componente:
```ts
const [platformFeePassToClient, setPlatformFeePassToClient] = useState(false);
const [platformFeeAccepted, setPlatformFeeAccepted] = useState(false);
```

**Card 1 — Configuração da Passagem**:
- Preço + Limite por compra (grid 2 colunas) — já existe, apenas envolver em Card com titulo.

**Card 2 — Canais de Venda**:
- Venda Online + Venda por Vendedor — mover o bloco existente para dentro de um Card com titulo.

**Card 3 — Taxa da Plataforma (6%)** (NOVO):
- Titulo: "Taxa da Plataforma (6%)"
- Texto fixo explicativo
- Toggle: "Repassar taxa para o cliente" (`platformFeePassToClient`)
- Simulação dinâmica usando `form.unit_price`:
  - Preço base
  - Taxa (6%)
  - Preço final ao cliente (se repasse ativado: base + 6%)
  - Valor líquido do organizador (base - 6% se não repassar, ou base inteiro se repassar)

**Card 4 — Aceite Obrigatório** (NOVO):
- Checkbox: "Li e aceito a cobrança da taxa de 6% sobre vendas online."
- Estado: `platformFeeAccepted`

Manter o bloco de **Taxas Adicionais** e **Resumo do Evento** existentes abaixo dos 4 cards.

### 5. Etapa Publicação — Resumo Financeiro + bloqueio de aceite

**Linhas ~3214-3320** — No `TabsContent value="publicacao"`:

Antes do checklist existente, adicionar Card "Resumo Financeiro do Evento":
- Preço ao cliente (base ou base+6%)
- Taxa da plataforma (6%)
- Quem paga a taxa (organizador ou cliente)
- Valor líquido estimado por ingresso
- Canais ativos (Online / Vendedor)

**Bloqueio de publicação**:
- Adicionar `platformFeeAccepted` como requisito no `publishChecklist`:
  - Novo check: `hasFeeAcceptance: platformFeeAccepted`
  - Incluir no `valid` condition
- Se tentar publicar sem aceite: toast + redirecionar para aba passagens
- Adicionar item visual no checklist: "Taxa da plataforma aceita"

### 6. Estado e imports

- Adicionar `Checkbox` import de `@/components/ui/checkbox`
- Adicionar estados: `platformFeePassToClient`, `platformFeeAccepted`
- No `resetForm()`, resetar ambos para `false`
- No `loadEventData` ao editar, inicializar `platformFeeAccepted = false` (sempre exigir re-aceite por sessão)

---

## Arquivos afetados

| Arquivo | Tipo |
|---------|------|
| `src/pages/admin/Events.tsx` | Modificação (layout + lógica de taxa/aceite) |

Nenhuma migração. Nenhum novo componente. Nenhuma alteração em telas públicas ou fluxo de compra.

