

# Plano: Enquadramento de Imagem Sem Corte

## Problema Atual

O sistema usa `object-cover` que **corta automaticamente** partes da imagem para preencher o frame 3:2, alterando o conteúdo visual da arte enviada pelo usuário.

## Nova Regra

A imagem original deve ser **preservada integralmente**, redimensionada proporcionalmente e centralizada no frame 3:2, com preenchimento de espaço vazio usando fundo neutro ou blur da própria imagem.

---

## Alterações Técnicas

### 1. Criar Componente de Exibição de Imagem com Enquadramento

Criarei um componente reutilizável que:
- Mantém o container com proporção 3:2
- Usa `object-contain` para manter proporção original da imagem
- Adiciona fundo com blur da própria imagem (efeito "letterbox" elegante)

```typescript
// Estrutura do componente
<div className="aspect-[3/2] relative overflow-hidden">
  {/* Fundo com blur da imagem */}
  <img 
    src={imageUrl} 
    className="absolute inset-0 w-full h-full object-cover blur-xl scale-110 opacity-50"
    aria-hidden="true"
  />
  {/* Imagem principal centralizada sem corte */}
  <img 
    src={imageUrl} 
    className="relative w-full h-full object-contain"
  />
</div>
```

### 2. Locais de Aplicação

| Local | Arquivo | Descrição |
|-------|---------|-----------|
| Cards da listagem | `Events.tsx` linhas 1068-1075 | Grid de eventos |
| Preview do upload | `Events.tsx` linhas 1199-1228 | Aba Geral do modal |
| Portal público | `PublicEvents.tsx` | Listagem pública |
| Detalhe público | `PublicEventDetail.tsx` | Se aplicável |

### 3. Atualizar Card da Listagem (/admin/eventos)

```typescript
// ANTES (linhas 1068-1075)
{event.image_url ? (
  <div className="aspect-[3/2] w-full">
    <img 
      src={event.image_url} 
      alt={event.name}
      className="w-full h-full object-cover"
    />
  </div>
) : (...placeholder...)}

// DEPOIS - sem corte, com blur de fundo
{event.image_url ? (
  <div className="aspect-[3/2] w-full relative overflow-hidden bg-muted">
    {/* Fundo blur para preencher espaço */}
    <img 
      src={event.image_url} 
      alt=""
      aria-hidden="true"
      className="absolute inset-0 w-full h-full object-cover blur-xl scale-110 opacity-40"
    />
    {/* Imagem principal sem corte */}
    <img 
      src={event.image_url} 
      alt={event.name}
      className="relative w-full h-full object-contain"
    />
  </div>
) : (...placeholder...)}
```

### 4. Atualizar Preview no Modal (aba Geral)

```typescript
// ANTES (linhas 1199-1205)
<div className="relative aspect-[3/2] w-full">
  <img 
    src={form.image_url} 
    alt="Banner do evento" 
    className="w-full h-full object-cover rounded-lg border"
  />
  ...
</div>

// DEPOIS - preview fiel ao resultado final
<div className="relative aspect-[3/2] w-full overflow-hidden rounded-lg border bg-muted">
  {/* Fundo blur */}
  <img 
    src={form.image_url} 
    alt=""
    aria-hidden="true"
    className="absolute inset-0 w-full h-full object-cover blur-xl scale-110 opacity-40"
  />
  {/* Imagem principal sem corte */}
  <img 
    src={form.image_url} 
    alt="Banner do evento" 
    className="relative w-full h-full object-contain"
  />
  {/* Botão remover permanece */}
  {!isReadOnly && (
    <Button type="button" variant="destructive" size="sm" className="absolute top-2 right-2 z-10">
      ...
    </Button>
  )}
</div>
```

### 5. Adicionar Mensagem de Apoio ao Usuário

No texto de orientação do upload:

```typescript
// ANTES (linhas 1292-1297)
<p className="text-xs text-muted-foreground/70 mt-2">
  Imagem do Evento (600 × 400)
</p>
<p className="text-xs text-muted-foreground/70">
  Formato horizontal, proporção 3:2
</p>

// DEPOIS - mensagem mais clara e tranquilizadora
<p className="text-xs text-muted-foreground/70 mt-2">
  Tamanho ideal: 600 × 400 pixels
</p>
<p className="text-xs text-muted-foreground/70">
  A imagem será ajustada automaticamente para o formato padrão sem cortar.
</p>
```

---

## Arquivos a Modificar

| Arquivo | Alterações |
|---------|------------|
| `src/pages/admin/Events.tsx` | Cards da listagem + Preview do upload + Texto de ajuda |
| `src/pages/public/PublicEvents.tsx` | Se houver exibição de imagem (a verificar) |

---

## Comportamento Visual Final

### Imagem proporcional ao frame (ex: 600x400)
- Preenche 100% do container
- Sem blur visível (imagem cobre tudo)

### Imagem mais larga que alta (ex: 1200x400)
- Barras verticais preenchidas com blur
- Imagem centralizada horizontalmente

### Imagem mais alta que larga (ex: 400x600)
- Barras horizontais preenchidas com blur
- Imagem centralizada verticalmente

### Imagem quadrada (ex: 500x500)
- Barras laterais preenchidas com blur
- Imagem centralizada

---

## Critérios de Sucesso

1. Nenhuma imagem é cortada automaticamente
2. Proporções originais são preservadas
3. Imagem sempre centralizada no frame 3:2
4. Espaços vazios preenchidos com blur elegante
5. Preview no modal é fiel ao resultado no card
6. Texto de apoio tranquiliza o usuário
7. Funciona igualmente para imagens horizontais, verticais ou quadradas

