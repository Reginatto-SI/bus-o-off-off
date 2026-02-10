

# Plano: Fluxo Completo de Compra com Selecao de Assentos

## Problemas Identificados

### 1. Bug dos veiculos duplicados
O banco de dados mostra que o MESMO veiculo (Van AJY-7E62) aparece em 2 trips: uma de IDA e outra de VOLTA. A pagina publica lista TODAS as trips como cards de veiculo separados, causando a duplicacao visual. A solucao e filtrar para mostrar apenas trips do tipo `ida` na selecao publica, ja que o passageiro compra "ida e volta" como um pacote.

### 2. Etapa de assentos inexistente
O sistema pula direto para o checkout apos escolher veiculo/embarque/quantidade. Falta a tela de mapa visual de assentos.

### 3. Dados por passageiro
Hoje o checkout coleta um unico nome/CPF para todo o pedido. O correto e coletar dados individuais por assento selecionado.

### 4. Sem suporte a pisos
A tabela `vehicles` nao tem campo para indicar se o veiculo tem 1 ou 2 pisos.

---

## Alteracoes no Banco de Dados

### Migration 1: Adicionar campo `floors` na tabela vehicles

```sql
ALTER TABLE public.vehicles
  ADD COLUMN floors integer NOT NULL DEFAULT 1;

COMMENT ON COLUMN public.vehicles.floors IS 'Numero de pisos do veiculo (1 ou 2)';
```

### Migration 2: Criar tabela `seats` (configuracao de assentos do veiculo)

```sql
CREATE TABLE public.seats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  label text NOT NULL,            -- Ex: "1", "2", "14A"
  floor integer NOT NULL DEFAULT 1,
  row_number integer NOT NULL,    -- Posicao na fileira (de frente pra tras)
  column_number integer NOT NULL, -- Posicao na coluna (esquerda pra direita)
  status text NOT NULL DEFAULT 'disponivel', -- disponivel, bloqueado
  company_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(vehicle_id, label)
);

ALTER TABLE public.seats ENABLE ROW LEVEL SECURITY;

-- Admins podem gerenciar
CREATE POLICY "Admins can manage seats"
  ON public.seats FOR ALL
  USING (is_admin(auth.uid()) AND user_belongs_to_company(auth.uid(), company_id))
  WITH CHECK (is_admin(auth.uid()) AND user_belongs_to_company(auth.uid(), company_id));

-- Publico pode ver assentos de veiculos em eventos a venda
CREATE POLICY "Public can view seats for public events"
  ON public.seats FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM trips t
    JOIN events e ON e.id = t.event_id
    WHERE t.vehicle_id = seats.vehicle_id
    AND e.status = 'a_venda'
  ));
```

### Migration 3: Criar tabela `tickets` (passagens individuais por assento)

```sql
CREATE TABLE public.tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  trip_id uuid NOT NULL,
  seat_id uuid REFERENCES public.seats(id),
  seat_label text NOT NULL,
  passenger_name text NOT NULL,
  passenger_cpf text NOT NULL,
  passenger_phone text,
  boarding_status text NOT NULL DEFAULT 'pendente',
  company_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(trip_id, seat_id)  -- Um assento so pode ser vendido uma vez por viagem
);

ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;

-- Admins podem gerenciar
CREATE POLICY "Admins can manage tickets"
  ON public.tickets FOR ALL
  USING (is_admin(auth.uid()) AND user_belongs_to_company(auth.uid(), company_id))
  WITH CHECK (is_admin(auth.uid()) AND user_belongs_to_company(auth.uid(), company_id));

-- Publico pode inserir tickets (ao finalizar compra)
CREATE POLICY "Public can create tickets"
  ON public.tickets FOR INSERT
  WITH CHECK (true);

-- Publico pode ver seus tickets por CPF
CREATE POLICY "Public can view own tickets"
  ON public.tickets FOR SELECT
  USING (true);
```

### Migration 4: Atualizar funcao de capacidade disponivel

Atualizar `get_trip_available_capacity` para contar tickets individuais em vez de somar quantity de sales:

```sql
CREATE OR REPLACE FUNCTION public.get_trip_available_capacity(trip_uuid uuid)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT t.capacity - COALESCE(
    (SELECT COUNT(*)::integer FROM public.tickets tk WHERE tk.trip_id = trip_uuid),
    0
  )
  FROM public.trips t
  WHERE t.id = trip_uuid
$$;
```

---

## Arquivos a Criar

### 1. `src/components/public/SeatMap.tsx`
Componente principal do mapa de assentos.

