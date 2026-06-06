# Análise 117 — PDF da Lista de Embarque: paginação e sobreposição

## 1. Resumo do problema

A geração do PDF operacional da Lista de Embarque em `/admin/relatorios/lista-embarque` apresentava sobreposição visual entre:

- bloco de ponto de embarque e linhas de passageiros do ponto anterior;
- cabeçalho da tabela e bloco de ponto de embarque;
- bloco final de `Resumo do Embarque` e linhas da tabela.

O problema é exclusivamente de layout/paginação do PDF. Não há evidência de necessidade de alterar dados, filtros, RPC, regras de negócio, status de venda ou estrutura da tela.

## 2. Arquivos investigados

- `src/pages/admin/BoardingManifestReport.tsx`: página da rota administrativa, fluxo de filtros, preview e chamada de geração do PDF.
- `src/lib/reports/generateBoardingManifest.ts`: função que consulta a RPC, agrupa passageiros por ponto de embarque e desenha o PDF com `jsPDF` e `jspdf-autotable`.
- `src/lib/pdfUtils.ts`: utilitários de marca/empresa/logotipo usados pelo cabeçalho do PDF.
- `supabase/migrations/20260312173000_fix_boarding_manifest_rpc_signature_and_grants.sql`: referência da RPC usada pela tela, sem necessidade de alteração para este bug.

## 3. Causa raiz encontrada

A causa raiz estava no controle de coordenadas verticais do PDF em `src/lib/reports/generateBoardingManifest.ts`.

Foram encontrados três pontos críticos:

1. O início de um novo ponto de embarque era validado com uma regra genérica (`currentY > contentBottomY - 70`), sem calcular explicitamente o espaço necessário para o bloco do ponto, o cabeçalho da tabela e ao menos uma linha de passageiro.
2. Em páginas de continuação de uma tabela, o título do ponto era redesenhado no `didDrawPage`, enquanto a margem superior da tabela continuava em `margin`. Na prática, o cabeçalho da tabela e/ou as primeiras linhas podiam ocupar a mesma faixa vertical do título do ponto.
3. O resumo final dependia do `currentY` atualizado após a tabela, mas precisava de uma validação explícita de altura completa antes de ser desenhado para garantir que nunca invadisse o conteúdo tabular.

## 4. Explicação da lógica antiga

A lógica antiga seguia este fluxo:

1. desenhava o cabeçalho institucional na primeira página;
2. para cada ponto de embarque, desenhava o título do ponto em `currentY`;
3. iniciava o `autoTable` em `currentY + 9`;
4. tentava redesenhar o título em páginas de continuação dentro do `didDrawPage`;
5. atualizava `currentY` com `lastAutoTable.finalY + 8`;
6. desenhava o resumo final após uma verificação simples de altura.

O problema é que a página de continuação da tabela não reservava espaço vertical real para o título do ponto. Como o `didDrawPage` ocorre depois do ciclo de desenho da página, o título podia ser pintado por cima da tabela já desenhada. Além disso, a validação antes de um novo ponto era indireta e não garantia o conjunto mínimo `ponto + cabeçalho + primeira linha`.

## 5. Explicação da correção aplicada

A correção foi mínima e localizada em `src/lib/reports/generateBoardingManifest.ts`:

- foram adicionadas constantes explícitas para altura/margem de segurança do ponto, cabeçalho e primeira linha;
- foi criada uma função auxiliar `ensureSpaceForBlock(requiredHeight)` para adicionar nova página antes de desenhar blocos que não cabem no espaço útil;
- antes de iniciar cada ponto de embarque, o PDF agora reserva espaço para:
  - bloco do ponto;
  - cabeçalho da tabela;
  - pelo menos uma linha de passageiro;
- o `autoTable` agora usa uma margem superior maior nas páginas de continuação, reservando a faixa onde o título do ponto será redesenhado;
- a repetição do título do ponto em páginas de continuação foi movida para `willDrawPage`, evitando desenhar o título por cima de conteúdo já renderizado;
- o resumo final agora usa a mesma função de validação de espaço antes de ser desenhado.

A solução preserva a biblioteca atual (`jsPDF` + `jspdf-autotable`), os dados reais carregados pela tela, a RPC existente, os agrupamentos por ponto e o layout compacto.

## 6. Pontos de risco

- A validação visual completa depende de dados reais/homologação com muitos passageiros, pois a geração usa RPC e contexto autenticado da empresa.
- Nomes de passageiros ou pontos extremamente longos continuam dependendo da quebra de linha do `autoTable`; não foi alterada regra de truncamento ou redução agressiva de fonte.
- O cabeçalho institucional segue sendo desenhado apenas na primeira página, mantendo o comportamento anterior. As páginas de continuação continuam priorizando o título do ponto e o cabeçalho da tabela.

## 7. Evidências dos cenários testados

Validações realizadas nesta alteração:

- inspeção do fluxo da rota `/admin/relatorios/lista-embarque` até a chamada de `generateBoardingManifest`;
- inspeção da renderização dos blocos de ponto de embarque, tabela de passageiros e resumo final;
- validação estática da lógica de paginação com `npm run build`;
- validação de lint com `npm run lint`, observando que há erros preexistentes em arquivos fora do escopo desta correção.

Não foi possível gerar manualmente um PDF com a empresa 7 FEST neste ambiente porque a reprodução depende de sessão autenticada, dados reais da empresa e seleção de evento/viagem em ambiente de homologação/produção.

## 8. Checklist de validação manual

Para homologação visual em navegador/PDF viewer:

- [ ] Gerar uma Lista de Embarque com passageiros suficientes para ocupar mais de uma página.
- [ ] Confirmar que a tabela quebra página sem cortar linhas.
- [ ] Gerar uma Lista de Embarque com pelo menos dois pontos de embarque.
- [ ] Confirmar que o segundo ponto começa abaixo da última linha do ponto anterior ou em nova página.
- [ ] Confirmar que o cabeçalho `E | D | R | Poltrona | Passageiro | CPF | Telefone` não invade o bloco do ponto.
- [ ] Gerar uma Lista de Embarque em que o resumo fique próximo ao fim da página.
- [ ] Confirmar que o resumo fica abaixo da tabela quando couber.
- [ ] Confirmar que o resumo vai para uma nova página quando não couber.
- [ ] Validar o cenário da empresa 7 FEST sem hardcode e sem alteração cadastral.
- [ ] Abrir o PDF em 100% e confirmar que não há linhas cortadas ou blocos sobrepostos.

## 9. Pendências

- Realizar validação visual final em ambiente com dados reais/homologação, especialmente com a empresa 7 FEST citada como referência de reprodução.
- Caso algum ponto de embarque tenha nome muito extenso, avaliar posteriormente ajuste de quebra de linha do título do ponto, sem alterar esta correção de paginação.
