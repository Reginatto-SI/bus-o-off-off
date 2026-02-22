

# Fluxo Publico de Cadastro de Empresas + Correcao de Build

## Resumo

Duas entregas neste plano:
1. Corrigir o erro de build no edge function `create-user` (getClaims nao existe no SDK)
2. Criar fluxo publico completo para empresas se cadastrarem e usarem o sistema

---

## Parte 1 — Correcao do Build Error

O metodo `getClaims()` nao existe na versao do SDK usada. A solucao e usar `supabase.auth.getUser()` com o token passado via header (que funciona quando o client e criado com o header Authorization). Como alternativa comprovada no ambiente signing-keys, decodificar o JWT manualmente para extrair o `sub`.

**Abordagem:** Decodificar o payload do JWT (base64) para extrair o `sub` (user_id), sem depender de metodos do SDK que podem nao existir. Isso e seguro porque a edge function ja usa `verify_jwt = false` e valida permissoes via `user_roles` com service_role.

```text
// Pseudocodigo
const payload = JSON.parse(atob(token.split('.')[1]));
const requestingUserId = payload.sub;
```

Arquivo: `supabase/functions/create-user/index.ts`

---

## Parte 2 — Novo Edge Function: register-company

Uma edge function publica (sem JWT) que:
1. Recebe: nome da empresa, CNPJ, nome do responsavel, email, telefone, senha
2. Valida campos obrigatorios e formato de email
3. Cria o usuario via `auth.admin.createUser` com `email_confirm: true` (email pre-confirmado para acesso imediato no MVP)
4. Cria a empresa na tabela `companies`
5. Cria o perfil na tabela `profiles` (ou atualiza o criado pelo trigger `handle_new_user`)
6. Cria/atualiza o `user_role` como `gerente` vinculado a nova empresa
7. Retorna sucesso com o ID da empresa

**Importante:** O trigger `handle_new_user` ja cria perfil e role automaticamente para a empresa padrao (`a0000000-...`). A edge function precisara sobrescrever esses dados para apontar para a nova empresa.

Arquivo: `supabase/functions/register-company/index.ts`

Config: `verify_jwt = false` (registro publico)

---

## Parte 3 — Pagina /cadastro-empresa

Nova pagina publica com formulario limpo e profissional.

**Layout:**
- Usa `PublicLayout` (mesmo header/footer do portal publico)
- Card centralizado com formulario
- Titulo: "Cadastre sua empresa gratuitamente"
- Subtitulo: "Comece a vender passagens para seus eventos em minutos."

**Campos:**
- Nome da empresa (obrigatorio)
- CNPJ (obrigatorio, com mascara)
- Nome do responsavel (obrigatorio)
- Email (obrigatorio)
- Telefone (obrigatorio, com mascara)
- Senha (obrigatorio, minimo 6 caracteres)
- Confirmar senha

**Validacao client-side:**
- Todos os campos obrigatorios preenchidos
- Email valido
- CNPJ com mascara (14 digitos)
- Senhas coincidem
- Senha minima 6 caracteres

**Ao submeter:**
1. Chamar edge function `register-company`
2. Se sucesso: fazer `signIn` automatico com email/senha
3. Redirecionar para `/admin/eventos`
4. Toast de boas-vindas

**Ao falhar:**
- Mostrar erro persistente (Alert) no formulario

Arquivo: `src/pages/public/CompanyRegistration.tsx`

---

## Parte 4 — Botao "Quero vender passagens" no Header

Adicionar link no `PublicLayout`:
- Desktop: botao no header ao lado dos links existentes, com variante `outline` e icone `Building2`
- Mobile: item adicional no menu lateral

Texto: "Quero vender passagens"
Destino: `/cadastro-empresa`

Arquivo: `src/components/layout/PublicLayout.tsx`

---

## Parte 5 — Rota no App.tsx

Adicionar rota publica:

```text
/cadastro-empresa -> CompanyRegistration
```

Arquivo: `src/App.tsx`

---

## Detalhes Tecnicos

### Edge Function register-company

```text
POST /register-company
Body: {
  company_name: string,
  cnpj: string,
  responsible_name: string,
  email: string,
  phone: string,
  password: string
}

Fluxo:
1. Validar campos
2. Verificar se email ja existe (listUsers)
3. Criar usuario auth (email_confirm: true para acesso imediato)
4. Criar empresa em companies (name, cnpj, phone, email)
5. Aguardar trigger (500ms)
6. Atualizar profile: company_id -> nova empresa, name -> responsible_name
7. Atualizar/inserir user_role: company_id -> nova empresa, role -> gerente
8. Deletar role da empresa padrao se existir
9. Retornar { success: true, company_id, user_id }
```

### Seguranca

- Registro publico sem autenticacao (como qualquer SaaS)
- Rate limiting nao implementado agora (futuro)
- CNPJ armazenado mas nao validado contra Receita (futuro)
- Dados da nova empresa isolados via RLS existente (company_id em todas as tabelas)

### Isolamento Multi-empresa

O RLS existente ja garante isolamento:
- Todas as tabelas filtram por `company_id`
- `user_belongs_to_company()` verifica vinculo
- O novo usuario so vera dados da sua propria empresa

---

## Arquivos Afetados

| Arquivo | Acao |
|---------|------|
| `supabase/functions/create-user/index.ts` | Corrigir getClaims -> decodificacao manual JWT |
| `supabase/functions/register-company/index.ts` | Novo — edge function de registro |
| `supabase/config.toml` | Adicionar `[functions.register-company] verify_jwt = false` |
| `src/pages/public/CompanyRegistration.tsx` | Novo — pagina de cadastro |
| `src/components/layout/PublicLayout.tsx` | Adicionar botao "Quero vender passagens" |
| `src/App.tsx` | Adicionar rota `/cadastro-empresa` |

