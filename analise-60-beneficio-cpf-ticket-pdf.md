# Análise 60 — Benefício de CPF em ticket virtual e PDFs

## Resumo executivo

- A base de dados e o mapeamento para `TicketCardData` já entregavam os campos necessários por ticket (`benefitApplied`, `benefitProgramName`, `benefitDiscountAmount`).
- O ticket virtual já exibia benefício por passageiro de forma condicional (somente quando `benefitApplied` e com nome/valor quando disponíveis).
- O template de exportação visual (`ticketVisualRenderer`) já exibia benefício no PDF/imagem quando aplicável.
- Correção aplicada nesta tarefa: reforço de consistência visual/técnica entre ticket virtual e PDF, com comentários explícitos de não bloqueio e inclusão do rodapé obrigatório institucional nas saídas de passagem.

## Diagnóstico do comportamento atual (antes do ajuste)

### Componentes e fluxos auditados

- `src/components/public/TicketCard.tsx` (passagem virtual e base visual para captura DOM do PDF)
- `src/lib/ticketPdfGenerator.ts` (geração de PDF por DOM e fallback por render canvas)
- `src/lib/ticketVisualRenderer.ts` (template visual usado no fallback de PDF/imagem)
- `src/pages/public/TicketLookup.tsx` (consulta `/consultar-passagens`)
- `src/pages/public/Confirmation.tsx` (confirmação pública pós-compra)
- `src/pages/admin/Sales.tsx` (visualização de ticket no admin)

### Perguntas obrigatórias respondidas

1. **Hoje a passagem virtual já mostra nome do benefício?**  
   Sim, no `TicketCard` quando `benefitProgramName` existir.
2. **Hoje a passagem virtual já mostra valor do desconto?**  
   Sim, no `TicketCard` quando `benefitDiscountAmount > 0`.
3. **Hoje o PDF da passagem já mostra benefício?**  
   Sim, no fluxo fallback de `ticketVisualRenderer`; e no fluxo por captura de DOM também, pois usa o `TicketCard`.
4. **Existe mais de um template visual de passagem ou fonte única?**  
   Há 2 caminhos de exportação PDF (DOM do `TicketCard` e fallback canvas), mas ambos usam o mesmo conteúdo funcional de passagem.
5. **Os dados necessários já estão disponíveis no ticket carregado?**  
   Sim, os mapeamentos em confirmação, consulta e admin já populam os campos de benefício por ticket.
6. **A ausência atual (se houver) é falta de dado ou renderização?**  
   Não havia ausência crítica de dado; havia oportunidade de padronizar melhor documentação e rodapé institucional entre visual e PDF.
7. **Há risco de quebrar geração de PDF ao incluir esses dados?**  
   Baixo, pois a renderização já era condicional e não bloqueante; reforçada com comentários e manutenção de fallback.
8. **Há risco de exibir benefício indevidamente em não elegíveis?**  
   Mitigado: exibição condicional por ticket (`benefitApplied` + campos do próprio ticket), sem lógica global por compra.

## Correção aplicada

1. **Rodapé obrigatório institucional**
   - Adicionado texto obrigatório em constante compartilhada:
     - `Gerado por Reginatto SI — www.reginattosistemas.com.br — Contato: (31) 99207-4309`
   - Exibido no ticket virtual e no template canvas de PDF, mantendo consistência.

2. **Consistência visual entre ticket virtual e PDF**
   - `TicketCard` (virtual) e `ticketVisualRenderer` (PDF fallback) agora compartilham a mesma base de rodapé institucional e mensagem de responsabilidade.

3. **Comentários técnicos de manutenção**
   - `ticketPdfGenerator` recebeu comentários explícitos sobre:
     - fonte de verdade visual da passagem;
     - benefício por ticket/CPF individual;
     - requisito de não bloqueio na geração.

## Regra “benefício é por CPF, não por compra”

- Confirmada no caminho de visualização: cada ticket recebe seus próprios campos de benefício e renderiza isoladamente.
- Não foi criada lógica agregada por compra no ticket/PDF.
- Tickets sem benefício continuam sem bloco (sem ruído visual).

## Validações realizadas

- Auditoria estática dos fluxos de visualização e exportação de passagem.
- Verificação de renderização condicional por ticket em:
  - consulta de passagens;
  - confirmação pública;
  - visualização via admin;
  - template canvas do PDF.
- Build local para validar integridade de compilação.

## Riscos avaliados

- **Risco de quebra de PDF/render**: baixo (mudanças localizadas e condicionais).
- **Risco de ruído visual em ticket sem benefício**: baixo (condição de exibição mantida).
- **Risco de exibição indevida para toda compra**: baixo (dados e render seguem por ticket individual).

## Ambiguidades registradas

- O projeto possui dois caminhos de geração de PDF (captura DOM e fallback canvas). Ambos foram mantidos por compatibilidade, sem criar novo template paralelo.
