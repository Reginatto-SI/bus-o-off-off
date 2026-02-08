
# Plano: Vitrine de Passagens /eventos (Mobile-First)

## Analise da Situacao Atual

### O que existe hoje
- Tela simples com grid de cards
- Cards mostram: nome, data, cidade, descricao
- **NAO mostra**: preco, empresa organizadora, banner do evento
- Loading basico com spinner
- Empty state generico
- CTA atual: "Ver Evento" (deve ser "Comprar passagem")
- Layout grid 1-2-3 colunas (nao otimizado para mobile)
- Sem carrossel de destaques
- Footer simples sem elementos de confianca

### Dados disponiveis
A tabela `events` ja possui os campos necessarios:
- `name`, `date`, `city`, `status`
- `unit_price` (preco disponivel mas nao exibido)
- `image_url` (banner disponivel mas nao exibido no card)
- `company_id` (vinculo com empresa existe)

A tabela `companies` possui:
- `name` (nome da empresa)
- `logo_url` (logo da empresa)

---

## Arquitetura de Componentes Reutilizaveis

Criar componentes em `src/components/public/` para reuso futuro em outras vitrines:

| Componente | Descricao |
|------------|-----------|
| `EventCard.tsx` | Card padrao de evento (lista vertical) |
| `EventCardFeatured.tsx` | Card de destaque (carrossel) |
| `EventsCarousel.tsx` | Carrossel de eventos em destaque |
| `TrustFooter.tsx` | Rodape com elementos de confianca |
| `EventCardSkeleton.tsx` | Skeleton loading para cards |

---

## Detalhamento Tecnico

### 1. Atualizar Query para Incluir Empresa

```typescript
// Buscar eventos com dados da empresa organizadora
const { data } = await supabase
  .from('events')
  .select(`
    *,
    company:companies!events_company_id_fkey(
      id,
      name,
      logo_url
    )
  `)
  .eq('status', 'a_venda')
  .order('date', { ascending: true });
```

### 2. Criar Componente EventCard (Reutilizavel)

Arquivo: `src/components/public/EventCard.tsx`

Props:
```typescript
interface EventCardProps {
  event: Event & { company?: { id: string; name: string; logo_url: string | null } };
  sellerRef?: string | null;
  isSoldOut?: boolean;
}
```

Estrutura visual:
```text
+---------------------------------------+
| [Banner 3:2 com blur letterbox]       |
|                                       |
+---------------------------------------+
| Nome do Evento                        |
| R$ 60,00                              |
| --------------------------------------|
| [Calendario] Sabado, 20 de fevereiro  |
| [MapPin] Sorriso - MT                 |
| --------------------------------------|
| [Logo] Empresa Organizadora           |
+---------------------------------------+
| [    Comprar passagem    ]            |
+---------------------------------------+
```

Elementos:
- Banner com enquadramento sem corte (blur letterbox ja implementado)
- Nome do evento em destaque (fonte maior, bold)
- Preco visivel logo abaixo do nome
- Data formatada com icone
- Cidade com icone
- Empresa organizadora (logo pequena + nome)
- Badge "Esgotado" quando aplicavel
- CTA "Comprar passagem" (desabilitado se esgotado)
- Card inteiro clicavel no mobile

### 3. Criar Componente EventCardFeatured (Destaque)

Arquivo: `src/components/public/EventCardFeatured.tsx`

Semelhante ao EventCard, porem:
- Banner ocupa mais espaco vertical
- Overlay escuro sobre o banner
- Informacoes sobre o banner (nome, data, cidade, preco)
- CTA visivel sobre o overlay

### 4. Criar Componente EventsCarousel

Arquivo: `src/components/public/EventsCarousel.tsx`

Usar o componente Carousel ja existente (`embla-carousel-react`):

```typescript
interface EventsCarouselProps {
  events: EventWithCompany[];
  sellerRef?: string | null;
}
```

Comportamento:
- Exibido SOMENTE se houver eventos (sem logica de destaque por ora)
- 1 card por vez no mobile
- Swipe horizontal
- Indicadores (bolinhas) de posicao
- Opcional: autoplay com pausa ao toque

### 5. Criar Componente TrustFooter

Arquivo: `src/components/public/TrustFooter.tsx`

Estrutura:
```text
+---------------------------------------+
| [Cadeado] Pagamento 100% online       |
|          e seguro                     |
| [Pix] [Cartao]                        |
+---------------------------------------+
| (c) 2026 Busao Off Off                |
+---------------------------------------+
```

Icones: `Lock`, `CreditCard`, `Smartphone` (para Pix)

### 6. Criar Skeleton de Loading

Arquivo: `src/components/public/EventCardSkeleton.tsx`

Usar o componente Skeleton existente:
- Placeholder para banner
- Placeholder para textos
- Placeholder para botao

