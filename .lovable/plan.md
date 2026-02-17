
# Venda Manual + Reserva + Bloqueio de Poltrona (/admin/vendas)

## Resumo

Adicionar botao "Nova venda" na tela /admin/vendas que abre modal com 3 abas: Venda Manual (status pago), Reserva (status reservado) e Bloquear Poltrona (status reservado com marcacao especial). Cada aba segue um fluxo guiado: selecao de evento/viagem/embarque, mapa de assentos, dados dos passageiros. Tudo grava em `sales` + `tickets` + `sale_logs`.

---

## Arquivos a criar

### 1. `src/components/admin/NewSaleModal.tsx` (novo — componente principal)

Modal Dialog grande (padrao admin-modal) com Tabs: "Venda Manual", "Reserva", "Bloquear Poltrona".

**Fluxo interno (wizard em 3 etapas dentro de cada aba):**

**Etapa 1 — Contexto:**
- Select de Evento (filtrado por `company_id`, status != encerrado)
- Select de Viagem/Veiculo (trips do evento selecionado, mostrando tipo + placa + capacidade + motorista)
- Select de Local/Horario de Embarque (event_boarding_locations do evento + trip selecionados)
- Botao "Proximo" habilitado somente quando os 3 estiverem preenchidos

**Etapa 2 — Mapa de Assentos:**
- Ao selecionar trip, buscar `seats` do veiculo e `tickets` existentes da trip para calcular ocupados
- Reutilizar componente `SeatMap` existente (de `src/components/public/SeatMap.tsx`) dentro do modal
- Permitir selecao multipla (sem limite maximo fixo — usa capacidade disponivel)
- Botao "Proximo" habilitado quando >= 1 assento selecionado

**Etapa 3 — Dados dos passageiros:**
- Para cada assento selecionado, bloco com:
  - Seat label (readonly)
  - Nome do Passageiro (obrigatorio)
  - CPF (obrigatorio, 11 digitos — exceto na aba Bloqueio)
  - Telefone (opcional)
- Campos extras por aba:
  - **Venda Manual:** Select "Forma de recebimento" (Pix/Dinheiro/Cartao/Outro) + campo "Observacao" + campo editavel "Valor unitario" (pre-preenchido com `events.unit_price`, com aviso visual "Preco do evento: R$ X,XX")
  - **Reserva:** campos do responsavel ja cobertos pelos passageiros. Adicionar campo "Observacao"
  - **Bloqueio:** Select "Motivo" (Manutencao/Staff/Cortesia/Seguranca/Outro) + "Observacao". Nome e CPF pre-preenchidos com "BLOQUEIO" e "00000000000"
- Botao "Confirmar" no rodape

**Ao confirmar (logica de gravacao):**

1. Inserir `sales`:
   - `event_id`, `trip_id`, `boarding_location_id` do contexto
   - `customer_name` = nome do primeiro passageiro (ou "BLOQUEIO")
   - `customer_cpf` = cpf do primeiro passageiro (ou "00000000000")
   - `customer_phone` = telefone do primeiro passageiro
   - `quantity` = numero de assentos selecionados
   - `unit_price` = valor unitario (do evento ou ajustado)
   - `status` = "pago" (venda manual) ou "reservado" (reserva/bloqueio)
   - `gross_amount` = quantity * unit_price
   - `company_id` = activeCompanyId
   - Campos Stripe = null

2. Inserir `tickets` (um por assento):
   - `sale_id`, `trip_id`, `seat_id`, `seat_label`
   - `passenger_name`, `passenger_cpf`, `passenger_phone`
   - `boarding_status` = "pendente"
   - `company_id`
   - `qr_code_token` gerado automaticamente pelo default do banco

3. Inserir `sale_logs`:
   - Venda Manual: action="manual_paid_created", description com forma de recebimento + obs
   - Reserva: action="reservation_created", description com obs
   - Bloqueio: action="seat_block_created", description com motivo + obs

4. Toast de sucesso + fechar modal + refresh da lista

---

## Arquivos a modificar

### 2. `src/pages/admin/Sales.tsx`

- Importar e renderizar `NewSaleModal`
- Adicionar state `newSaleModalOpen`
- Adicionar botao primario "[+] Nova venda" no PageHeader actions (antes do Excel)
- Passar `onSuccess={() => { setNewSaleModalOpen(false); fetchSales(); }}` ao modal
- Na tabela, identificar vendas de bloqueio: se `customer_name === 'BLOQUEIO'`, exibir badge "Bloqueio" ao lado do nome na coluna Cliente

### 3. Acoes rapidas no menu "..." (ja parcialmente implementado)

Verificar que "Marcar como Pago" e "Cancelar Venda" ja existem no `getSaleActions`. Ajustar:
- "Marcar como Pago" ja existe (restrito a `isGerente` e `status === 'reservado'`). Adicionar log `sale_logs` com action="marked_as_paid" (atualmente usa "status_alterado" generico — refinar a descricao).
- "Cancelar Venda" ja funciona com modal + motivo + liberacao de tickets.
- Nenhuma nova acao necessaria.

---

## Detalhes tecnicos

**Queries no modal:**
- Eventos: `events` filtrado por `company_id`, `status != 'encerrado'`, `is_archived = false`
- Trips: `trips` filtrado por `event_id`, com join em `vehicles` e `drivers`
- Embarques: `event_boarding_locations` filtrado por `event_id` e `trip_id`, com join em `boarding_locations`
- Assentos: `seats` filtrado por `vehicle_id` (do trip selecionado)
- Tickets ocupados: `tickets` filtrado por `trip_id` (para marcar assentos como ocupados)

**Validacoes:**
- Nao permitir confirmar se algum assento selecionado ficou ocupado entre a selecao e a gravacao (revalidar antes do insert)
- CPF obrigatorio com 11 digitos (exceto bloqueio)
- Nome obrigatorio para cada passageiro (exceto bloqueio onde e automatico)

**Permissoes:**
- Botao "Nova venda" visivel apenas para admin (`isGerente || isOperador`)
- RLS ja cobre: `Users can create sales of their company` exige `user_belongs_to_company`

**Multiempresa:**
- Todas as queries filtradas por `activeCompanyId`
- `company_id` setado em sales e tickets

---

## Arquivos

| Arquivo | Tipo |
|---------|------|
| `src/components/admin/NewSaleModal.tsx` | Novo |
| `src/pages/admin/Sales.tsx` | Modificado |

## Sem alteracoes de banco

Usa tabelas existentes: `sales`, `tickets`, `seats`, `sale_logs`, `events`, `trips`, `event_boarding_locations`, `boarding_locations`, `sellers`.
