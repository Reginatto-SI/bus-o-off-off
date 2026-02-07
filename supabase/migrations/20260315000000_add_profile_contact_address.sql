-- Adiciona campos de contato e endereço ao perfil do usuário
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS cpf TEXT,
  ADD COLUMN IF NOT EXISTS cep TEXT,
  ADD COLUMN IF NOT EXISTS street TEXT,
  ADD COLUMN IF NOT EXISTS number TEXT,
  ADD COLUMN IF NOT EXISTS complement TEXT,
  ADD COLUMN IF NOT EXISTS neighborhood TEXT,
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS state TEXT;

COMMENT ON COLUMN public.profiles.phone IS 'Telefone do usuário (apenas dígitos)';
COMMENT ON COLUMN public.profiles.cpf IS 'CPF do usuário (apenas dígitos)';
COMMENT ON COLUMN public.profiles.cep IS 'CEP do usuário (apenas dígitos)';
COMMENT ON COLUMN public.profiles.street IS 'Rua/Logradouro do usuário';
COMMENT ON COLUMN public.profiles.number IS 'Número do endereço do usuário';
COMMENT ON COLUMN public.profiles.complement IS 'Complemento do endereço do usuário';
COMMENT ON COLUMN public.profiles.neighborhood IS 'Bairro do usuário';
COMMENT ON COLUMN public.profiles.city IS 'Cidade do usuário';
COMMENT ON COLUMN public.profiles.state IS 'UF do usuário';
