
# Correcao: Regenerar assentos incompativeis com tipo do veiculo

## Problema

Os assentos persistidos no banco para o veiculo atual foram gerados com 3 colunas (layout de van). Mesmo apos corrigir a funcao `generateSeatLayout`, o checkout encontra assentos existentes na linha 167 e os reutiliza sem verificar se o layout e compativel com o tipo atual do veiculo.

## Solucao

Adicionar validacao no carregamento do checkout (entre linhas 167-196 de `Checkout.tsx`) que compara o `max(column_number)` dos assentos existentes com o esperado pelo tipo do veiculo. Se incompativel E nao houver tickets vinculados, apaga os assentos antigos e regenera.

## Alteracao unica

### Arquivo: `src/pages/public/Checkout.tsx`

Na secao de carregamento de assentos (linhas 167-196), substituir o bloco por:

```typescript
if (existingSeats && existingSeats.length > 0) {
  // Validate layout compatibility
  const vehicle = (tripRes.data as Trip).vehicle!;
  const expectedCols = vehicle.type === 'van' ? 3 : 4;
  const maxCol = Math.max(...existingSeats.map((s: any) => s.column_number));

  if (maxCol !== expectedCols) {
    // Check if any tickets exist for this trip before regenerating
    const { count: ticketCount } = await supabase
      .from('tickets')
      .select('id', { count: 'exact', head: true })
      .eq('trip_id', tripId!);

    if (!ticketCount || ticketCount === 0) {
      // Safe to delete and regenerate
      await supabase.from('seats').delete().eq('vehicle_id', vehicleId);

      setGeneratingSeats(true);
      const layout = generateSeatLayout(
        vehicle.capacity,
        vehicle.type,
        vehicle.floors ?? 1,
      );
      const seatInserts = layout.map((s) => ({
        vehicle_id: vehicleId,
        label: s.label,
        floor: s.floor,
        row_number: s.row_number,
        column_number: s.column_number,
        status: s.status,
        company_id: (tripRes.data as Trip).company_id,
      }));
      const { data: created } = await supabase
        .from('seats')
        .insert(seatInserts)
        .select();
      if (created) setSeats(created as Seat[]);
      setGeneratingSeats(false);
    } else {
      // Tickets exist — use existing seats even if mismatched
      setSeats(existingSeats as Seat[]);
    }
  } else {
    setSeats(existingSeats as Seat[]);
  }
} else {
  // Auto-generate (existing logic unchanged)
  ...
}
```

## Logica resumida

1. Busca assentos existentes
2. Calcula `expectedCols` com base no tipo do veiculo (van=3, demais=4)
3. Compara com `max(column_number)` dos assentos existentes
4. Se incompativel:
   - Verifica se existem tickets para essa viagem
   - Se nao ha tickets: apaga assentos antigos e regenera com layout correto
   - Se ha tickets: mantem assentos existentes (seguranca)
5. Se compativel: usa normalmente

## Resultado esperado

- Onibus/micro-onibus com assentos antigos de 3 colunas serao automaticamente regenerados como 4 colunas (2+2)
- Nenhum dado de ticket e perdido
- Correcao transparente para o usuario
