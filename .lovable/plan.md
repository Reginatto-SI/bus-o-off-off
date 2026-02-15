
# Plano: Area do Vendedor Mobile-First + Blindagem do `ref`

## Diagnostico do Estado Atual

### O que ja esta pronto
- **Rastreio `ref`**: O parametro `?ref=sellerId` ja e propagado por todo o fluxo publico (`PublicEvents` -> `PublicEventDetail` -> `Checkout`)
- **Gravacao `seller_id`**: No Checkout (linha 615), `sellerRef` e gravado diretamente como `seller_id` na tabela `sales`
- **Tela "Minhas Vendas"**: Existe em `/admin/minhas-vendas` com KPIs (passagens vendidas, total vendido, comissao estimada), historico de vendas e botao "Gerar Link de Venda"
- **CRUD de Vendedores**: Tela `/admin/vendedores` completa para gerentes criarem/editarem vendedores
- **Sidebar**: "Minhas Vendas" aparece no grupo "Vendas & Comissao" com `roles: ['vendedor']`

### O que falta / esta errado
1. **"Minhas Vendas" usa `AdminLayout`** (sidebar desktop) -- vendedor deveria usar layout mobile-first, fora do admin
2. **Sem validacao do `ref`**: Qualquer UUID e aceito como `seller_id`. Nao valida se existe, se esta ativo, nem se pertence a mesma empresa do evento
3. **Sem acesso mobile dedicado**: O header publico (`PublicLayout`) nao tem link para "Area do Vendedor"
4. **Nenhum comentario** esclarece que vendedor e rastreio comercial, sem relacao com Stripe

### O que NAO deve ser feito agora
- Comissao automatica / calculo de repasse
- Integracao vendedor com Stripe
- Relatorios avancados (permanecem "Em breve")
- Dashboard consolidado de comissoes

---

## Alteracoes Planejadas

### 1. Nova rota `/vendedor/minhas-vendas` com layout mobile-first

Criar uma nova pagina `src/pages/seller/SellerDashboard.tsx` que:

- **Nao usa `AdminLayout`** -- usa um layout proprio leve e mobile-first (sem sidebar admin)
- Inclui header simples com logo, nome do vendedor e botao de logout
- Exige autenticacao (redireciona para `/login` se nao logado)
- Exige `role === 'vendedor'` (mostra mensagem de erro se outro perfil)

**Conteudo da tela:**
- KPIs em cards empilhaveis (mobile): Passagens vendidas, Total vendido (R$), Vendas pagas, Vendas reservadas
- Filtros simples (colapsaveis no mobile): periodo (de/ate) + status (todos/pago/reservado/cancelado)
- Lista de vendas em formato card (nao tabela) -- otimizado para mobile
- Botao fixo "Compartilhar Link de Venda" com acao de copiar e usar Web Share API quando disponivel

A logica de dados e reutilizada da tela `MySales.tsx` existente (query por `seller_id`).

### 2. Rota e navegacao

**App.tsx**: Adicionar rota `/vendedor/minhas-vendas` apontando para `SellerDashboard`.

**PublicLayout.tsx**: Adicionar link "Area do Vendedor" no header publico, entre "Minhas Passagens" e "Area Administrativa". O link aponta para `/vendedor/minhas-vendas`.

**AdminSidebar.tsx**: Manter "Minhas Vendas" no sidebar admin (com `roles: ['vendedor']`) como atalho secundario, mas a URL passa a ser `/vendedor/minhas-vendas` (mesma pagina, fora do layout admin). Alternativa: redirecionar a rota antiga `/admin/minhas-vendas` para `/vendedor/minhas-vendas`.

### 3. Blindagem do `ref` no Checkout

No `Checkout.tsx`, antes de gravar `seller_id` na venda, adicionar validacao:

```text
1. Se sellerRef existe:
   a. Buscar na tabela sellers: id = sellerRef
   b. Verificar status = 'ativo'
   c. Verificar company_id = event.company_id
2. Se qualquer validacao falha: ignorar ref (seller_id = null)
3. Se valido: gravar seller_id normalmente
```

Isso impede que um UUID aleatorio ou vendedor de outra empresa seja associado a venda.

### 4. Comentarios explicitos no codigo

Adicionar comentarios padronizados nos pontos-chave:

- **Checkout.tsx** (onde le `ref` e grava `seller_id`):
  `// Vendedor e rastreio comercial (link/ref). Comissao de vendedor e manual e fora do Stripe.`
  `// Stripe apenas confirma pagamento da venda (sale_status), independente de vendedor.`

- **SellerDashboard.tsx** (novo):
  `// Tela do vendedor: apenas visualizacao de vendas rastreadas via ref. Sem integracao com Stripe.`

- **create-checkout-session** e **stripe-webhook** (edge functions):
  `// seller_id nao participa do fluxo Stripe. Comissao do vendedor e apurada manualmente pelo gerente.`

### 5. Pagina MySales existente

A pagina `/admin/minhas-vendas` atual (`MySales.tsx`) sera transformada em um redirect para `/vendedor/minhas-vendas`, mantendo compatibilidade com bookmarks existentes.

---

## Detalhes Tecnicos

### Arquivos criados
| Arquivo | Descricao |
|---------|-----------|
| `src/pages/seller/SellerDashboard.tsx` | Tela mobile-first do vendedor com KPIs, filtros e lista de vendas |

### Arquivos modificados
| Arquivo | Alteracao |
|---------|-----------|
| `src/App.tsx` | Adicionar rota `/vendedor/minhas-vendas`; redirecionar `/admin/minhas-vendas` |
| `src/pages/public/Checkout.tsx` | Validar `ref` contra tabela `sellers` antes de gravar; comentarios |
| `src/components/layout/PublicLayout.tsx` | Link "Area do Vendedor" no header |
| `src/components/layout/AdminSidebar.tsx` | Atualizar href de "Minhas Vendas" para `/vendedor/minhas-vendas` |
| `supabase/functions/create-checkout-session/index.ts` | Comentario explicito sobre seller_id vs Stripe |
| `supabase/functions/stripe-webhook/index.ts` | Comentario explicito sobre seller_id vs Stripe |

### Nenhuma alteracao de banco de dados
Nao e necessaria nenhuma migracão. A tabela `sellers` ja tem `status` e `company_id`.

### Sem novas dependencias
Reutiliza componentes existentes (Card, Badge, Button, StatusBadge, etc.)
