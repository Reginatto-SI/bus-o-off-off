# PRD — Ocupação, Reserva e Bloqueio de Poltronas

## 1. Objetivo

Definir a regra oficial de produto para ocupação de poltronas no SmartBus BR, cobrindo reserva, ocupação, bloqueio, liberação e prevenção de dupla venda em todos os fluxos operacionais (público e administrativo).

## 2. Contexto

Este PRD é motivado por incidentes recorrentes em que:
- usuário público conclui compra/pagamento e a poltrona não aparece ocupada;
- admin realiza venda e a poltrona não aparece ocupada;
- empresa sem taxa/plataforma vende e a poltrona não aparece ocupada;
- há risco operacional de dupla venda da mesma poltrona.

## 3. Regra de ouro

**Toda poltrona vendida, paga, reservada ou bloqueada deve aparecer corretamente no mapa de assentos e não pode ser vendida novamente enquanto estiver indisponível.**

## 4. Estados oficiais da poltrona

### 4.1 Disponível

Estado em que a poltrona pode ser selecionada e comprada/reservada.

### 4.2 Reservada

Estado temporário em que a poltrona foi selecionada e está protegida por prazo válido, aguardando confirmação operacional/financeira do fluxo.

### 4.3 Ocupada/Vendida

Estado em que existe venda/passagem válida para o trecho, tornando a poltrona indisponível para nova venda.

### 4.4 Bloqueada

Estado operacional em que a poltrona foi bloqueada por ação administrativa e não pode ser vendida.

### 4.5 Liberada

Estado resultante de expiração de reserva, cancelamento de venda/passagem válida ou remoção de bloqueio.

## 5. Fonte oficial de leitura da ocupação

- O sistema deve manter **fonte única de leitura** de ocupação para público e admin.
- No fluxo atual, a fonte oficial é a RPC `get_trip_seat_occupancy`.
- Checkout público e fluxo administrativo não podem usar fontes divergentes para pintar o mapa.
- **Regra de materialização definitiva:** a ocupação definitiva da poltrona deve ser derivada de ticket/passagem válida vinculada ao trecho correto, empresa correta e assento correto. Status visual da venda, taxa, split ou pagamento isoladamente não são suficientes para ocupar uma poltrona sem a materialização operacional da passagem/ticket, salvo regra técnica explicitamente documentada.

## 6. Fonte oficial de escrita da ocupação

### 6.1 Checkout público

Fluxo oficial:
1. cria reserva temporária;
2. cria venda e dados operacionais da compra;
3. aguarda confirmação de pagamento;
4. após confirmação válida, consolida ticket/passagem;
5. poltrona passa para ocupada/vendida no trecho correto.

### 6.2 Venda manual administrativa

Fluxo oficial:
1. cria venda/passagem administrativa válida;
2. cria ticket imediatamente;
3. poltrona deve ficar ocupada imediatamente após a criação válida do ticket administrativo.

### 6.3 Venda manual com taxa da plataforma

- A taxa da plataforma é fluxo financeiro.
- A poltrona deve aparecer ocupada antes do pagamento da taxa somente quando o ticket/passagem administrativa válida já tiver sido criado.
- A taxa da plataforma não deve ser usada como gatilho principal para pintar ou liberar a poltrona.

### 6.4 Venda manual sem taxa / empresa piloto

- Empresas sem taxa ou piloto não dependem do Asaas, webhook ou verify para ocupação da poltrona.
- A ocupação depende exclusivamente da criação correta da venda/passagem/ticket e dos vínculos consistentes de `company_id`, `trip_id` e assento.

## 7. Relação com Asaas

- Asaas não pinta poltrona diretamente.
- Webhook é confirmação prioritária de pagamento no checkout público.
- Verify é fallback de confirmação.
- Webhook e verify devem convergir para a finalização válida da venda.
- Após finalização válida, tickets/passagens devem existir e a poltrona deve ficar ocupada.
- Falha de split, sócio, representante ou comissão não deve impedir ocupação de passagem validamente confirmada, salvo regra futura explícita aprovada em PRD próprio.

## 8. Eventos de ida, ida e volta e volta opcional

- A ocupação deve ser segmentada por trecho/viagem.
- `trip_id` é obrigatório para diferenciar ida e volta.
- O mesmo número de poltrona pode existir em ida e volta, mas sempre tratado por trecho.
- Volta opcional não deve bloquear poltrona de volta quando a volta não foi comprada.
- Venda de volta deve ocupar poltrona no trecho correto da volta.
- A ocupação da ida nunca deve ocupar automaticamente a volta, e a ocupação da volta nunca deve ocupar automaticamente a ida. Cada trecho deve ter sua própria chave operacional de ocupação.

## 9. Ônibus, van e layout de assentos

- Ônibus e van seguem a mesma regra funcional de ocupação.
- Diferenças visuais/layout não alteram regra de negócio.
- Vínculo entre ticket e assento deve ser estável e consistente.
- Alteração de layout não pode fazer passagem vendida aparecer disponível.
- Quando houver assento físico, deve existir identificação consistente do assento no trecho.
- Quando a venda estiver vinculada a assento físico do layout, o vínculo preferencial deve ser por `seat_id`.
- `seat_label` pode existir como apoio visual/auditoria, mas não deve ser a única chave frágil quando houver assento físico identificado.
- Se houver fallback por `seat_label`, ele deve ser seguro por `company_id + trip_id + seat_label` e não pode permitir dupla venda.

