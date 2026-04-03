

# Plano: Corrigir cadastro de representante + link no rodapé

## Causa raiz identificada

A edge function `register-representative` **não está registrada** em `supabase/config.toml` com `verify_jwt = false`. Como o cadastro é público (sem sessão autenticada), o gateway do Supabase rejeita a requisição com 401 antes que a função sequer inicie — por isso há zero logs e o frontend recebe "Failed to send a request to the Edge Function".

Todas as outras edge functions públicas do projeto (register-company, create-asaas-payment, etc.) possuem `verify_jwt = false` no config.toml. Esta é a única ausente.

## Mudanças propostas

### 1. Registrar a função no config.toml (causa raiz)

**Arquivo:** `supabase/config.toml`

Adicionar o bloco:
```toml
[functions.register-representative]
  verify_jwt = false
```

Isso permite que a chamada pública do frontend chegue à função sem token JWT.

### 2. Melhorar tratamento de erro no frontend

**Arquivo:** `src/pages/public/RepresentativeRegistration.tsx`

No `handleSubmit`, o bloco `catch` hoje expõe a mensagem crua do SDK ("Failed to send a request to the Edge Function"). Ajustar para:

- Exibir mensagem amigável: "Não foi possível concluir seu cadastro agora. Tente novamente em instantes."
- Registrar o erro real em `console.error` com contexto (etapa, função chamada)
- Tratar também o caso onde `fnError` vem sem `data` (resposta não-JSON do gateway)

### 3. Adicionar link no rodapé da landing page

**Arquivo:** `src/pages/public/LandingPage.tsx`

Na seção "Para empresas" do footer (após "Acessar painel", linha ~1967), adicionar um `<li>` com link para `/seja-representante` com texto "Seja um representante", usando exatamente o mesmo padrão visual dos links existentes (`text-sm text-white/40 transition-colors hover:text-white`).

## O que NÃO muda

- Lógica da edge function `register-representative` (já está correta)
- Fluxo de login, checkout, pagamentos
- Nenhuma outra edge function
- Nenhuma tabela ou RLS
- Nenhum outro componente visual

## Detalhes técnicos

| Item | Detalhe |
|---|---|
| Causa raiz | `verify_jwt = false` ausente no config.toml para `register-representative` |
| Arquivos alterados | `supabase/config.toml`, `src/pages/public/RepresentativeRegistration.tsx`, `src/pages/public/LandingPage.tsx` |
| Risco | Mínimo — mudança aditiva, sem alterar lógica existente |
| Reversível | Sim — remover a linha do config.toml reverte ao estado anterior |