### 7. Atualizar PublicLayout

Arquivo: `src/components/layout/PublicLayout.tsx`

Substituir footer simples pelo TrustFooter

### 8. Atualizar PublicEvents

Arquivo: `src/pages/public/PublicEvents.tsx`

Estrutura final:

```typescript
<PublicLayout>
  {/* Titulo e Microcopy */}
  <section>
    <h1>Passagens disponiveis</h1>
    <p>Compra segura com confirmacao imediata apos o pagamento</p>
    <p className="subtle">Eventos organizados por empresas parceiras</p>
  </section>

  {/* Carrossel de Destaques (se houver eventos) */}
  {events.length > 0 && (
    <EventsCarousel events={events.slice(0, 5)} sellerRef={sellerRef} />
  )}

  {/* Lista Todos os Eventos */}
  <section>
    <h2>Todos os eventos</h2>
    {loading ? (
      <SkeletonGrid />
    ) : events.length === 0 ? (
      <EmptyState />
    ) : (
      <EventCardList events={events} sellerRef={sellerRef} />
    )}
  </section>
</PublicLayout>
```

---

## Estilos Mobile-First

### Layout
- Padding horizontal: `px-4` (16px) no mobile
- Cards em coluna unica no mobile
- Espacamento entre cards: `gap-4` (16px)
- Breakpoints: 
  - Mobile: 1 coluna
  - Tablet (sm): 2 colunas
  - Desktop (lg): 3 colunas

### Cards
- Arredondamento: `rounded-xl` (16px)
- Sombra suave: `shadow-sm`
- Hover: `hover:shadow-md` (apenas desktop)
- Card clicavel: `cursor-pointer`

### Botoes
- Altura: `h-12` (48px) para melhor toque
- Texto: "Comprar passagem"
- Cor: Primary (laranja institucional)
- Largura total: `w-full`

### Tipografia
- Titulo H1: `text-2xl font-bold` mobile, `text-3xl` desktop
- Nome do evento: `text-lg font-semibold`
- Preco: `text-xl font-bold text-primary`
- Data/Cidade: `text-sm text-muted-foreground`
- Empresa: `text-xs text-muted-foreground`

---

## Arquivos a Criar/Modificar

| Arquivo | Tipo | Descricao |
|---------|------|-----------|
| `src/components/public/EventCard.tsx` | Novo | Card padrao de evento |
| `src/components/public/EventCardFeatured.tsx` | Novo | Card de destaque |
| `src/components/public/EventsCarousel.tsx` | Novo | Carrossel de destaques |
| `src/components/public/EventCardSkeleton.tsx` | Novo | Skeleton loading |
| `src/components/public/TrustFooter.tsx` | Novo | Rodape de confianca |
| `src/components/public/index.ts` | Novo | Barrel exports |
| `src/components/layout/PublicLayout.tsx` | Editar | Usar TrustFooter |
| `src/pages/public/PublicEvents.tsx` | Editar | Nova estrutura completa |
| `src/types/database.ts` | Editar | Adicionar EventWithCompany type |

---

## Formato de Preco

Usar `Intl.NumberFormat` para formatar precos:

```typescript
const formatPrice = (price: number) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(price);
};

// Exemplo: formatPrice(60) => "R$ 60,00"
```

---

## Estados da Interface

### Loading
- Exibir 3 skeletons (ou 6 em desktop)
- Nunca tela branca

### Sem Eventos
```typescript
<EmptyState
  icon={<Ticket />}
  title="Nenhuma passagem disponivel"
  description="No momento nao ha passagens disponiveis. Volte em breve!"
/>
```

### Evento Esgotado
- Badge "Esgotado" no canto superior do card
- Botao desabilitado com opacity
- Card continua visivel

---

## Indicadores do Carrossel

Usar bolinhas de navegacao abaixo do carrossel:

```typescript
// Indicadores
<div className="flex justify-center gap-2 mt-4">
  {events.slice(0, 5).map((_, index) => (
    <button
      key={index}
      onClick={() => api?.scrollTo(index)}
      className={cn(
        "w-2 h-2 rounded-full transition-colors",
        index === current ? "bg-primary" : "bg-muted"
      )}
    />
  ))}
</div>
```

---

## Criterios de Sucesso

1. Tela parece um marketplace profissional de passagens
2. Mobile-first: layout em coluna unica, botoes grandes
3. Preco visivel em todos os cards
4. Empresa organizadora exibida
5. CTA "Comprar passagem" (nao "Ver evento")
6. Carrossel funcional com swipe
7. Skeleton loading (nunca tela branca)
8. Footer com elementos de confianca
9. Card inteiro clicavel no mobile
10. Componentes reutilizaveis para futuras vitrines
