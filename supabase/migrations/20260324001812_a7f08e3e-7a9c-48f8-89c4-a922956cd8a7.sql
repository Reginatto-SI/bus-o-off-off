-- Limpeza: remover 4 usuários órfãos de homologação que ficaram sem vínculo em user_roles.
-- Causa: edge function create-user estava com runtime desatualizado no momento da criação.
-- Todos são e-mails @example.com de testes automatizados.
DELETE FROM public.profiles 
WHERE id IN (
  'c0b866ee-c6f8-48df-98d9-793a2ee3f975',
  '465b357c-9731-4b6f-a2e5-6711fd8651c0',
  '99a180e1-8a58-4b9e-bf54-99bdfc842c36',
  '8145f278-7eb8-4bc2-93cc-f5e7bcbd24de'
)
AND NOT EXISTS (
  SELECT 1 FROM public.user_roles ur WHERE ur.user_id = profiles.id
);