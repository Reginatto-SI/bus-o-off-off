

## Plano: Cards de Política de Transporte + Modal Inteligente

### Arquivo: `src/pages/admin/Events.tsx`

---

### 1. Renomear labels das políticas existentes (linhas 171-187)

Reutilizar os 3 valores de enum existentes no banco (`trecho_independente`, `ida_obrigatoria_volta_opcional`, `ida_volta_obrigatorio`) mas com novos labels e descrições comerciais:

| Valor DB | Label Atual | Novo Label | Descrição Card |
|----------|------------|------------|----------------|
| `ida_volta_obrigatorio` | Pacote Ida + Volta Obrigatório | **Ida e volta obrigatória** | Venda em pacote único. Ida e volta sempre vinculadas. |
| `ida_obrigatoria_volta_opcional` | Ida Obrigatória + Volta Opcional | **Somente ida** | Evento com operação apenas de ida, sem retorno vinculado. |
| `trecho_independente` | Venda por Trecho Independente | **Flexível** | Permite cadastrar transportes de ida, volta ou ida e volta conforme necessidade do evento. |

Nenhuma alteração de banco necessária.

---

### 2. Substituir Select por cards selecionáveis na Etapa Geral (linhas 2886-2930)

Remover o `<Select>` e o `<Popover>` de ajuda. Substituir por:

- Label: **Política de Transporte do Evento \***
- Grid `grid-cols-1 lg:grid-cols-3 gap-3` com 3 cards clicáveis
- Cada card: ícone/emoji, título, descrição curta
- Card selecionado: `ring-2 ring-primary bg-primary/5 border-primary`
- Card não selecionado: `border hover:border-primary/50 cursor-pointer`

Mesmo padrão visual já usado nos patrocinadores (Bronze/Prata/Ouro).

---

### 3. Ajustar modal "Adicionar Transporte" (linhas 4302-4338)

Lógica condicional baseada na política:

#### Política = `ida_volta_obrigatorio`
- **Ocultar** completamente a seção "Tipo de Transporte"
- Forçar `tripForm.trip_creation_type = 'ida_volta'` automaticamente
- Remover textos redundantes sobre obrigatoriedade

#### Política = `ida_obrigatoria_volta_opcional` (agora "Somente ida")
- **Ocultar** a seção "Tipo de Transporte"
- Forçar `tripForm.trip_creation_type = 'ida'` automaticamente

#### Política = `trecho_independente` (agora "Flexível")
- **Exibir** a seção "Tipo de Transporte"
- Usar cards selecionáveis em vez de RadioGroup para manter coerência visual
- 3 mini-cards: Somente Ida / Somente Volta / Ida e Volta

---

### 4. Ajustar effect de sincronização (linhas 1505-1519)

O `useEffect` que força `trip_creation_type` baseado na política precisa refletir a nova lógica:
- `ida_volta_obrigatorio` → forçar `ida_volta`
- `ida_obrigatoria_volta_opcional` → forçar `ida`
- `trecho_independente` → sem restrição

---

### 5. Atualizar Popover de ajuda no embarque/outras refs

Atualizar as referências textuais às políticas no resto do arquivo para usar os novos nomes.

---

### 6. Comentários de código

Adicionar comentários explicando:
- A política do evento define a regra macro (Etapa Geral)
- O tipo de transporte por item só aparece na política Flexível
- Nas demais políticas, o tipo é inferido automaticamente

---

### Resumo

- 0 alterações de banco de dados
- 1 arquivo modificado (`Events.tsx`)
- Select → 3 cards selecionáveis na Etapa Geral
- RadioGroup → cards ou oculto no modal de transporte (condicional à política)
- Textos redundantes removidos do modal

