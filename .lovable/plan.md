

# Banner Hero — Upload de Imagem + Renderização Responsiva

## Resumo

Substituir o campo de URL por upload direto de imagem no admin e no modal de edição inline, criar um bucket de storage dedicado, e melhorar a renderização do hero na vitrine pública com alturas responsivas e overlay consistente.

---

## Mudanças

### 1. Storage Bucket (Migration SQL)

Criar bucket `company-covers` (público), seguindo o padrão do `company-logos` existente. Adicionar policy de storage para upload autenticado por gerente.

```sql
INSERT INTO storage.buckets (id, name, public) VALUES ('company-covers', 'company-covers', true);

-- Policy: gerente pode fazer upload/update/delete de covers da própria empresa
CREATE POLICY "Gerentes can manage company covers"
ON storage.objects FOR ALL
USING (bucket_id = 'company-covers' AND auth.role() = 'authenticated')
WITH CHECK (bucket_id = 'company-covers' AND auth.role() = 'authenticated');
```

### 2. Admin `/admin/empresa` — Aba Vitrine Pública (`Company.tsx`)

Substituir o `<Input>` de URL (linhas 1503-1523) por um componente de upload idêntico ao padrão de logo já existente:

- `<input type="file" accept="image/jpeg,image/png,image/webp" />` (hidden)
- Botão "Enviar imagem de capa" / "Alterar imagem"
- Validação: max 5MB, formatos JPG/PNG/WEBP
- Upload para `company-covers/cover-{companyId}.{ext}` com `upsert: true`
- Após upload: salvar URL pública em `cover_image_url` e atualizar form state
- Preview da imagem com aspect ratio ~2000x900 (usando `object-cover`)
- Texto informativo abaixo:
  ```
  Tamanho recomendado: 2000 × 900 pixels
  Formatos aceitos: JPG, PNG ou WEBP — Máximo: 5MB
  Dica: Use uma imagem horizontal. O centro será priorizado em telas menores.
  ```
- Botão "Remover imagem" quando houver capa (seta `cover_image_url` para null)

### 3. Modal Edição Inline (`EditHeroModal.tsx`)

Substituir o `<Input>` de URL pelo mesmo componente de upload:

- Upload direto para `company-covers/cover-{companyId}.{ext}`
- Preview inline no modal
- Manter o select de `background_style`
- Mesmas validações (5MB, formatos)

### 4. Renderização Responsiva do Hero (`PublicCompanyShowcase.tsx`)

Alterar a section do hero:

- **Alturas responsivas**: `h-[280px] sm:h-[420px]` (substituindo `py-10 sm:py-14`)
- **Overlay padrão**: quando `background_style === 'cover_overlay'` e há imagem, aplicar `linear-gradient(rgba(0,0,0,0.35), rgba(0,0,0,0.35))` como overlay (já existe similar, ajustar para 0.35 conforme pedido)
- **object-fit: cover + object-position: center** na imagem de fundo
- Centralizar conteúdo vertical com flexbox
- Manter fallbacks para `solid` e `subtle_gradient` (sem mudança de altura fixa nesses casos, usar padding como hoje)

### 5. Compatibilidade

- O `handleSubmit` em `Company.tsx` continua salvando `cover_image_url` normalmente (agora será URL do storage em vez de URL externa)
- O modal `EditHeroModal` continua usando `onSave` callback para atualizar state local no Showcase
- Nenhuma mudança de schema no banco — `cover_image_url` continua sendo text

---

## Arquivos

| Arquivo | Ação |
|---------|------|
| Migration SQL | Criar bucket `company-covers` + policy |
| `src/pages/admin/Company.tsx` | Substituir input URL por upload (aba Vitrine) |
| `src/components/public/showcase/EditHeroModal.tsx` | Substituir input URL por upload |
| `src/pages/public/PublicCompanyShowcase.tsx` | Hero responsivo com alturas fixas e overlay |

