# Análise — popup de empresa inativa após login

## 1) Onde foi implementado o bloqueio visual

- O bloqueio visual global foi implementado no `AdminLayout`.
- Foi adicionado `AlertDialog` controlado por condição de bloqueio (`shouldBlockInactiveCompany`).
- O modal fica no layout autenticado admin, sem criação de tela/rota nova.

## 2) Como foi identificado que a empresa está inativa

A identificação usa duas verificações complementares no layout:

1. `activeCompany?.is_active === false` (quando a empresa ativa está resolvida no contexto).
2. Fallback para cenário sem empresa ativa resolvida:
   - consulta em `user_roles` com relação `companies(is_active)` para detectar vínculo com empresa inativa;
   - se houver vínculo inativo e usuário não for Developer, aplica bloqueio.

## 3) Como o modal impede avanço operacional

- O modal abre em modo obrigatório enquanto `shouldBlockInactiveCompany` for `true`.
- Não há ação de “fechar” para seguir operando.
- Ações disponíveis:
  - `Entrar em contato` (abre canal de suporte via WhatsApp);
  - `Sair` (logout).
- Resultado: usuário consegue logar, mas não consegue operar o sistema admin enquanto a empresa permanecer inativa.

## 4) Quais perfis são afetados

- Perfis não-Developer no admin quando vinculados a empresa inativa.
- `Developer` não é bloqueado, para preservar capacidade de reativação no fluxo administrativo.

## 5) O que NÃO foi alterado

- Não alterado fluxo de login/auth.
- Não alterado `AuthContext`.
- Não alterado RLS.
- Não alterado schema/migrations.
- Não criada rota nova.
- Não criada tela nova.
- Não implementada reativação automática por usuário comum.

## 6) Riscos remanescentes

1. O bloqueio foi implementado no layout administrativo; outras áreas autenticadas fora desse layout podem demandar validação dedicada.
2. Não há trilha de auditoria explícita nesta fase para tentativas de acesso em empresa inativa.
3. Canal de suporte está apontado para WhatsApp oficial reutilizado (sem nova integração), dependendo da disponibilidade operacional desse canal.
