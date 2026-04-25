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


## Ajuste incremental — preservação da trip ao trocar de aba

### Causa da troca automática indesejada
- A seleção era forçada em dois pontos:
  1. `handlePhaseChange`, que trocava para a primeira trip compatível quando a atual não batia com a nova fase;
  2. `useEffect` reativo em `phaseFilteredTrips`, que também aplicava fallback automático quando detectava incompatibilidade.
- Com isso, mesmo após escolha manual, a navegação de abas podia "reiniciar" para a primeira opção.

### Lógica ajustada
- Mantido o filtro por fase (`Ida`/`Desembarque` => `ida`, `Reembarque` => `volta`).
- Adicionado estado local de preferência por fase (`preferredTripByPhase`) para guardar a última escolha manual do motorista em cada aba.
- Ao trocar de aba:
  1. tenta manter a trip atual se ela for compatível;
  2. se não for compatível, tenta recuperar a preferência já escolhida para a fase de destino;
  3. só então usa a primeira opção da fase como fallback mínimo.
- O `useEffect` deixou de trocar seleção por incompatibilidade; ele só define fallback quando não existe nenhuma trip selecionada.

### Resultado de UX
- A escolha manual passa a ter prioridade real.
- Menos trocas silenciosas de trip ao alternar abas.
- Persistência em storage continua ativa para fase/trip selecionadas.

### Cenários com fallback automático (ainda existentes, de forma controlada)
- Não há trip selecionada no estado atual e existem trips válidas na fase.
- A fase mudou e:
  - a trip atual não é compatível,
  - não existe preferência válida salva para a fase de destino.


## Reorganização de UI — /admin/empresa

### Por que a configuração saiu de `Pagamentos`
- `allow_manual_boarding` e política de reservas são regras operacionais da empresa e não regras financeiras.
- A aba `Pagamentos` passa a ficar focada em temas financeiros (taxas, split, gateway), reduzindo mistura conceitual.

### Nova aba criada
- Foi criada a aba **`Configurações`** em `/admin/empresa`.

### Parametrizações que ficaram na nova aba
- **Política de Reservas**
  - Permitir reservas manuais
  - Horas (TTL)
  - Minutos (TTL)
- **Política de Embarque**
  - Permitir embarque manual sem QR Code

### Estrutura preparada para crescimento
- A nova aba usa cards separados por domínio operacional, permitindo adicionar futuras parametrizações sem poluir a aba de pagamentos.
- Nenhuma lógica funcional foi alterada (somente reorganização de interface/admin).