## 10. Regras de prevenção de dupla venda

- Poltrona reservada dentro do prazo não pode ser vendida para outro usuário.
- Poltrona ocupada/vendida não pode voltar a disponível sem evento válido de liberação.
- Poltrona bloqueada não pode ser vendida.
- Validação visual isolada não é suficiente.
- Deve existir proteção de backend/banco/função transacional contra corrida.
- A regra de prevenção de dupla venda deve existir no backend/banco/função transacional; o front-end apenas reflete o estado e não é a barreira principal de segurança.
- Tentativas simultâneas devem ser tratadas com segurança e idempotência.

## 11. Cancelamento, expiração e liberação

- Reserva expirada deve liberar poltrona.
- Venda cancelada deve liberar poltrona quando não houver ticket válido ativo.
- Pagamento cancelado/expirado deve liberar reserva operacional temporária.
- Ticket cancelado deve deixar de contar como ocupação.
- Lock órfão não pode manter poltrona bloqueada indevidamente.

## 12. Multiempresa e permissões

- Toda ocupação deve respeitar `company_id`.
- Público e admin devem visualizar ocupação da mesma empresa/evento/viagem.
- Não pode haver mistura de ocupação entre empresas.
- RLS/permissão não pode gerar divergência de ocupação entre público e admin para o mesmo evento público.

## 13. Critérios de aceite

- Venda pública paga aparece ocupada.
- Venda pública pendente aparece reservada enquanto lock válido.
- Venda manual aparece ocupada imediatamente após criação válida.
- Venda manual com taxa aparece ocupada antes da taxa, se ticket válido existe.
- Venda manual sem taxa aparece ocupada sem dependência do Asaas.
- Ida e volta ocupam trechos corretos.
- Ônibus e van seguem a mesma regra de ocupação.
- Assento bloqueado não pode ser vendido.
- Assento cancelado/liberado volta a ficar disponível conforme regra.
- Tentativa de comprar assento já vendido deve ser bloqueada.
- Público e admin enxergam a mesma ocupação para o mesmo contexto.
- Ticket válido com `company_id`, `trip_id` e assento correto aparece na RPC.
- Ticket cancelado não aparece como ocupação.
- Lock expirado não aparece como reserva ativa.
- Venda paga sem ticket é tratada como inconsistência crítica.
- Venda manual com ticket válido ocupa mesmo que a taxa esteja pendente.
- Público e admin recebem a mesma resposta de ocupação para o mesmo trecho.

## 14. Casos obrigatórios de teste

- [ ] checkout público Pix pago
- [ ] checkout público cartão pago
- [ ] checkout público pagamento pendente
- [ ] checkout público pagamento cancelado
- [ ] venda manual com taxa
- [ ] venda manual sem taxa
- [ ] empresa piloto
- [ ] evento somente ida
- [ ] evento ida e volta
- [ ] evento volta opcional
- [ ] ônibus
- [ ] van
- [ ] assento bloqueado manualmente
- [ ] assento cancelado
- [ ] tentativa simultânea de compra
- [ ] layout alterado após venda
- [ ] ticket sem `seat_id`
- [ ] divergência de `trip_id`
- [ ] divergência de `company_id`

## 15. Pontos de validação operacional pendentes

A correção técnica definitiva depende da execução da validação operacional em:

`/docs/Analises/analise-ocupacao-poltronas-validacao-dados-reais.md`

Pontos a confirmar operacionalmente:
- dados históricos inconsistentes;
- aderência da RPC aos tickets válidos;
- finalização de pagamento incompleta;
- inconsistências de venda manual;
- impacto de layout;
- inconsistências de `seat_id`, `trip_id`, `company_id`;
- locks órfãos/expirados/conflitantes.

## 16. Relação com documentos existentes

Documentos complementares:
- `/docs/Analises/analise-ocupacao-poltronas-fluxo-atual-e-fluxo-correto.md`
- `/docs/Analises/analise-ocupacao-poltronas-validacao-dados-reais.md`
- `/docs/PRD/Asaas/00-asaas-indice-geral.md`
- `/docs/PRD/Asaas/01-asaas-visao-geral.md`
- `/docs/PRD/Asaas/02-asaas-fluxo-checkout-e-venda.md`
- `/docs/PRD/Asaas/03-asaas-webhook-e-confirmacao.md`

## 17. Fora do escopo

Este PRD não define:
- regra de taxa da plataforma;
- regra de split;
- regra comercial de comissão;
- regra fiscal;
- nova arquitetura de pagamento;
- novo modelo financeiro;
- correção SQL específica;
- migration de saneamento histórico.

## 18. Conclusão

**A poltrona deve refletir o estado real da venda/passagem por trecho, empresa e assento. Nenhum fluxo financeiro, visual ou administrativo pode deixar uma passagem válida sem ocupação refletida no mapa.**
