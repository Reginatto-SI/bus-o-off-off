Diagnóstico completo (comprovado)

- O problema não é só visual: há divergência real entre o layout oficial do veículo e os assentos materializados no banco.
- Evidência principal do veículo AJY-7E61:
  - `layout_snapshot` do veículo: 60 assentos vendáveis (36 convencional, 12 executivo, 12 leito).
  - assentos materializados (`seats`): 11 vendáveis (2 convencional, 9 executivo), nenhum leito.
- Por isso a Etapa 4/5 (“Passagens”) mostra só convencional/executivo e com contagem errada.
- Causa raiz técnica:
  1. a sincronização `layout_snapshot -> seats` insere antes de “limpar/liberar” labels legadas;
  2. existe unicidade por `(vehicle_id, label)`, então há conflito de label em assentos antigos;
  3. erros de insert/update/delete na sincronização não são tratados (fluxo pode “dar sucesso” mesmo com falha parcial).
- Auditoria financeira:
  - checkout online usa `gross_amount` para gerar cobrança no gateway (correto conceitualmente), mas cálculo/preview hoje pode divergir em cenários de preço misto por categoria + taxas por arredondamento e base incorreta na simulação.
  - isso precisa ser unificado para garantir valor final exato.

Plano de correção (implementação)

1. Robustecer sincronização de assentos em `src/pages/admin/Fleet.tsx`

- Reescrever `syncSeatsFromSnapshot` em fases seguras:
  - montar estado desejado a partir do snapshot;
  - identificar assentos “órfãos” (fora do snapshot);
  - deletar órfãos sem vínculo de ticket;
  - para órfãos com ticket, bloquear e renomear para label técnica única (liberando labels comerciais);
  - atualizar assentos que permanecem;
  - inserir assentos faltantes;
  - validar resultado final (contagem/categorias) contra snapshot.
- Tratar erro em todas operações (insert/update/delete): se falhar, lançar erro e não exibir sucesso falso.
- No “Re-sincronizar assentos”, retornar resumo pós-processamento (totais por categoria) e erro explícito se houver divergência.

2. Corrigir origem da contagem por categoria no evento em `src/pages/admin/Events.tsx`

- `fetchCategoryPrices` deve derivar categorias/quantidades do `vehicles.layout_snapshot` dos veículos vinculados ao evento (fonte oficial), não da tabela `seats`.
- Manter fallback para `seats` apenas se snapshot inexistente.
- Mostrar alerta técnico no admin quando snapshot e `seats` estiverem divergentes (com orientação para reprocessar frota).

3. Unificar cálculo financeiro do preço por categoria (checkout/financeiro)

- Criar helper único em `src/lib/feeCalculator.ts` para cálculo por assento (array de assentos selecionados), aplicando:
  - preço da categoria;
  - fallback para preço base;
  - taxas adicionais;
  - taxa da plataforma quando repassada ao cliente.
- Aplicar helper em:
  - `src/pages/public/Checkout.tsx` (preview + `gross_amount` persistido);
  - `src/components/admin/NewSaleModal.tsx` (venda manual/reserva com preço por categoria + taxas, mantendo regra de plataforma conforme canal).
- Garantir que valor mostrado ao usuário = valor salvo em `sales.gross_amount` = valor cobrado no gateway.

4. Correção de dados já afetados (sem quebrar histórico)

- Após patch, executar re-sincronização dos veículos com template (especialmente AJY-7E61).
- Preservar tickets históricos (sem apagar vínculos), apenas isolar assentos legados para não conflitar com labels oficiais.
- Resultado esperado no caso reportado: categorias disponíveis no evento = Convencional, Executivo e Leito, com quantidades corretas do template.

Detalhes técnicos (objetivos de qualidade)

- Integridade: nenhuma sincronização “parcial silenciosa”.
- Observabilidade: mensagens claras de erro/sucesso real.
- Consistência entre telas: Layout Template -> Veículo -> Evento -> Checkout -> Cobrança.
- Compatibilidade: eventos antigos continuam funcionais com preço base/fallback.