
-- Create company-covers bucket (public, like company-logos)
INSERT INTO storage.buckets (id, name, public)
VALUES ('company-covers', 'company-covers', true)
ON CONFLICT (id) DO NOTHING;

-- Policy: authenticated users can upload/manage covers
CREATE POLICY "Authenticated can manage company covers"
ON storage.objects FOR ALL
USING (bucket_id = 'company-covers' AND auth.role() = 'authenticated')
WITH CHECK (bucket_id = 'company-covers' AND auth.role() = 'authenticated');
