# Step 01 — Landing institucional Smartbus BR (2026-03-28 15:05 UTC)

## Resumo executivo
- Foi identificado que a landing principal já possuía uma sequência extensa de blocos comerciais, mas sem um bloco dedicado e explícito de contexto institucional sobre a Smartbus BR.
- A implementação priorizou mudança mínima e segura: inclusão de um bloco “Sobre a Smartbus BR” dentro da própria landing, além de criação de página institucional enxuta para aprofundamento.
- Também foi adicionado link visível no header (desktop e mobile) e no footer para acesso direto ao conteúdo institucional.

## Arquivos analisados
- `src/pages/public/LandingPage.tsx`
- `src/pages/public/PublicRootRedirect.tsx`
- `src/App.tsx`
- `src/components/layout/PublicLayout.tsx`

## Diagnóstico do ponto alterado
- A landing pública principal é renderizada na rota raiz (`/`) por `PublicRootRedirect`.
- O header usado na landing é próprio do `LandingPage.tsx`, portanto o link institucional precisava ser inserido ali (não no `PublicLayout`).
- Existia rota institucional pública para política de intermediação, mas não existia uma rota dedicada de “Sobre”.

## Decisão de posicionamento do bloco
- O bloco institucional foi inserido **após os primeiros blocos de apresentação/benefícios** e **antes dos blocos mais comerciais de continuidade**, em posição estratégica para elevar confiança sem quebrar fluxo de conversão.
- Foi adotado layout em duas colunas para desktop com leitura escaneável e CTA secundário, mantendo padrão visual já usado na landing.

## O que foi implementado
- Inserido bloco “Sobre a Smartbus BR” na landing com:
  - título e subtítulo institucional;
  - texto objetivo sobre proposta e contexto operacional;
  - lista de capacidades práticas;
  - CTA secundário “Conhecer a Smartbus BR”.
- Adicionado link “Sobre a Smartbus BR” no header desktop e mobile da landing.
- Criada página institucional enxuta em `/sobre-smartbus-br` com:
  - hero curto;
  - bloco de problema;
  - bloco de proposta;
  - bloco de confiança operacional;
  - CTA final para ação principal.
- Incluído também link institucional no footer da landing.

## Componentes reutilizados
- `Button` (`@/components/ui/button`)
- Ícones `lucide-react` já usados no projeto
- Estrutura de seções com classes utilitárias já padrão na landing
- `Link` do `react-router-dom`

## Rotas alteradas ou criadas
- **Criada** rota pública: `/sobre-smartbus-br`
- **Mantidas** rotas existentes sem refatoração estrutural

## Checklist final
- [x] Existe bloco “Sobre a Smartbus BR” em posição estratégica na landing
- [x] O bloco melhora confiança sem usar prova social falsa
- [x] Existe link no header/menu para a área institucional
- [x] O texto está em português do Brasil
- [x] O visual segue o padrão da landing
- [x] Não houve refatoração desnecessária
- [x] Não foram criadas promessas exageradas
- [x] O CTA institucional não compete de forma confusa com o CTA principal
- [x] O código recebeu comentários explicando as mudanças
- [x] Foi criado o Markdown de análise/implementação no repositório
