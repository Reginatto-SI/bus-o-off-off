

## Plano: Vincular Nível do Parceiro à Exibição Automática

### Arquivo: `src/pages/admin/CommercialPartners.tsx`

### Mudanças

#### 1. Tier selection aplica defaults automaticamente (linhas 488-492)

No `onClick` dos cards de nível, além de mudar `partner_tier`, aplicar automaticamente os defaults de visibilidade:

```ts
onClick={() => {
  const defaults = TIER_VISIBILITY_DEFAULTS[tier.value];
  setForm({ ...form, partner_tier: tier.value, ...defaults });
}
```

#### 2. Remover botão "Sugerir padrão" (linhas 610-612)

Eliminar o `<Button>` "Sugerir padrão para nível..." e a função `applyTierDefaults` da `renderExibicaoFields`.

#### 3. Adicionar indicação de níveis em cada checkbox

Ao lado de cada label, adicionar badge discreta com os níveis que incluem aquela exibição:

- **Vitrine pública** → `Básico, Destaque e Premium`
- **Página de eventos** → `Destaque e Premium`
- **Passagem** → `Premium`

Formato: `<span className="text-xs text-muted-foreground ml-1">(Básico, Destaque e Premium)</span>` após o label.

#### 4. Aviso de configuração personalizada

Adicionar lógica que compara o estado atual dos checkboxes com `TIER_VISIBILITY_DEFAULTS[form.partner_tier]`. Se houver divergência, exibir um alerta discreto no topo da aba Exibição:

```text
┌─────────────────────────────────────────────┐
│ ⚠ Configuração de exibição personalizada    │
│ As opções abaixo diferem do padrão do       │
│ nível "Destaque".                           │
└─────────────────────────────────────────────┘
```

Usando um `<div>` com `bg-amber-50 border-amber-200 text-amber-800` (estilo alerta discreto). Aparece apenas quando há divergência.

#### 5. Descrição introdutória atualizada

Substituir o texto introdutório por algo como: "A configuração abaixo foi definida automaticamente com base no nível **{TIER_LABELS[tier]}**. Você pode ajustar manualmente se necessário."

### Sem alteração de dados

Lógica de persistência e estrutura do modal permanecem iguais. Apenas comportamento de auto-preenchimento e comunicação visual mudam.

