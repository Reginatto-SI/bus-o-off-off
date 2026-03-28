# Auditoria e correção de responsividade — vitrine pública (`/empresa/:nick`)

## 1. Resumo executivo

Foi identificado um problema de responsividade no card de destaque do carrossel da vitrine pública: em telas desktop, o banner principal passava a ocupar uma altura desproporcional e deixava um bloco vazio perceptível abaixo da imagem. Esse comportamento degradava a leitura da página e causava a percepção de “layout quebrado”, sem alterar regras de negócio.

**Impacto:**
- Hero de destaque com proporção inconsistente no desktop.
- Espaçamento vertical excessivo no primeiro bloco de eventos.
- Percepção de card “esticado” e desalinhamento visual com o restante da vitrine.

## 2. Causa raiz

A causa raiz estava no componente `EventCardFeatured`:
- uso de `AspectRatio ratio={1}` (base quadrada) combinado com classe responsiva `sm:aspect-[16/9]` no mesmo elemento;
- mistura de estratégias de proporção (prop do Radix + utilitário Tailwind) sem isolamento explícito por breakpoint;
- resultado: o desktop herdava comportamento de altura indevida, gerando área vazia no card em determinados cenários.

## 3. Correções aplicadas

Alterações **mínimas e cirúrgicas**, somente na camada de layout:

1. Removido o uso de `AspectRatio` no card em destaque.
2. Aplicado controle explícito por breakpoint com utilitários:
   - mobile: `aspect-[4/5]`
   - desktop (`sm+`): `aspect-[16/9]`
3. Adicionado wrapper absoluto (`absolute inset-0`) para garantir preenchimento total da área proporcional e evitar “bloco vazio”.
4. Mantida estrutura, conteúdo, CTAs e comportamento funcional existentes (sem mudança de lógica).

## 4. Antes vs Depois (descrição)

### Antes
- Card de destaque podia crescer verticalmente além do esperado no desktop.
- Área em branco ficava visível abaixo da imagem.
- Sensação de hero/carrossel “esticado”.

### Depois
- Card de destaque respeita proporção consistente por breakpoint.
- Desktop volta a exibir banner em formato panorâmico controlado.
- Mobile mantém leitura confortável sem impactar desktop.

## 5. Riscos

- **Baixo risco**: alteração localizada em 1 componente visual.
- Sem mudança de API, dados, fluxo de compra, filtros ou regras de negócio.
- Sem impacto em RLS/multi-tenant.
