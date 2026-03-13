
-- Drop the incorrect unique constraint on (user_id, role)
ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_user_id_role_key;

-- Add the correct unique constraint on (user_id, company_id) to allow same role in different companies
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_user_id_company_id_key UNIQUE (user_id, company_id);