Responsabilidades:
- Receber a lista de assentos do veiculo (da tabela `seats`)
- Receber a lista de assentos ja vendidos (da tabela `tickets` filtrada pelo trip_id)
- Renderizar o mapa visual "vista de cima do onibus"
- Layout de grid: motorista no topo, fileiras de 2+corredor+2 (onibus) ou 2+corredor+1 (van/micro)
- Gerenciar selecao/desselecao
- Limitar selecao ao maximo de `quantity`
- Exibir legenda (Disponivel, Selecionado, Ocupado, Bloqueado)
- Exibir contador "Selecionados: 2 de 3"

Props:
```typescript
interface SeatMapProps {
  seats: Seat[];           // Todos os assentos do veiculo
  occupiedSeatIds: string[]; // IDs dos assentos ja vendidos
  maxSelection: number;     // Quantidade de passagens escolhida
  selectedSeats: string[];  // IDs dos assentos selecionados
  onSelectionChange: (seatIds: string[]) => void;
  floors: number;           // 1 ou 2 pisos
}
```

Layout visual (onibus padrao):
```text
+---------------------------+
|     [Motorista]           |
+---------------------------+
|  [1]  [2]    [3]  [4]    |
|  [5]  [6]    [7]  [8]    |
|  [9]  [10]   [11] [12]   |
|  ...                      |
|  [41] [42]   [43] [44] [45]|
+---------------------------+
```

Para 2 pisos: tabs "Piso 1" / "Piso 2" no topo.

### 2. `src/components/public/SeatButton.tsx`
Componente individual de assento.

Estados visuais:
- Disponivel: fundo claro, borda cinza
- Selecionado: fundo primary, texto branco
- Ocupado: fundo cinza escuro, cursor not-allowed
- Bloqueado: fundo cinza com icone X

### 3. `src/components/public/SeatLegend.tsx`
Legenda simples com as 4 cores/estados.

### 4. `src/pages/public/SeatSelection.tsx`
Nova pagina/step para selecao de assentos.

Rota: pode reutilizar `/eventos/:id/checkout` com um step interno (state-based), ou criar rota separada. Recomendacao: manter na mesma rota `/eventos/:id/checkout` com stepper interno (step 1 = assentos, step 2 = dados passageiros).

Fluxo:
1. Recebe trip_id, quantity, location via searchParams
2. Busca assentos do veiculo e tickets ja vendidos para o trip
3. Renderiza SeatMap
4. Ao completar selecao, avanca para formulario de passageiros

---

## Arquivos a Modificar

### 1. `src/pages/public/PublicEventDetail.tsx`
- Filtrar trips para mostrar apenas `trip_type === 'ida'`
- Isso elimina o bug de duplicacao de veiculos

Trecho a mudar:
```typescript
// Antes:
const tripsData = (tripsRes.data ?? []) as Trip[];

// Depois:
const tripsData = ((tripsRes.data ?? []) as Trip[]).filter(t => t.trip_type === 'ida');
```

### 2. `src/pages/public/Checkout.tsx`
Refatorar completamente para ter 2 steps internos:

**Step 1 — Selecao de Assentos**
- Renderizar EventSummaryCard (resumo compacto)
- Renderizar SeatMap
- CTA: "Continuar para dados dos passageiros"

**Step 2 — Dados dos Passageiros**
- Para CADA assento selecionado, exibir um bloco:
  - Titulo: "Passageiro — Assento 14"
  - Nome completo (obrigatorio)
  - CPF (obrigatorio, com mascara, validacao de digitos)
  - Telefone (opcional)
- Validacao: CPFs unicos dentro da mesma compra
- CTA: "Finalizar compra"
- Ao finalizar:
  1. Criar registro em `sales`
  2. Criar registros individuais em `tickets` (1 por assento)
  3. Redirecionar para `/confirmacao/:saleId`

### 3. `src/types/database.ts`
Adicionar interfaces:

```typescript
export interface Seat {
  id: string;
  vehicle_id: string;
  label: string;
  floor: number;
  row_number: number;
  column_number: number;
  status: 'disponivel' | 'bloqueado';
  company_id: string;
  created_at: string;
}

export interface TicketRecord {
  id: string;
  sale_id: string;
  trip_id: string;
  seat_id: string | null;
  seat_label: string;
  passenger_name: string;
  passenger_cpf: string;
  passenger_phone: string | null;
  boarding_status: string;
  company_id: string;
  created_at: string;
  updated_at: string;
}
```

### 4. `src/components/public/VehicleCard.tsx`
Sem alteracoes necessarias.

### 5. `src/components/public/index.ts`
Adicionar exports dos novos componentes (SeatMap, SeatButton, SeatLegend).

