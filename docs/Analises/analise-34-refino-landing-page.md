# Análise 34 — Refino da landing page

## Objetivo
Refinar visualmente a landing page pública do Smartbus BR com a menor mudança possível e maior ganho perceptível, aumentando a presença da logomarca no header, melhorando o acabamento visual dos blocos comerciais e reforçando a responsividade em desktop e mobile.

## Diagnóstico visual encontrado
- A landing já tinha boa estrutura, boa copy comercial e componentes consistentes.
- O header estava funcional, mas a logomarca ainda tinha presença discreta para o peso institucional desejado.
- Alguns blocos importantes transmitiam sensação de grade de caixas, com pouca diferenciação entre container principal e cards internos.
- Havia repetição de bordas finas em excesso, o que deixava partes da experiência mais próximas de wireframe do que de produto comercial maduro.
- As seções de custo e de indicação comunicavam corretamente, porém com pouca força visual para destacar valor percebido.

## Problemas identificados
1. **Header com logo subdimensionada** para o papel de marca principal.
2. **Seção de custo** com estrutura correta, mas ainda muito próxima de uma lista simples de itens.
3. **Seção “Indique e Ganhe”** com boa mensagem, porém sem um painel central que valorizasse o benefício financeiro.
4. **Cards de apoio e diferenciais** com pouca profundidade visual em comparação à importância comercial da página.
5. **Mobile** funcional, mas com espaço para melhorar a leitura de hierarquia no topo e a percepção de acabamento nos blocos destacados.

## Decisões visuais tomadas
- Aumentei a logomarca no header e adicionei mais respiro lateral para reforçar a marca sem desbalancear os CTAs.
- Apliquei profundidade sutil no header e no menu mobile com sombra discreta e acabamento mais sólido no botão de menu.
- Transformei a seção de custo em um painel com mais hierarquia, usando gradiente muito leve, cards internos mais suaves e uma caixa final de mensagem principal.
- Reforcei a seção “Indique e Ganhe” com um painel de valor no topo da área, passos numerados mais evidentes e hierarquia mais clara entre CTA principal e secundário.
- Refinei cards de pilares e diferenciais com bordas menos secas, gradientes discretos e sombras leves para reduzir a sensação de elementos crus.

## Componentes / arquivos alterados
- `src/pages/public/LandingPage.tsx`
- `analise-34-refino-landing-page.md`

## Cuidados com desktop
- A logo foi ampliada com limite de largura para não competir de forma agressiva com navegação e CTAs.
- O header recebeu apenas profundidade sutil, mantendo a leitura limpa.
- Os blocos comerciais importantes ganharam destaque sem criar novos componentes nem alterar a arquitetura visual principal.
- Os cards continuam seguindo o padrão existente de borda arredondada e tipografia já usada na landing.

## Cuidados com mobile
- O aumento da logo foi controlado com `max-width` e altura responsiva para não quebrar o topo.
- O botão do menu ganhou acabamento mais legível e consistente em telas menores.
- Os painéis de custo e indicação foram refinados sem depender de layouts complexos, preservando bom empilhamento.
- Os passos numerados ficaram mais visíveis e os CTAs mantiveram áreas de toque mais confortáveis.

## O que foi mantido para preservar a identidade do projeto
- Mesma paleta-base do Smartbus BR.
- Mesma linguagem de componentes, botões e cards já presente na landing.
- Mesma arquitetura da página e mesma ordem de seções.
- Mesmo foco comercial em clareza, simplicidade e conversão.
- Sem criação de novos fluxos, páginas ou componentes paralelos.

## Resumo final do impacto esperado
O resultado esperado é uma landing com aparência mais madura, confiável e comercialmente forte, especialmente nos pontos de maior objeção e conversão. O header passa mais presença de marca, a seção de custo comunica valor com mais clareza e a seção “Indique e Ganhe” fica mais convincente como argumento comercial. Em desktop e mobile, a experiência permanece familiar, porém com acabamento visual mais premium e menos sensação de wireframe.
