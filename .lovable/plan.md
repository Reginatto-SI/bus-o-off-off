## Diagnóstico confirmado no banco

Existem **dois sistemas paralelos de representante** convivendo no projeto — e o caso da 7 FEST expõe exatamente esse conflito.

### Sistema A — `/admin/representante` (painel dentro do admin)
- Usa a RPC `get_company_representative_dashboard(company_id)`.
- Essa RPC chama `ensure_company_representative(company_id)`, que **cria automaticamente** um registro em `representatives` com `company_id = <empresa ativa>` e `user_id = NULL` toda vez que um gerente abre a tela.
- Fonte de verdade: `representatives.company_id`.

### Sistema B — `/representante/painel` (painel autônomo do representante)
- Usa `AuthContext.representativeProfile`, resolvido por `representatives.user_id = auth.uid()`.
- Registros criados por `/seja-representante` → edge function `register-representative`.
- Fonte de verdade: `representatives.user_id`, sem `company_id`.

### O que aconteceu com 7 FEST (dados reais do banco)
| Registro | Código | company_id | user_id | Wallet produção |
|---|---|---|---|---|
| 7 FEST (Sistema A) | `REP8AD8856` | `02a7485c…` (7 FEST) | `NULL` | vazio |
| Diego (Sistema B) | `REP2D57137` | `NULL` | `16c256c2…` (gerente 7 FEST) | vazio |
| Brayan (Sistema B) | `REP1732CB5` | `NULL` | `175c0190…` | **`14879ba0-46f2-42a3-892a-4d886e5d5444`** |

- A carteira `14879ba0…` foi salva no registro do **Brayan** (`REP1732CB5`) via `/representante/painel`.
- O `/admin/representante` da 7 FEST lê o registro `REP8AD8856` (resolvido por `company_id`), que nunca recebeu a carteira. Por isso mostra vazio.
- Brayan indicou a `ENCANTO TOUR VIAGENS` (código `REP1732CB5`), enquanto a 7 FEST oficialmente indicou `JD Viagens`, `JG Excursões` e `ENCANTO TOUR VIAGENS PARA MULHERES` com `REP8AD8856`. São duas identidades comerciais diferentes rodando em paralelo.
- Diego, gerente da 7 FEST, também tem um registro autônomo (`REP2D57137`) — se ele salvar carteira em `/representante/painel`, escreve nesse registro e continua não aparecendo em `/admin/representante`.

### Origem do conflito
- A ordem original (Fase 1→3) associava representante a `user_id` (Sistema B).
- Um passo posterior introduziu `ensure_company_representative` + coluna `company_id` para que qualquer empresa passasse a poder indicar outras (Sistema A), sem migrar/consolidar os registros existentes.
- Hoje há 12+ registros do Sistema A (com `company_id`, sem `user_id`) e 10+ do Sistema B (com `user_id`, sem `company_id`), todos misturados em `representatives`. Códigos como `REPB2B698F` e `REP2D57137` são do mesmo Diego em contextos diferentes.

## Impacto operacional
- Carteiras salvas por um lado não aparecem no outro.
- Comissões geradas nas indicações da 7 FEST (via `REP8AD8856`) nunca terão wallet para split enquanto ninguém entrar no registro certo pelo `/admin/representante` e salvar lá.
- Códigos duplicados por usuário aumentam risco de vínculos incoerentes em `representative_company_links`.

## Plano de resolução

### Passo 1 — Corrigir o caso 7 FEST (imediato, dado)
- Copiar a carteira `14879ba0-46f2-42a3-892a-4d886e5d5444` para o registro `REP8AD8856` (id `f6deb040-083e-4e4d-b399-0f7f04ba67c4`) em `asaas_wallet_id_production` e `asaas_wallet_id_sandbox`, para destravar as comissões das empresas já indicadas por 7 FEST.
- Confirmar no `/admin/representante` de 7 FEST que a carteira e o botão “Alterar carteira” refletem o valor.

### Passo 2 — Unificar a UX: uma única porta de entrada por perfil
- Definir que **`/admin/representante` é a única tela oficial** para qualquer empresa gerenciar sua identidade de representante (código, link, carteira, ledger).
- Redirecionar `/representante/painel` para `/admin/representante` quando o usuário logado for gerente de uma empresa (caso Diego). Manter o painel autônomo apenas para usuários **sem empresa** (representantes puros como Brayan).
- Ajustar o item de menu e o redirecionamento pós-login em `AuthContext` para respeitar essa regra.

### Passo 3 — Consolidar registros duplicados por usuário
- Para cada `user_id` do Sistema B que também é gerente de uma empresa (ex.: Diego), fazer merge no registro do Sistema A daquela empresa: preservar a carteira mais recente, migrar `representative_company_links` e `representative_commissions` para o `representative_id` sobrevivente, e desativar o duplicado.
- Manter intocados os representantes puros (com `user_id` e sem empresa vinculada, como Brayan) — eles continuam operando pelo painel autônomo.

### Passo 4 — Barrar a re-divergência
- Adicionar validação em `ensure_company_representative` e em `register-representative` para impedir criar um novo registro autônomo quando o `user_id` já é gerente de uma empresa com representante ativo.
- Documentar em `docs/PRD/Telas/prd-admin-representante.md` (novo) e atualizar `docs/PRD/Telas/prd-representante-painel.md` para deixar claro qual painel serve a qual perfil.

## Escopo técnico resumido
- Insert único em `representatives` (7 FEST) via `update_representative_wallet` RPC ou update direto.
- Ajuste de guardas em `src/pages/representative/RepresentativeDashboard.tsx` e `src/contexts/AuthContext.tsx` para o redirecionamento.
- Migração SQL para o merge dos duplicados.
- Ajuste defensivo nas funções `ensure_company_representative` e edge `register-representative`.

## Dúvidas antes de executar
1. Confirmar que a carteira `14879ba0…` de fato pertence à 7 FEST (e não só ao Brayan como pessoa). Se sim, aplico o Passo 1 agora.
2. Para o Passo 3, você aprova o merge automático dos representantes duplicados (mantendo a carteira mais recente e preservando histórico de vínculos e comissões)?
