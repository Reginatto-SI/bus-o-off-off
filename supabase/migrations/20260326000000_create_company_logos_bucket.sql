-- Bucket de logos das empresas para uso em tela pública, PDF e imagem do QR.
INSERT INTO storage.buckets (id, name, public)
VALUES ('company-logos', 'company-logos', true)
ON CONFLICT (id) DO NOTHING;

-- Leitura pública das logos para uso no portal público e documentos gerados.
DROP POLICY IF EXISTS "Public can view company logos" ON storage.objects;
CREATE POLICY "Public can view company logos"
ON storage.objects FOR SELECT
USING (bucket_id = 'company-logos');

-- Upload por usuários autenticados do painel admin.
DROP POLICY IF EXISTS "Authenticated users can upload company logos" ON storage.objects;
CREATE POLICY "Authenticated users can upload company logos"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'company-logos'
  AND auth.role() = 'authenticated'
);

-- Atualização por usuários autenticados do painel admin.
DROP POLICY IF EXISTS "Authenticated users can update company logos" ON storage.objects;
CREATE POLICY "Authenticated users can update company logos"
ON storage.objects FOR UPDATE
USING (bucket_id = 'company-logos' AND auth.role() = 'authenticated')
WITH CHECK (bucket_id = 'company-logos' AND auth.role() = 'authenticated');

-- Exclusão por usuários autenticados do painel admin.
DROP POLICY IF EXISTS "Authenticated users can delete company logos" ON storage.objects;
CREATE POLICY "Authenticated users can delete company logos"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'company-logos'
  AND auth.role() = 'authenticated'
);
