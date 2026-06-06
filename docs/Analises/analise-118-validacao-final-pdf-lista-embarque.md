# Análise 118 — Validação final do PDF da Lista de Embarque

## 1. Resumo da revisão

Foi feita revisão técnica final da correção de paginação do PDF da Lista de Embarque da rota `/admin/relatorios/lista-embarque`, com foco exclusivo em layout e prevenção de sobreposição. A revisão confirmou que a correção anterior cobria a causa principal, mas identificou dois riscos residuais pequenos que justificaram ajuste mínimo:

1. a reserva inicial de espaço para um novo ponto considerava uma linha mínima fixa, mas a primeira linha real pode crescer quando nome/telefone quebram linha;
2. após uma tabela quebrar em múltiplas páginas, era mais seguro posicionar explicitamente o `jsPDF` na última página física antes de desenhar o próximo bloco.

Nenhuma regra de negócio, RPC, filtro, dado de passageiro, venda, evento ou embarque foi alterado.

## 2. Arquivos revisados

- `src/lib/reports/generateBoardingManifest.ts`: geração do PDF com `jsPDF` e `jspdf-autotable`, agrupamento por ponto, cálculo de `currentY`, quebras de página, cabeçalho da tabela e resumo final.
- `docs/Analises/analise-117-pdf-lista-embarque-sobreposicao.md`: análise anterior usada como base do diagnóstico.
- `src/pages/admin/BoardingManifestReport.tsx`: conferência do fluxo da tela e confirmação de que a página apenas chama a geração do PDF com dados já carregados.

## 3. Validação dos pontos técnicos

### 3.1 `ensureSpaceForBlock`

A função está tecnicamente correta para o uso atual:

- compara `currentY + requiredHeight` com `contentBottomY`;
- `contentBottomY` já desconta a área segura do rodapé;
- quando não há espaço, cria nova página e redefine `currentY = margin`;
- protege tanto o início dos pontos de embarque quanto o bloco final de resumo.

A revisão manteve a função sem refatoração ampla.

### 3.2 Início de novo ponto de embarque

A regra anterior reservava espaço para:

- bloco do ponto;
- cabeçalho da tabela;
- uma linha mínima de passageiro;
- margem adicional.

O risco residual encontrado foi a primeira linha real ser maior que a altura mínima quando dados quebram linha. Foi aplicado ajuste mínimo: a altura da primeira linha agora é estimada com `doc.splitTextToSize` usando as larguras reais das colunas críticas (`Poltrona`, `Passageiro`, `CPF`, `Telefone`). Assim, o ponto só inicia na página atual se houver espaço para o bloco, o cabeçalho e a primeira linha estimada.

### 3.3 Páginas de continuação do `autoTable`

O uso de `willDrawPage` com `hookData.pageNumber > 1` foi mantido porque o número da página é relativo à tabela atual. Isso evita redesenhar o título do ponto sobre a primeira página do grupo e garante que ele apareça nas páginas de continuação.

A margem superior `continuationTableTopY = margin + groupTitleToTableOffset` continua reservando espaço para:

- título do ponto em `y = margin`;
- subtítulo de horário/passageiros em `y = margin + 5`;
- respiro vertical antes do cabeçalho da tabela;
- cabeçalho da tabela iniciado abaixo da área do título.

Não foi identificado risco real de o título invadir o cabeçalho com os valores atuais.

### 3.4 `lastAutoTable.finalY`

O uso de `lastAutoTable.finalY` é correto para recuperar a posição vertical real ao final da tabela. Como robustez adicional, foi aplicado ajuste mínimo com `doc.setPage(doc.getNumberOfPages())` logo após o `autoTable`, antes de atualizar `currentY`. Isso garante que o próximo ponto ou o resumo sejam desenhados na última página física gerada pela tabela.

### 3.5 Resumo do Embarque

`summaryBlockHeight = 70` é suficiente para o bloco real desenhado:

- título em `currentY`;
- caixa até `currentY + 68` (`roundedRect` começa em `currentY + 2` e tem altura `66`);
- última linha interna em `currentY + 61`;
- área segura inferior já respeitada por `contentBottomY`.

A validação por `ensureSpaceForBlock(summaryBlockHeight)` impede que o resumo seja desenhado sobre linhas de passageiros. Se não couber, o resumo inicia em nova página.

### 3.6 Rodapé

`footerSafeArea = 12` e rodapé em `pageHeight - 6` mantêm 6 mm de separação mínima entre o limite de conteúdo e o texto de rodapé. O `autoTable` usa `margin.bottom = footerSafeArea`, portanto não deve invadir o rodapé. O resumo usa a mesma área útil por meio de `ensureSpaceForBlock`.

## 4. Riscos residuais encontrados

- Nomes de ponto de embarque extremamente longos ainda podem ultrapassar horizontalmente a linha visual do título, pois esta revisão não alterou o desenho do título para múltiplas linhas. Esse risco é diferente da sobreposição vertical reportada e deve ser tratado separadamente se for observado em produção.
- A validação visual completa depende de sessão autenticada e dados reais/homologação. Neste ambiente não foi possível reproduzir a empresa 7 FEST com os filtros reais.

## 5. Ajustes aplicados

Foram feitos apenas ajustes mínimos em `src/lib/reports/generateBoardingManifest.ts`:

1. criação de estimativa local da altura da primeira linha real do grupo com `doc.splitTextToSize`;
2. uso dessa estimativa na reserva de espaço antes de desenhar um novo ponto de embarque;
3. posicionamento explícito do `jsPDF` na última página física depois do `autoTable`.

Esses ajustes reduzem risco de cabeçalho isolado no fim da página e reforçam o encadeamento correto entre tabela, próximo ponto e resumo.

## 6. Justificativa para não refatorar além disso

A arquitetura atual (`jsPDF` + `jspdf-autotable`) já resolve a quebra interna da tabela. A falha observada era de coordenação vertical entre blocos externos à tabela. Portanto, a solução adequada é manter a geração existente e reforçar apenas os cálculos de altura/margem nos pontos críticos.

## 7. Checklist final para validação manual no navegador

- [ ] Gerar PDF com mais de 40 passageiros no mesmo ponto.
- [ ] Confirmar que o título do ponto não cobre linhas da tabela em páginas de continuação.
- [ ] Gerar PDF com dois ou mais pontos de embarque.
- [ ] Confirmar que um ponto nunca inicia sobre a última linha do ponto anterior.
- [ ] Gerar PDF com nomes longos de passageiros.
- [ ] Confirmar que a primeira linha do novo ponto não fica sozinha/cortada no rodapé.
- [ ] Gerar PDF com o resumo próximo ao fim da página.
- [ ] Confirmar que o resumo fica abaixo da tabela quando couber.
- [ ] Confirmar que o resumo vai para nova página quando não couber.
- [ ] Validar o cenário da empresa 7 FEST em homologação, sem hardcode e sem alteração cadastral.
- [ ] Abrir o PDF em visualizador a 100% e conferir legibilidade para impressão.

## 8. Conclusão

Opção B — Ajuste mínimo aplicado.

A correção anterior estava consistente para a causa principal, mas a revisão encontrou risco residual real em cenários com primeira linha alta por quebra de texto e reforçou o posicionamento pós-`autoTable`. O PDF permanece com os mesmos dados, filtros e regras de negócio, com alteração restrita à segurança de paginação/layout.
