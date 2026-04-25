# Análise 71 — Remoção temporária da seção SmartGain na landing

## Onde a seção estava sendo renderizada
A seção de indicação estava sendo renderizada diretamente na landing pública em `src/pages/public/LandingPage.tsx`, no bloco `<section className="bg-muted/40 py-16 sm:py-20">`, contendo o título **"Indique o Smartbus e Ganhe"**, os passos de indicação e os CTAs **"Começar agora"** e **"Criar conta grátis"**.

## Abordagem aplicada
Foi utilizada a abordagem de **condição falsa explícita** para ocultar apenas a renderização no frontend:

```tsx
{false && (
  <section>...</section>
)}
```

Também foi adicionado comentário explicativo obrigatório acima da renderização, indicando que a seção foi desativada temporariamente por estratégia de produto e que o código não deve ser removido.

## Confirmação de preservação de código
Nenhum componente, markup, texto ou lógica da seção foi removido do projeto.
A seção permanece integralmente no arquivo e pode ser reativada apenas restaurando a condição de renderização.

## Evidências de não impacto em outras partes da landing
- A alteração foi isolada ao bloco da seção SmartGain dentro de `LandingPage.tsx`.
- Nenhuma rota, estilo global, componente compartilhado ou lógica de outras seções foi alterada.
- Build validada com sucesso após a mudança, sem erro de compilação.
