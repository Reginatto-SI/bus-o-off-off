# Análise 6 — Validação final pós-correção da ocupação de poltronas

## Escopo
Validação final no evento `d8af7267-3560-495d-8b31-1590eeca36f3` para confirmar se a correção por trecho (`trip_id`) está ativa no ambiente.

## Evidências executadas (ambiente real)
Foram executadas chamadas reais para a RPC ativa no banco:

- `get_trip_seat_occupancy('bee273ac-04cb-452b-b071-93453151630e')` → **24** assentos
- `get_trip_seat_occupancy('8d0b7934-656e-4117-bf72-07c211f05778')` → **24** assentos
- `get_trip_seat_occupancy('295a4c2a-e1e9-4aa1-b7b4-6e1bc50dd08f')` → **0** assentos

Contexto conhecido das análises anteriores:
- as vendas visíveis de `sales` deste evento estavam concentradas no trecho de ida;
- ida e volta com mesmo veículo continuaram retornando ocupação idêntica na RPC ativa.

## Resultado das validações obrigatórias
1. **Migration `20260520120000_fix_seat_occupancy_by_trip_segment.sql` aplicada?**
   - **Não foi possível confirmar como aplicada no ambiente remoto via papel anon**.
   - Pela evidência comportamental da RPC (ida e volta com mesmo veículo retornando 24/24), há forte indício de que o ambiente ainda está com regra agregada por veículo/evento.

2. **Função ativa é versão por `trip_id`?**
   - **Não aparenta estar ativa** no ambiente validado.
   - Se estivesse por `trip_id`, era esperado não herdar automaticamente a mesma ocupação da ida para a volta sem ocupação explícita de volta.

3. **Ida retorna apenas assentos da ida?**
   - Retornou 24; isoladamente, sim, mas sem comprovação de segregação por trecho.

4. **Volta retorna apenas assentos da volta?**
   - Para a volta compartilhada, retornou 24 (igual à ida), indicando possível herança indevida.
   - Para a volta com veículo diferente, retornou 0.

5. **Venda somente ida bloqueia indevidamente volta?**
   - **Há risco real de sim** no estado atual observado.

6. **Venda somente volta bloqueia indevidamente ida?**
   - Mesmo risco simétrico quando houver cenário inverso em veículo compartilhado.

7. **Venda ida e volta bloqueia os dois trechos?**
   - Bloqueia, porém o comportamento atual pode bloquear ambos mesmo sem vínculo explícito da volta.

8. **Checkout público mostra ocupado corretamente?**
   - Checkout usa RPC única; portanto mostra o que a RPC ativa retornar.
   - Se a RPC estiver agregada por veículo/evento, o checkout repetirá esse comportamento.

9. **Venda manual mostra ocupado corretamente?**
   - Admin também usa RPC única; mesmo diagnóstico do checkout.

10. **Sistema impede duplicidade para mesmo `trip_id + seat_id`?**
   - No código/migration local, sim.
   - No ambiente validado, sem confirmação de aplicação da migration, essa garantia não pode ser declarada como já ativa.

## Conclusão objetiva
- **A correção não pode ser considerada finalizada no ambiente atual** com base nesta validação.
- O comportamento observado da RPC ativa (24 na ida e 24 na volta com mesmo veículo) indica que a versão por trecho (`trip_id`) provavelmente **não está aplicada** no banco em uso.
- **Risco residual:** bloqueio indevido entre ida e volta em viagens com veículo compartilhado; além disso, sem ativação confirmada dos triggers atualizados, há incerteza sobre a proteção final por `trip_id + seat_id`.
- **Ação necessária para fechamento:** aplicar/confirmar a migration `20260520120000_fix_seat_occupancy_by_trip_segment.sql` no ambiente e repetir os mesmos testes de RPC por trip.