### 6. `src/pages/public/Confirmation.tsx`
Atualizar para mostrar assentos na confirmacao:
- Listar cada ticket com assento e nome do passageiro
- Corrigir o `.slice()` em `departure_time` (mesmo bug do checkout, linha 115)

---

## Fluxo Completo Resultante

```text
/eventos/
  → Lista de eventos publicos

/eventos/:id
  → Resumo do evento
  → Escolha do veiculo (apenas trips de IDA, sem duplicatas)
  → Escolha do embarque
  → Quantidade de passagens
  → CTA: "Escolher assentos"

/eventos/:id/checkout?trip=X&location=Y&quantity=N
  → Step 1: Mapa de assentos (selecionar N assentos)
    → CTA: "Continuar para dados dos passageiros"
  → Step 2: Formulario por passageiro (1 bloco por assento)
    → CTA: "Finalizar compra"

/confirmacao/:saleId
  → Confirmacao com lista de passageiros e assentos
```

---

## Sobre os assentos sem cadastro previo

Como nao existe ainda uma tela admin para configurar assentos por veiculo, o sistema precisa de uma estrategia para funcionar imediatamente:

**Abordagem: Auto-gerar assentos na primeira vez**

Ao acessar o mapa de assentos de um veiculo que ainda nao tem assentos cadastrados na tabela `seats`, o sistema gera automaticamente os assentos com base na `capacity` do veiculo:

- Para onibus (capacity > 20): layout 2+2 (4 colunas)
- Para van/micro (capacity <= 20): layout 2+1 (3 colunas)
- Ultima fileira pode ter 1 assento extra (5 no onibus, 4 na van)
- Labels: "1", "2", "3"... sequenciais

Isso e feito via uma funcao auxiliar que verifica e gera se necessario.

---

## Detalhamento do Mapa de Assentos (Visual)

### Onibus padrao (1 piso, ~45 lugares)

```text
+-----------------------------------+
|  [Motorista]                      |
+-----------------------------------+
|                                   |
|   01  02      03  04              |
|   05  06      07  08              |
|   09  10      11  12              |
|   13  14      15  16              |
|   17  18      19  20              |
|   21  22      23  24              |
|   25  26      27  28              |
|   29  30      31  32              |
|   33  34      35  36              |
|   37  38      39  40              |
|   41  42   43  44  45             |
|                                   |
+-----------------------------------+
```

### Van (15 lugares)

```text
+-------------------------+
|  [Motorista]            |
+-------------------------+
|                         |
|   01  02      03        |
|   04  05      06        |
|   07  08      09        |
|   10  11      12        |
|   13  14   15           |
|                         |
+-------------------------+
```

### 2 pisos
Tabs no topo: `[Piso 1] [Piso 2]`
Cada piso renderiza seu proprio grid.

---

## Politica de RLS para vendas publicas

A tabela `sales` atual so permite INSERT para usuarios autenticados da mesma empresa. Para o fluxo publico funcionar, precisamos de uma policy que permita INSERT publico:

```sql
CREATE POLICY "Public can create sales"
  ON public.sales FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM events e
      WHERE e.id = sales.event_id
      AND e.status = 'a_venda'
      AND e.allow_online_sale = true
    )
  );

CREATE POLICY "Public can view own sales"
  ON public.sales FOR SELECT
  USING (true);
```

---

## Resumo de Arquivos

| Arquivo | Acao | Descricao |
|---------|------|-----------|
| Migration SQL | Criar | floors, seats, tickets, RLS, funcao atualizada |
| `src/types/database.ts` | Editar | Adicionar Seat, TicketRecord, floors em Vehicle |
| `src/components/public/SeatMap.tsx` | Criar | Mapa visual de assentos |
| `src/components/public/SeatButton.tsx` | Criar | Botao individual de assento |
| `src/components/public/SeatLegend.tsx` | Criar | Legenda dos estados |
| `src/components/public/index.ts` | Editar | Novos exports |
| `src/pages/public/PublicEventDetail.tsx` | Editar | Filtrar trips ida, corrigir duplicatas |
| `src/pages/public/Checkout.tsx` | Reescrever | 2 steps: assentos + dados passageiros |
| `src/pages/public/Confirmation.tsx` | Editar | Mostrar assentos, corrigir departure_time |

---

## Validacoes de Seguranca

1. CPF com validacao de digitos verificadores (algoritmo)
2. CPFs unicos por compra (nao repetir na mesma sale)
3. Telefone com mascara
4. Revalidar disponibilidade dos assentos no momento do INSERT (constraint UNIQUE em tickets.trip_id + seat_id impede dupla venda)
5. Nao permitir finalizar sem todos os dados preenchidos
6. Limite de quantidade respeitado pela capacidade real

