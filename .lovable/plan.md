

## Plano: Adicionar emojis de nível na coluna Nível da tabela

### Arquivo: `src/pages/admin/CommercialPartners.tsx`

### Mudança

Na tabela de listagem (linha 933), adicionar os mesmos emojis usados nos cards de seleção ao lado do label do nível:

- **Básico** → sem emoji (como nos cards)
- **Destaque** → ⭐
- **Premium** → 🔥

Alterar a linha 933 de:
```
{TIER_LABELS[partner.partner_tier]}
```
Para incluir o emoji correspondente, reutilizando um mapa constante `TIER_EMOJIS` (ou inline):

```
{TIER_LABELS[partner.partner_tier]}{partner.partner_tier === 'destaque' ? ' ⭐' : partner.partner_tier === 'premium' ? ' 🔥' : ''}
```

Alternativamente, criar um mapa `TIER_EMOJIS` junto ao `TIER_LABELS` para manter consistência com os cards:

```ts
const TIER_EMOJIS: Record<CommercialPartnerTier, string> = {
  basico: '',
  destaque: ' ⭐',
  premium: ' 🔥',
};
```

E usar `{TIER_LABELS[tier]}{TIER_EMOJIS[tier]}` tanto nos cards quanto na tabela.

### Resultado

A coluna "Nível" na tabela passará a exibir:
- `Básico`
- `Destaque ⭐`
- `Premium 🔥`

Mantendo consistência visual entre a tabela e os cards do modal.

