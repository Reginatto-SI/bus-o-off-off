-- Parte 1.1: Adicionar coluna image_url na tabela events
ALTER TABLE public.events 
  ADD COLUMN IF NOT EXISTS image_url text;

COMMENT ON COLUMN public.events.image_url IS 'URL da imagem/banner do evento para exibição no mobile e portal público';

-- Parte 1.2: Criar bucket para imagens de eventos
INSERT INTO storage.buckets (id, name, public)
VALUES ('event-images', 'event-images', true)
ON CONFLICT (id) DO NOTHING;

-- RLS para permitir visualização pública das imagens
CREATE POLICY "Public can view event images"
ON storage.objects FOR SELECT
USING (bucket_id = 'event-images');

-- RLS para permitir upload por usuários autenticados
CREATE POLICY "Authenticated users can upload event images"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'event-images' 
  AND auth.role() = 'authenticated'
);

-- RLS para permitir atualização por usuários autenticados
CREATE POLICY "Authenticated users can update event images"
ON storage.objects FOR UPDATE
USING (bucket_id = 'event-images' AND auth.role() = 'authenticated')
WITH CHECK (bucket_id = 'event-images' AND auth.role() = 'authenticated');

-- RLS para permitir exclusão por usuários autenticados
CREATE POLICY "Authenticated users can delete event images"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'event-images' 
  AND auth.role() = 'authenticated'
);