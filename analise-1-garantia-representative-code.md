# Garantia do representative_code — Implementação complementar

## 1. O que foi ajustado

Foi implementada uma camada complementar para consolidar o `representative_code` como identificador comercial oficial do representante, com:
- geração automática no backend;
- formato oficial padronizado;
- unicidade protegida por índice único + geração com retry;
- link oficial previsível de indicação;
- consumo prioritário de `representative_code` no cadastro da empresa;
- fallback legado restrito para reduzir ambiguidade com `referral_code`.

## 2. Onde o representative_code passa a nascer

- Arquivo: `supabase/migrations/20261106100000_guarantee_representative_code_and_official_link.sql`
- Funções:
  - `public.generate_representative_code()`
  - `public.ensure_representative_code_and_link()`
- Lógica:
  - trigger `BEFORE INSERT OR UPDATE OF representative_code` em `representatives`;
  - se o código vier vazio, gera automaticamente no backend;
  - se vier preenchido, normaliza para maiúsculo e valida formato oficial.

## 3. Como a unicidade foi garantida

- Índice único já existente em `representatives.representative_code`.
- Função de geração com loop e checagem de existência antes de retornar.
- Constraint de formato mantém padrão estrito.

## 4. Qual é o formato oficial do código

Formato oficial nesta fase:

- `REP` + 7 caracteres alfanuméricos maiúsculos
- Regex: `^REP[A-Z0-9]{7}$`

## 5. Qual é o link oficial de indicação

Link oficial do representante:

- `/cadastro?representative_code={REPXXXXXXX}`

Esse link é padronizado no backend pela função `ensure_representative_code_and_link`.

## 6. Como o cadastro da empresa passou a consumir esse código

- Arquivo backend: `supabase/functions/register-company/index.ts`
- Regra final:
  1. `representative_code` é prioritário para vínculo com representante.
  2. `referral_code` segue no fluxo de indicação entre empresas.
  3. fallback legado de `referral_code` para representante existe apenas em transição controlada (quando não houve vínculo de referral entre empresas e o código está no formato oficial `REP...`).

- Arquivo frontend: `src/pages/public/CompanyRegistration.tsx`
  - passa a capturar `representative_code` da URL e enviar explicitamente no payload do `register-company`.

## 7. Como foi tratada a relação com referral_code

Não houve ruptura do fluxo atual de indicação entre empresas.

Houve separação semântica com prioridade clara:
- `representative_code` = vínculo com representante
- `referral_code` = indicação entre empresas

O fallback foi mantido apenas como compatibilidade transitória e com restrição explícita.

## 8. Impacto no que já existia

- Não alterou split/checkout financeiro.
- Não removeu o fluxo de referral entre empresas.
- Não quebrou a base da Fase 1 (vínculo, snapshot, ledger de comissão).

## 9. Riscos residuais

- Ainda existe fallback transitório via `referral_code` para representante (embora restrito), que pode ser removido em fase futura após migração total de origem.
- Ainda não existe rota pública dedicada de redirecionamento para representante (ex.: `/r/:code`), caso se queira isolamento completo de links no futuro.

## 10. Próximo passo recomendado

Próxima etapa segura: remover fallback legado de `referral_code` para representante após período de transição e introduzir rota pública dedicada de aquisição de lead do representante, mantendo backend como fonte de verdade.
