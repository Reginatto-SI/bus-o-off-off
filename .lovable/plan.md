

# Imagem padrão para eventos sem banner

## Mudança

Adicionar uma constante de fallback e usá-la nos 2 componentes de card quando `event.image_url` estiver vazio.

### Constante
```ts
const DEFAULT_EVENT_IMAGE = '/assets/eventos/evento_padrao.png';
```

### Componentes afetados

| Arquivo | Mudança |
|---------|---------|
| `src/components/public/EventCard.tsx` | Calcular `const imageUrl = event.image_url \|\| DEFAULT_EVENT_IMAGE` e usar sempre o branch com imagem (remover o else com ícone Calendar) |
| `src/components/public/EventCardFeatured.tsx` | Mesma lógica: sempre renderizar imagem, usando fallback |

### Lógica simplificada (ambos os cards)

Em vez de `event.image_url ? <img> : <Calendar icon>`, sempre renderizar `<img src={imageUrl}>` com o blur background. O branch sem imagem desaparece.

### Imagem padrão

A imagem `public/assets/eventos/evento_padrao.png` já existe no projeto (`public/assets/vitrine/Img_padrao_vitrine.png` como referência). Será necessário colocar a imagem padrão de evento nesse caminho — ou reutilizar a existente apontando para ela.

Nenhuma alteração de lógica, rota ou fluxo de compra.

