# Step 2 — Validação da reserva manual

## 1) Prazo de 72 horas

**Veredito:** a política de 72h está implementada e operacional, mas **não está centralizada em um único ponto**.

### Evidências
- A criação de venda/reserva manual no admin define `MANUAL_RESERVATION_TTL_HOURS = 72` e grava `reservation_expires_at` na própria venda no momento do insert. Isso garante que a reserva manual já nasce com validade explícita no banco.  
- A tela administrativa de vendas também redefine `MANUAL_RESERVATION_TTL_HOURS = 72` ao recolocar uma venda em `reservado`, renovando `reservation_expires_at`.  
- A migration de suporte introduz `reservation_expires_at` como validade explícita para reservas manuais e faz backfill usando `created_at + interval '72 hours'` para linhas antigas de origem administrativa.

### Conclusão técnica
- **Seguro no comportamento atual:** sim. O prazo de 72h está sendo aplicado tanto na criação quanto na reabertura manual de uma reserva.  
- **Risco residual:** existe duplicação da regra em pelo menos dois pontos do código de aplicação. Se alguém alterar um valor e esquecer o outro, o sistema pode divergir entre “criação” e “reabertura”.  
- **Leitura recomendada:** tratar a política como **válida, porém não totalmente blindada** por falta de centralização.

## 2) Remoção de `tickets` no cleanup

**Veredito:** remover `tickets` no cleanup de reserva manual expirada é **coerente com a modelagem atual** e, no fluxo vigente, é a ação correta para liberar o assento.

### Evidências
- O fluxo de criação manual (`NewSaleModal`) cria a venda em `reservado` e em seguida já insere `tickets` para os passageiros/assentos selecionados. Ou seja: nesses casos, os `tickets` são usados como ocupação operacional imediata da poltrona, mesmo antes do status `pago`.  
- A Edge Function `cleanup-expired-locks` cancela vendas `reservado` vencidas por `reservation_expires_at`, grava log operacional e depois remove `tickets`, `seat_locks` e `sale_passengers` ligados à venda cancelada.  
- O pipeline compartilhado de finalização de pagamento mostra outro fluxo importante: quando a venda usa `sale_passengers`, os `tickets` oficiais são gerados na confirmação do pagamento, e então `sale_passengers` é apagado. Isso indica que `tickets` e `sale_passengers` representam estágios operacionais diferentes dependendo da origem da venda.

### Conclusão técnica
- **Seguro no desenho atual:** sim. Para reserva manual administrativa, o assento fica efetivamente ocupado por `tickets`; então, ao cancelar por expiração, apagar esses `tickets` é o que devolve a poltrona ao mapa.  
- **Por que isso não conflita com o fluxo pago online:** porque a geração oficial de `tickets` após confirmação de pagamento usa `sale_passengers` como fonte; já a reserva manual atual nasce diretamente com `tickets`.  
- **Risco residual:** baixo, mas condicionado à premissa atual de produto. Se no futuro uma reserva manual passar a gerar artefatos adicionais dependentes de `tickets`, o cleanup terá de continuar acompanhando essa evolução.

## 3) Confiabilidade de `sale_origin = 'admin_manual'`

**Veredito:** `sale_origin` é um metadado **útil e atualmente confiável para o fluxo manual novo**, mas **não deve ser tratado como classificador universal e absoluto** de toda venda `reservado` do sistema.

### Evidências
- A migration adiciona `sale_origin` em `sales` com `NOT NULL` e default `'online_checkout'`, além de documentar explicitamente valores como `online_checkout`, `admin_manual`, `admin_reservation_conversion` e `admin_block`.  
- O fluxo manual atual (`NewSaleModal`) seta `sale_origin` como `admin_manual` para venda/reserva manual e `admin_block` para bloqueio.  
- O backfill de `reservation_expires_at` em migration antiga usa `sale_origin IN ('admin_manual')`, mostrando que esse campo foi assumido como marcador confiável para reservas administrativas pré-existentes naquele contexto.  
- **Mas** o cleanup atual das reservas manuais vencidas **não depende** de `sale_origin`; ele cancela qualquer `sale` com `status = reservado` e `reservation_expires_at` vencido. Essa escolha reduz o risco de erro caso existam linhas cujo `sale_origin` histórico seja imperfeito ou mais amplo do que a categoria “manual”.

### Conclusão técnica
- **Confiável para o fluxo novo:** sim, porque o admin grava explicitamente `admin_manual` na criação manual.  
- **Confiável como verdade absoluta histórica/universal:** não dá para afirmar apenas pelo código. O próprio desenho do banco admite múltiplas origens, e o cleanup foi implementado de forma mais robusta ao usar `reservation_expires_at` como fonte de verdade operacional.  
- **Leitura recomendada:** usar `sale_origin` como **metadata de rastreabilidade**, não como único guard-rail para expiração/cancelamento.

## Parecer final

A implementação recente da política de `reservado` está **tecnicamente sólida** nos três pontos avaliados:
- o TTL de 72h funciona;
- apagar `tickets` no cleanup está alinhado ao fluxo manual atual;
- `sale_origin` ajuda na rastreabilidade, mas a segurança real ficou corretamente ancorada em `reservation_expires_at`.

A única ressalva material desta validação é arquitetural: o valor de 72h está duplicado no frontend/admin, então a política está correta **hoje**, porém ainda não está tão resistente quanto poderia estar a mudanças futuras.
