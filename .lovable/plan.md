

## Plano: Níveis de Patrocínio no Vínculo de Evento

### Arquivo: `src/components/admin/EventSponsorsTab.tsx`

### 1. Constantes de nível

Adicionar no topo do arquivo:

```ts
type SponsorTier = 'bronze' | 'prata' | 'ouro';

const SPONSOR_TIERS: { value: SponsorTier; label: string; emoji: string; description: string }[] = [
  { value: 'bronze', label: 'Bronze', emoji: '🥉', description: 'Visibilidade básica no evento.' },
  { value: 'prata', label: 'Prata', emoji: '🥈', description: 'Maior visibilidade para o patrocinador.' },
  { value: 'ouro', label: 'Ouro', emoji: '🥇', description: 'Máxima visibilidade dentro do sistema.' },
];

const TIER_VISIBILITY: Record<SponsorTier, { show_on_event_page: boolean; show_on_showcase: boolean; show_on_ticket: boolean }> = {
  bronze: { show_on_event_page: true, show_on_showcase: false, show_on_ticket: false },
  prata:  { show_on_event_page: true, show_on_showcase: true,  show_on_ticket: false },
  ouro:   { show_on_event_page: true, show_on_showcase: true,  show_on_ticket: true },
};

// Função para inferir o nível a partir dos checkboxes existentes
function inferTier(flags: { show_on_event_page: boolean; show_on_showcase: boolean; show_on_ticket: boolean }): SponsorTier {
  if (flags.show_on_ticket) return 'ouro';
  if (flags.show_on_showcase) return 'prata';
  return 'bronze';
}
```

### 2. Estado do formulário

Adicionar `sponsor_tier: SponsorTier` ao `form` state. Valor default: `'bronze'`. No `resetForm`, resetar para `'bronze'`. No `handleOpenEdit`, inferir o tier com `inferTier(link)`.

### 3. Modal — substituir checkboxes por cards de nível (linhas 344-369)

Substituir a seção "Onde exibir" com checkboxes por:

- Label: **Nível do patrocínio**
- Grid `grid-cols-3 gap-3` com 3 cards clicáveis (mesmo padrão visual dos Parceiros Comerciais)
- Cada card: emoji + label + descrição + lista de locais incluídos
- Card selecionado: `ring-2 ring-primary bg-primary/5`
- Ao clicar, setar `sponsor_tier` e aplicar automaticamente os 3 booleans de visibilidade via `TIER_VISIBILITY`

Os checkboxes deixam de existir na interface; os booleans são controlados exclusivamente pelo nível.

### 4. Lista de patrocinadores — badge de nível (linhas 265-274)

Substituir os badges individuais (Página do evento / Vitrine / Passagem) por um único badge com emoji e label do nível:

```tsx
<span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-medium">
  {TIER_EMOJI} {TIER_LABEL}
</span>
```

Inferir o nível a partir dos flags existentes usando `inferTier()`.

### 5. Persistência

Nenhuma alteração no banco de dados. Os 3 campos booleanos (`show_on_event_page`, `show_on_showcase`, `show_on_ticket`) continuam sendo gravados normalmente — o nível é apenas uma abstração visual que controla esses campos.

### Resultado

O modal passa de checkboxes técnicos para cards comerciais com níveis claros (Bronze 🥉 / Prata 🥈 / Ouro 🥇), e a listagem mostra o nível diretamente no badge.

