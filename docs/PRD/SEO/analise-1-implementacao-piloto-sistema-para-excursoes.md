# Análise 1 — Implementação piloto `/sistema-para-excursoes`

## Arquivos alterados

- `src/pages/public/SystemForExcursionsPage.tsx`
- `src/App.tsx`

## Componentes e padrões reutilizados

- `PublicLayout` para manter header/footer, CTA global e consistência de navegação pública.
- `Button` e variações (`default` e `outline`) para padrão de CTA da landing.
- `Accordion` (FAQ) no mesmo padrão visual já utilizado na landing.
- Classes utilitárias Tailwind já usadas no projeto (`rounded-3xl`, `border`, `bg-muted/30`, `shadow-sm`, blocos em gradiente etc.).

## Decisões visuais tomadas

- Hero com fundo escuro em gradiente e card lateral de valor percebido para manter estética premium/comercial da landing.
- Blocos com cards bem destacados para problema, solução, benefícios, comparação e cobrança.
- Ritmo de espaçamento e hierarquia tipográfica alinhados ao padrão de seções da landing principal.
- CTAs distribuídos ao longo da página para manter conversão sem criar fluxo paralelo.

## Como a landing principal foi usada como referência

- Estrutura por seções escaneáveis (hero → valor → benefício → FAQ → CTA final).
- Linguagem visual de cards com bordas suaves, sombras leves e realce primário.
- CTA final em bloco escuro com contraste alto e dois botões.
- FAQ com `Accordion` seguindo padrão já consolidado na página principal.

## O que foi mantido do PRD

- Headline principal e subtítulo conforme PRD.
- Blocos obrigatórios: problema, solução, benefícios, como funciona, cobrança, comparação implícita.
- CTA principal: **Começar agora**.
- CTA secundário: **Ver como funciona**.
- FAQ com perguntas sobre CNPJ, mensalidade e abrangência de uso.
- Bloco obrigatório de navegação entre páginas com:
  - Sistema para caravanas
  - Sistema para eventos
  - Sistema para viagens
- Bloco final de reforço com CTA.

## Dúvidas / limitações encontradas

- As rotas sugeridas no bloco de navegação (`/sistema-para-caravanas`, `/sistema-para-eventos`, `/sistema-para-viagens`) ainda não existem no projeto atual. Foram mantidas como links planejados para preservar a arquitetura de cluster definida no PRD.
