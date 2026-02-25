

# Aba "Identidade Visual" com Paleta de Cores Predefinidas

## Resumo

Adicionar nova aba "Identidade Visual" na tela `/admin/empresa` com seletor de cores predefinidas (swatches), preview em tempo real, e aplicacao automatica das cores no sistema administrativo e nos tickets.

---

## Parte 1 — Migracao de Banco

A tabela `companies` ja tem `primary_color` (default `#F97316`). Adicionar duas colunas novas:

```sql
ALTER TABLE public.companies ADD COLUMN accent_color text DEFAULT '#1D4ED8';
ALTER TABLE public.companies ADD COLUMN ticket_color text DEFAULT '#F97316';
```

Nenhuma RLS adicional necessaria — as politicas existentes ja cobrem ALL para gerentes e SELECT para usuarios da empresa.

---

## Parte 2 — Atualizar tipo Company no frontend

Adicionar em `src/types/database.ts`:
- `accent_color: string | null;`
- `ticket_color: string | null;`

---

## Parte 3 — Nova aba no Company.tsx

Adicionar uma nova `TabsTrigger` "Identidade Visual" com icone `Palette` entre "Observacoes" e "Pagamentos".

### Conteudo da aba

**(A) Secao "Cores do Sistema"**

Dois seletores de swatches:
- **Cor Primaria** (botoes principais, destaques) — usa `primary_color`
- **Cor de Destaque** (accent, detalhes menores) — usa `accent_color`

**(B) Secao "Cores da Passagem"**

Um seletor de swatch:
- **Cor principal da passagem** — usa `ticket_color`

### Paleta predefinida (10 cores)

```text
Laranja (padrao)  #F97316
Azul Royal        #2563EB
Azul Marinho      #1E3A5F
Verde             #16A34A
Verde Escuro      #15803D
Roxo              #7C3AED
Vermelho          #DC2626
Turquesa          #0891B2
Cinza Grafite     #4B5563
Preto             #18181B
```

Cada swatch: circulo de 32px com borda, nome abaixo, ring de selecao quando ativo.

### UX

- Label clara acima de cada seletor
- Indicacao visual do swatch selecionado (ring + checkmark)
- Validacao: se primaria === destaque, exibir aviso (nao bloquear)
- Botao "Restaurar padrao" que reseta para Laranja/Azul Royal/Laranja
- O botao "Salvar alteracoes" do formulario principal ja cobre o salvamento

### Preview em tempo real

Bloco de preview compacto abaixo dos seletores:
- Um botao ficticio (mostrando cor primaria)
- Um badge/chip (mostrando cor de destaque)
- Um mini-card simulando passagem (faixa colorida com `ticket_color`)

---

## Parte 4 — Aplicacao automatica das cores

No `AuthContext.tsx` ou no `AdminLayout.tsx`, ao carregar `activeCompany`:
- Setar CSS custom properties no `document.documentElement`:
  - `--primary` com HSL da `primary_color`
  - `--ring` com HSL da `primary_color`
- Isso faz com que todos os botoes `bg-primary` e elementos que usam `--primary` reflitam a cor da empresa automaticamente.
- Ao deslogar ou sem config, restaurar os valores padrao.

Para o accent, setar `--accent-foreground` com a cor de destaque.

Para o ticket, a cor ja e passada via `companyPrimaryColor` nos renderers — atualizar para usar `ticket_color` quando disponivel.

---

## Parte 5 — Atualizar renderers de ticket

Nos arquivos que usam `companyPrimaryColor`:
- `src/pages/public/Confirmation.tsx`
- `src/pages/admin/Sales.tsx`
- `src/components/admin/NewSaleModal.tsx`

Adicionar fallback: `company.ticket_color || company.primary_color || '#F97316'`

---

## Arquivos afetados

| Arquivo | Acao |
|---------|------|
| Migracao SQL | Adicionar `accent_color` e `ticket_color` |
| `src/types/database.ts` | Adicionar campos |
| `src/pages/admin/Company.tsx` | Nova aba + seletores + preview |
| `src/components/layout/AdminLayout.tsx` | Aplicar CSS custom properties |
| `src/pages/public/Confirmation.tsx` | Usar `ticket_color` |
| `src/pages/admin/Sales.tsx` | Usar `ticket_color` |
| `src/components/admin/NewSaleModal.tsx` | Usar `ticket_color` |
| `src/lib/pdfUtils.ts` | Adicionar helper para ticket_color |

Nenhuma logica de CRUD, RLS ou estrutura multiempresa e alterada. Apenas visual e persistencia de preferencias.

