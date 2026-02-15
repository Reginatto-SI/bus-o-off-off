

# Melhorias no Cadastro de Vendedores (Admin)

## Problema

A tela `/admin/vendedores` esta incompleta para operacao profissional. Faltam dados de contato, link de venda visivel e resumo de vendas por vendedor.

## O que sera feito

### 1. Adicionar colunas na tabela `sellers` (migracao de banco)

Novas colunas (todas opcionais para nao quebrar cadastros existentes):

| Coluna | Tipo | Descricao |
|--------|------|-----------|
| phone | text | Telefone/WhatsApp |
| email | text | E-mail do vendedor |
| cpf | text | CPF |
| pix_key | text | Chave Pix (para pagamento manual de comissao) |
| notes | text | Observacoes livres |

### 2. Atualizar o modal de cadastro/edicao

Reorganizar as abas do modal:

**Aba "Identificacao"** (existente, expandida):
- Nome (ja existe)
- CPF (novo)
- Telefone (novo)
- E-mail (novo)
- Status (ja existe)

**Aba "Comissao"** (existente, expandida):
- Comissao % (ja existe)
- Chave Pix (novo)
- Observacoes (novo)

### 3. Adicionar coluna "Link de Venda" na tabela e acoes

Na listagem de vendedores, adicionar:
- Coluna **Telefone** na tabela
- Acao **"Copiar Link de Venda"** no dropdown de acoes de cada vendedor
- O link e montado como: `{origin}/eventos?ref={seller.id}`
- Ao clicar, copia para a area de transferencia com feedback visual (toast)

### 4. Adicionar resumo de vendas por vendedor na tabela

Buscar da tabela `sales` agrupado por `seller_id`:
- Coluna **Vendas** (quantidade de vendas pagas)
- Coluna **Total Vendido** (soma do valor bruto das vendas pagas)

Isso permite que o gerente veja rapidamente o desempenho de cada vendedor sem sair da tela.

### 5. Atualizar exportacao (Excel/PDF)

Incluir as novas colunas nos exports:
- Telefone, E-mail, CPF, Chave Pix, Vendas, Total Vendido

---

## Detalhes Tecnicos

### Migracao de banco
```sql
ALTER TABLE public.sellers
  ADD COLUMN phone text,
  ADD COLUMN email text,
  ADD COLUMN cpf text,
  ADD COLUMN pix_key text,
  ADD COLUMN notes text;
```

### Arquivos modificados
| Arquivo | Alteracao |
|---------|-----------|
| `src/pages/admin/Sellers.tsx` | Modal expandido, colunas na tabela, acao "Copiar Link", busca de vendas por seller |
| `src/types/database.ts` | Atualizar interface `Seller` com novos campos |

### Nenhuma nova dependencia
Reutiliza componentes existentes (Input, Label, Textarea, toast, etc.)

### RLS
Nenhuma alteracao necessaria. As policies existentes em `sellers` ja cobrem os novos campos (sao colunas da mesma tabela).

---

## O que NAO sera feito
- Calculo automatico de comissao ou repasse
- Integracao com Pix/pagamento automatico
- Relatorios avancados (permanecem "Em breve")

O campo `pix_key` e apenas informativo para o gerente consultar na hora de fazer o pagamento manual.

