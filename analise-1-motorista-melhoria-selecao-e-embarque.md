# Análise 1 — Motorista: melhoria de seleção e embarque

## O que foi alterado

1. **Seleção de viagem no `/motorista`**
   - Troca do seletor simples por **combobox pesquisável** (`Popover + Command`) reaproveitando o padrão já existente no projeto.
   - Busca por texto usando: evento, data, placa e tipo da viagem (ida/volta).
   - Filtro da lista aplicado pela aba/fase ativa:
     - `Ida` → apenas trips `ida`
     - `Reembarque` → apenas trips `volta`
     - `Desembarque` → apenas trips `ida` (mantém contexto operacional da etapa sem misturar com volta)

2. **Correção de duplicidade visual ida/volta**
   - Label da viagem no seletor e no card ativo inclui o tipo da trip (`Ida` / `Volta`) junto com data/evento/placa.

3. **Configuração por empresa de embarque manual sem QR**
   - Nova flag: `companies.allow_manual_boarding`.
   - Default: `true`.
   - Configurável na tela Admin > Empresa > Pagamentos.

4. **Bloqueio backend por origem da validação**
   - RPC `validate_ticket_scan` ganhou parâmetro `p_source` (`scanner` | `manual_list`) em nova assinatura.
   - Regra aplicada no backend:
     - Se `p_source = 'manual_list'` e `allow_manual_boarding = false` ⇒ bloqueia com `reason_code = 'manual_boarding_disabled'`.

5. **Frontend motorista ajustado para regra da empresa**
   - Lista de passageiros (`/motorista/embarque`) consulta a empresa ativa e:
     - desabilita confirmação manual quando `allow_manual_boarding = false`;
     - mostra aviso operacional: **"Este embarque deve ser feito via QR Code"**.
   - Scanner (`/motorista/validar`) continua funcional, enviando `p_source = 'scanner'`.

6. **Auditoria operacional**
   - Nova coluna `ticket_validations.validation_source` com valores: `scanner`, `manual_list`.
   - Origem salva em toda inserção de auditoria via RPC.

## Arquivos impactados

- `src/pages/driver/DriverHome.tsx`
- `src/pages/driver/DriverBoarding.tsx`
- `src/pages/driver/DriverValidate.tsx`
- `src/pages/admin/Company.tsx`
- `src/lib/driverPhaseConfig.ts`
- `src/types/database.ts`
- `src/integrations/supabase/types.ts`
- `supabase/migrations/20260329195000_driver_manual_boarding_control.sql`

## Como funciona o filtro por aba

- A fase ativa (`activePhase`) filtra as trips no seletor:
  - `ida` => `trip_type = ida`
  - `reembarque` => `trip_type = volta`
  - `desembarque` => `trip_type = ida` (mesma base operacional da etapa de saída do trecho de ida)
- Ao mudar fase, se a trip atual não pertencer ao filtro da fase, o sistema troca automaticamente para a primeira trip válida.

## Como funciona a flag da empresa

- Campo persistido em `companies.allow_manual_boarding`.
- Tela de empresa permite alternar:
  - **Sim**: lista manual segue habilitada
  - **Não**: lista manual é bloqueada, operação fica apenas por QR

## Como funciona o bloqueio backend

- RPC resolve `company_id` do ticket e consulta `companies.allow_manual_boarding`.
- Se origem for `manual_list` e a flag estiver desativada, retorno é bloqueado com `manual_boarding_disabled`.
- A validação por scanner não sofre bloqueio desta regra.

## Testes realizados

- `npm run lint` (falhou por erros preexistentes globais no repositório; não relacionados a esta tarefa)
- `npm run test` (1 falha preexistente em `asaasIntegrationStatus.test.ts`; restante passou)

## Dúvidas/decisões pontuais documentadas

- Para **Desembarque**, a regra final ficou alinhada à simplificação operacional: mostrar apenas trips de `ida` para evitar duplicidade visual com `volta`.
