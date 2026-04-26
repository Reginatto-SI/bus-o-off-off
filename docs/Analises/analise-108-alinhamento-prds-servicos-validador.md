# Análise 108 — Alinhamento de PRDs de Serviços e Validador (QR Code por venda)

## 1) PRDs lidos
- `docs/PRD/Modulo Serviços/PRD — Módulo de Passeios & Serviços (SmartBus BR).md` (local original antes da movimentação).
- `docs/PRD/Telas/PRD — Tela Validador.md`.

## 2) Divergência encontrada
Foi identificada divergência entre os PRDs na regra de QR Code para serviços:
- no PRD do módulo de serviços, havia orientação de QR por item validável;
- no PRD do Validador, havia orientação de reuso de QR de venda/passagem quando possível.

Essa combinação gerava ambiguidade sobre:
- separação entre QR de passagem e QR de serviços;
- existência (ou não) de QR individual por serviço no MVP;
- comportamento esperado do Validador ao escanear vendas com múltiplos serviços.

## 3) Decisão oficial aplicada
Foi aplicada a regra oficial de produto:
- passagem possui QR próprio para validação de embarque;
- serviços possuem QR próprio por venda/comprovante de serviços;
- QR de serviços é único por venda e pode agrupar múltiplos serviços;
- ao escanear o QR de serviços, o Validador abre a venda e lista os serviços consumíveis;
- cada serviço mantém saldo individual (comprado, utilizado, restante);
- consumo permanece unitário por ação;
- não há QR individual por item/serviço no MVP;
- itens `tipo_controle = sem_validacao` não precisam aparecer como consumíveis no Validador.

## 4) Arquivos movidos
- Movido:
  - de `docs/PRD/Modulo Serviços/PRD — Módulo de Passeios & Serviços (SmartBus BR).md`
  - para `docs/PRD/Telas/PRD — Módulo de Passeios & Serviços (SmartBus BR).md`
- Pasta removida por ficar vazia:
  - `docs/PRD/Modulo Serviços`

## 5) Arquivos alterados
- `docs/PRD/Telas/PRD — Módulo de Passeios & Serviços (SmartBus BR).md`
  - alinhamento da seção de geração de QR;
  - alinhamento da seção de validação/consumo no Validador;
  - ajuste de regra para serviços sem validação.
- `docs/PRD/Telas/PRD — Tela Validador.md`
  - substituição da regra ambígua de QR por regra oficial;
  - reforço de separação entre QR de passagem e QR de serviços;
  - inclusão de comportamento esperado para listagem e consumo por serviço;
  - atualização de item de fora de escopo e decisões pendentes.

## 6) Confirmação de escopo (sem implementação)
Confirmação: nenhuma implementação de código foi realizada.

Não houve alteração de:
- rotas;
- schema;
- componentes;
- arquitetura.

As mudanças foram exclusivamente documentais em arquivos de PRD/análise.

## 7) Checklist final de validação
- [x] O PRD do módulo de serviços foi movido para `docs/PRD/Telas`.
- [x] A pasta `docs/PRD/Modulo Serviços` foi removida por ficar vazia.
- [x] O PRD do módulo de serviços não fala mais em QR individual por item como regra do MVP.
- [x] O PRD do Validador não orienta mais reutilizar QR da passagem para serviços.
- [x] A regra oficial está clara: passagem tem QR próprio e serviços têm QR próprio.
- [x] O QR de serviços é único por venda/comprovante de serviços.
- [x] O QR de serviços pode agrupar múltiplos serviços.
- [x] O Validador lista os serviços vinculados ao QR de serviços.
- [x] Cada serviço possui saldo individual de consumo.
- [x] O consumo continua unitário por ação.
- [x] Nenhum código foi alterado.
- [x] Foi criado arquivo de análise em `docs/Analises`.
