-- Concede EXECUTE da RPC para usuários autenticados.
-- O guard real (is_developer(auth.uid())) continua dentro da função, então
-- qualquer authenticated não-developer continua bloqueado pelo banco com 42501.
GRANT EXECUTE ON FUNCTION public.get_company_activation_report() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_company_activation_report() FROM anon, public;