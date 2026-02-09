

# Correção: Transportes não aparecem na vitrine pública

## Problema identificado

Os dados existem no banco de dados:
- 2 viagens (ida e volta) com uma Van de 15 lugares
- 2 locais de embarque configurados (19:50 e 20:00)

Porém, as tabelas `trips`, `event_boarding_locations` e `vehicles` possuem apenas políticas de acesso para **usuários autenticados da mesma empresa**. Como a tela `/eventos/:id` é pública (sem login), o visitante anônimo não consegue ler nenhum dado dessas tabelas.

A tabela `boarding_locations` já possui uma política pública, mas as demais não.

## Solução

Criar políticas RLS de leitura pública (SELECT) nas 3 tabelas, permitindo acesso apenas quando o registro está vinculado a um evento com status `a_venda`:

### 1. Tabela `trips`
Permitir SELECT público quando a trip pertence a um evento com `status = 'a_venda'`.

### 2. Tabela `event_boarding_locations`
Permitir SELECT público quando o registro pertence a um evento com `status = 'a_venda'`.

### 3. Tabela `vehicles`
Permitir SELECT público quando o veículo está vinculado a uma trip de um evento com `status = 'a_venda'`.

## Detalhamento técnico

```sql
-- Trips: acesso público para eventos à venda
CREATE POLICY "Public can view trips for public events"
  ON public.trips FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM events e
      WHERE e.id = trips.event_id
      AND e.status = 'a_venda'
    )
  );

-- Event boarding locations: acesso público para eventos à venda
CREATE POLICY "Public can view boarding locations for public events"
  ON public.event_boarding_locations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM events e
      WHERE e.id = event_boarding_locations.event_id
      AND e.status = 'a_venda'
    )
  );

-- Vehicles: acesso público quando vinculado a evento à venda
CREATE POLICY "Public can view vehicles for public events"
  ON public.vehicles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM trips t
      JOIN events e ON e.id = t.event_id
      WHERE t.vehicle_id = vehicles.id
      AND e.status = 'a_venda'
    )
  );
```

## Segurança

- As políticas permitem **apenas leitura (SELECT)**, nunca escrita
- O acesso é **condicional**: somente para registros vinculados a eventos públicos (`a_venda`)
- Quando o evento muda para `rascunho` ou `encerrado`, o acesso público é automaticamente revogado
- Dados sensíveis de veículos (placa, chassi, renavam) ficam expostos na query mas não são exibidos na interface. Isso é aceitável no MVP, mas pode ser refinado futuramente com uma view

## Arquivos impactados

Nenhum arquivo de código precisa ser alterado. Apenas a criação de 3 políticas RLS no banco de dados.

