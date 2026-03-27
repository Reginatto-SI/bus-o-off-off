

# Plano: Padronizar Templates de E-mail + Corrigir Build Errors

## Parte 1: Corrigir Build Errors em Users.tsx

Dois erros de tipo onde `operational_role` (string do banco) precisa ser castado para `MotoristaOperationalRole`:

**Arquivo:** `src/pages/admin/Users.tsx`

1. **Linha 334** — No mapeamento de dados, castar `role.operational_role`:
   ```typescript
   operational_role: (role.operational_role === 'auxiliar_embarque' ? 'auxiliar_embarque' : 'motorista') as MotoristaOperationalRole,
   ```

2. **Linha 623-626** — No `handleEditUser`, o cast já existe mas o `setForm` na linha 631 recebe tipo `string`. Garantir que `baseForm.operational_role` tenha o tipo correto com cast explícito.

---

## Parte 2: Padronizar Templates de E-mail de Autenticação

Alterar apenas textos nos 6 templates existentes em `supabase/functions/_shared/email-templates/`. Sem mudança de layout, cores ou estrutura.

### Mudancas em todos os templates:

- Substituir qualquer referencia a `{siteName}` nos textos por constante hardcoded **"SmartBus BR"** (o siteName vem do sistema e pode conter nomes errados como "busaooofoof")
- Padronizar rodape em todos:
  ```
  SmartBus BR — Plataforma de venda de passagens e gestao de viagens.
  Este e um e-mail automatico. Se voce nao reconhece esta acao, ignore com seguranca.
  ```
- Melhorar CTAs conforme solicitado

### Template por template:

| Template | Subject | CTA | Ajuste de corpo |
|---|---|---|---|
| `signup.tsx` | "Confirme seu e-mail — SmartBus BR" | "Confirmar meu e-mail" | Texto mais direto sobre conta criada |
| `recovery.tsx` | "Criar nova senha — SmartBus BR" | "Criar nova senha" | Contexto: "Recebemos uma solicitacao..." |
| `invite.tsx` | "Voce foi convidado — SmartBus BR" | "Aceitar convite" | Contexto sobre acesso a plataforma |
| `magic-link.tsx` | "Seu link de acesso — SmartBus BR" | "Acessar minha conta" | Texto direto |
| `email-change.tsx` | "Confirmacao de alteracao de e-mail — SmartBus BR" | "Confirmar alteracao" | Manter clareza |
| `reauthentication.tsx` | sem botao (codigo) | N/A | Padronizar rodape |

### O que NAO sera alterado:
- Cores (laranja #f07d00 mantida)
- Layout/estrutura HTML
- Logica do auth-email-hook
- Sistema de envio
- Nenhum outro arquivo

### Deploy
Apos editar os templates, redeploy de `auth-email-hook` para que as mudancas entrem em vigor.

