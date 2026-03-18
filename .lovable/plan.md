

# Plano: Landing Page pública Smartbus BR

## Resumo

Criar uma landing page isolada em `/` (substituindo o redirect atual para `/eventos`), com identidade visual própria, layout moderno tipo startup, sem reutilizar componentes existentes do sistema. A página `/eventos` continua funcionando normalmente.

---

## 1. Nova rota e página

- Criar `src/pages/public/LandingPage.tsx` como página standalone
- Alterar `App.tsx`: trocar `<Navigate to="/eventos" />` por `<LandingPage />`
- Não usar `PublicLayout` — a landing terá seu próprio header/footer inline

---

## 2. Estrutura da Landing (seções)

### Header próprio (fixo, transparente → sólido ao scroll)
- Logo Smartbus BR à esquerda
- Links: "Viagens" (`/eventos`), "Minhas Passagens" (`/consultar-passagens`)
- CTAs: "Área Administrativa" (outline), "Quero vender passagens" (primary)

### Hero (split-screen)
- Lado esquerdo: título grande, subtítulo, barra de busca estilizada (cidade/evento + data), botão "Buscar viagens"
- Lado direito: composição visual com gradiente/formas geométricas abstratas (CSS puro, sem imagem externa)
- CTA secundário discreto: "Quero vender minhas passagens"
- Fundo com gradiente diagonal usando cores da marca (laranja → azul escuro)

### Eventos em destaque
- Título da seção com badge "Ao vivo"
- Cards diferenciados dos existentes — layout horizontal com imagem, info e preço
- Dados mockados inicialmente (preparado para query futura)
- Scroll horizontal no mobile, grid 3 colunas desktop

### Como funciona (3 passos)
- Layout horizontal com ícones grandes e numeração estilizada
- 1. Escolha sua viagem → 2. Reserve sua passagem → 3. Embarque com segurança
- Fundo claro com separadores visuais

### Bloco para empresas (fundo escuro contrastante)
- Split: texto à esquerda, feature-list com ícones à direita
- "Venda suas passagens com mais controle e mais lucro"
- Features: controle de passageiros, gestão de embarque, vendas online, pagamento integrado
- CTA "Começar a vender" → `/cadastro`

### Diferenciais (grid 2x2)
- Cards com ícone, título e descrição curta
- Gestão completa, controle de embarque, relatórios, pagamento seguro
- Background sutil com padrão geométrico CSS

### CTA final (full-width, gradiente)
- Dois botões lado a lado: "Ver viagens disponíveis" → `/eventos`, "Cadastrar minha empresa" → `/cadastro`

### Footer próprio
- Mais completo que o TrustFooter atual: logo, links, redes sociais, CNPJ
- Reutiliza apenas dados (CNPJ), não o componente

---

## 3. Estilo visual

- Gradientes com cores da marca: laranja (`hsl(25 95% 53%)`) e azul escuro (`hsl(222 47% 11%)`)
- Formas geométricas CSS (circles, blobs) como elementos decorativos
- Tipografia grande no hero (text-5xl/6xl)
- Animações sutis com Tailwind: `animate-fade-in`, transições de hover
- Seções alternando fundo claro/escuro para ritmo visual
- Tudo responsivo mobile-first

---

## 4. Atualizar slug reservado

- Adicionar nenhum slug novo necessário (a rota `/` já é a root)