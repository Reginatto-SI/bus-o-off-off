

## Plano: Correção do cálculo financeiro e consistência Passagens / Publicação / Stripe

### Problema identificado

Na **Etapa Publicação** (linha 3899), a comissão da plataforma é calculada sobre `basePrice` (preço base R$ 70,00), mas deveria ser sobre o **valor bruto cobrado do cliente** (base + taxas adicionais = R$ 77,00). O Stripe já recebe o valor correto (`gross_amount`), mas a interface mostra informação errada ao admin.

A **Etapa Passagens** mostra o total por passageiro corretamente, mas não exibe informações sobre a comissão da plataforma.

### Arquivo: `src/pages/admin/Events.tsx`

---

### 1. Corrigir Etapa 6 — Publicação (linhas 3878-3933)

Substituir o cálculo atual para incluir taxas adicionais:

```
basePrice = preço base da passagem
totalAdditionalFees = soma das taxas adicionais ativas (usando eventFees)
grossPerTicket = basePrice + totalAdditionalFees  ← NOVO
platformFee = grossPerTicket × platformFeePercent  ← FIX (antes era basePrice × %)
```

Quando `pass_platform_fee_to_customer = false`:
- Cliente paga: `grossPerTicket`
- Líquido empresa: `grossPerTicket - platformFee`

Quando `pass_platform_fee_to_customer = true`:
- Cliente paga: `grossPerTicket + platformFee`
- Líquido empresa: `grossPerTicket`

Novo layout do resumo:
- Preço base da passagem → R$ 70,00
- Taxas adicionais → R$ 7,00
- **Valor final ao cliente** → R$ 77,00 (destaque)
- Comissão da plataforma (7,5%) → R$ 5,78
- Responsável pela comissão → Organizador
- **Líquido estimado por ingresso** → R$ 71,22 (destaque, cor primária)
- Canais ativos → Online • Vendedor

---

### 2. Enriquecer Etapa 4 — Passagens (linhas 3790-3820)

Expandir a simulação de cálculo para também mostrar:
- Comissão da plataforma (quando disponível)
- Responsável pela comissão
- Líquido estimado por ingresso

Isso garante que o admin já visualize o impacto financeiro completo na etapa de precificação, antes mesmo de chegar na Publicação.

---

### 3. Stripe — já correto, sem alteração

O `create-checkout-session` (linha 119) já usa `gross_amount` que inclui taxas adicionais, e calcula a `applicationFee` sobre o bruto total. Nenhuma alteração necessária.

---

### Resumo

- 1 arquivo modificado: `Events.tsx`
- 0 alterações de banco ou edge functions
- Fix: cálculo da comissão na Publicação agora considera taxas adicionais
- Melhoria: simulação na Passagens mostra informação financeira completa
- Consistência garantida entre interface admin e valor cobrado no Stripe

