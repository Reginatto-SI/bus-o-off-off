# Análise 27 — ajustes landing page FAQ e redes sociais

## Objetivo da alteração

Aplicar uma implementação mínima na landing page pública do Smartbus BR para complementar os links de redes sociais já existentes e adicionar uma seção de perguntas frequentes, mantendo o padrão visual atual da página.

## Escopo executado

- Atualização do link do Facebook na estrutura social já existente.
- Inclusão dos canais YouTube e X (Twitter) na mesma estrutura visual dos demais ícones sociais.
- Preservação do Instagram já existente.
- Criação de uma seção `Perguntas frequentes` em formato accordion.
- Posicionamento da FAQ mais para o final da landing page, antes do footer.

## Links sociais ajustados/adicionados

- Facebook: `https://www.facebook.com/smartbusbroficial`
- Instagram: preservado na configuração existente
- YouTube: `https://www.youtube.com/@SmartBusbr`
- X (Twitter): `https://x.com/smartbusbr2026`

## Posição escolhida para a FAQ

A FAQ foi posicionada após o bloco final de CTA comercial e antes do footer. Essa posição respeita a diretriz de conversão da landing: o usuário entende primeiro a proposta de valor e, perto da decisão, encontra respostas rápidas para objeções comuns.

## Justificativa breve da solução

A solução reutiliza o padrão já existente da landing page e componentes disponíveis no projeto. O bloco de FAQ foi implementado com `Accordion` já presente na base, mantendo apenas uma pergunta aberta por vez para preservar escaneabilidade, clareza e leveza visual.

## Lista de arquivos alterados

- `src/pages/public/LandingPage.tsx`
- `analise-27-ajustes-landing-page-faq-redes-sociais.md`

## Confirmação de abordagem mínima

Confirmo que a implementação foi mínima, localizada e alinhada ao padrão visual existente. Nenhuma outra rota foi alterada e não houve refatoração ampla da landing page.
