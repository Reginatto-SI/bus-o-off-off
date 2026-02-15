

# Link Curto + QR Code SVG para Vendedores

## Resumo

Criar um sistema interno de link curto para vendedores e adicionar modal de QR Code com download em SVG na tela `/admin/vendedores`.

---

## 1. Link curto interno

### Abordagem

Adicionar uma coluna `short_code` na tabela `sellers` com um codigo alfanumerico curto (6 caracteres, gerado a partir do UUID do vendedor, estavel e unico). Criar uma rota publica `/v/:code` que busca o vendedor pelo `short_code` e redireciona para `/eventos?ref={seller.id}`.

### Migracao SQL

```sql
ALTER TABLE public.sellers ADD COLUMN short_code text UNIQUE;

-- Gerar codigos para vendedores existentes (6 chars do UUID)
UPDATE public.sellers SET short_code = UPPER(LEFT(REPLACE(id::text, '-', ''), 6))
WHERE short_code IS NULL;

ALTER TABLE public.sellers ALTER COLUMN short_code SET NOT NULL;
ALTER TABLE public.sellers ALTER COLUMN short_code SET DEFAULT UPPER(LEFT(REPLACE(gen_random_uuid()::text, '-', ''), 6));
```

### RLS para rota publica

```sql
CREATE POLICY "Public can resolve seller short_code"
  ON public.sellers FOR SELECT
  TO anon, authenticated
  USING (true);
```

Na verdade, ja existe a policy "Users can view sellers of their company" mas ela exige autenticacao. A rota `/v/:code` sera publica (sem login), entao precisa de uma policy SELECT para anon que retorne apenas o necessario. Porem, como RLS filtra linhas e nao colunas, a rota so buscara `id` e `short_code` via `.select('id, short_code')`.

Alternativa mais segura: criar uma funcao RPC publica que recebe o short_code e retorna o seller_id sem expor a tabela inteira.

**Decisao**: usar RPC publica para manter a tabela sellers protegida.

```sql
CREATE OR REPLACE FUNCTION public.resolve_seller_short_code(code text)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT id FROM public.sellers WHERE short_code = code AND status = 'ativo' LIMIT 1;
$$;
```

### Nova rota e pagina de redirecionamento

- Arquivo: `src/pages/public/SellerRedirect.tsx`
- Rota: `/v/:code`
- Comportamento: chama a RPC, se encontrar redireciona para `/eventos?ref={sellerId}`, senao mostra 404

### Atualizacao no App.tsx

Adicionar `<Route path="/v/:code" element={<SellerRedirect />} />` nas rotas publicas.

---

## 2. Atualizacao do "Copiar Link de Venda"

No `Sellers.tsx`, a funcao `handleCopyLink` passara a copiar o link curto (`{origin}/v/{short_code}`). Se `short_code` estiver vazio (fallback), copia o link longo e avisa.

---

## 3. Modal de QR Code

### Novo componente: `src/components/admin/SellerQRCodeModal.tsx`

- Recebe: `seller` (com `short_code`), `open`, `onOpenChange`
- Exibe:
  - QR Code grande usando `QRCodeSVG` do `qrcode.react` (ja instalado)
  - Texto do link curto com botao "Copiar"
  - Botao "Baixar SVG" (serializa o SVG do DOM e faz download)
  - Botao "Baixar PNG" (renderiza o SVG em canvas e exporta)

### Menu de acoes atualizado

No `getSellerActions`, adicionar opcao "Ver QR Code" que abre o modal.

---

## 4. Atualizacao do tipo Seller

Adicionar `short_code` na interface `Seller` em `src/types/database.ts`. O arquivo `types.ts` gerado automaticamente sera atualizado pela migracao.

---

## Arquivos modificados/criados

| Arquivo | Tipo | Descricao |
|---------|------|-----------|
| Migracao SQL | Novo | Coluna `short_code`, default, RPC publica |
| `src/pages/public/SellerRedirect.tsx` | Novo | Pagina de redirecionamento `/v/:code` |
| `src/components/admin/SellerQRCodeModal.tsx` | Novo | Modal com QR Code + download SVG/PNG |
| `src/App.tsx` | Editado | Adicionar rota `/v/:code` |
| `src/pages/admin/Sellers.tsx` | Editado | Copiar link curto + acao "Ver QR Code" |
| `src/types/database.ts` | Editado | Adicionar `short_code` ao tipo Seller |

## Sem novas dependencias

O projeto ja possui `qrcode.react` instalado. Sera usado `QRCodeSVG` (exportado pela mesma lib) em vez de `QRCodeCanvas`.

