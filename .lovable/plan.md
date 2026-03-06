

# Ajuste Visual do Hero da Vitrine Pública

## Mudanças em `src/pages/public/PublicCompanyShowcase.tsx`

### 1. Ícone WhatsApp customizado (SVG inline)
- Criar um pequeno componente SVG inline com o ícone oficial do WhatsApp (path do logo) para substituir `MessageCircle`
- Colocar no próprio arquivo ou em `src/components/ui/WhatsAppIcon.tsx`

### 2. Botão WhatsApp — estilo verde fixo + micro animação
- Remover variantes `outline`/`ghost` condicionais
- Aplicar classes fixas: `bg-[#25D366] text-white hover:bg-[#1DA851] shadow-md hover:shadow-lg transition-all`
- Adicionar animação CSS `animate-subtle-pulse` no `src/index.css` (keyframe de sombra pulsante suave, ~3s infinite)

### 3. Logo em container neutro
- Envolver a `<img>` da logo em um `<div>` com `bg-white rounded-xl p-2 shadow-md inline-block`
- Garante legibilidade para logos com fundo branco/preto/transparente

### 4. Layout mobile — botões empilhados
- Alterar o `div` dos CTAs de `flex gap-3 justify-center flex-wrap` para `flex flex-col sm:flex-row gap-3 justify-center items-center`
- Botões empilham verticalmente no mobile, lado a lado no desktop

### 5. Manter overlay e hierarquia
- Nenhuma mudança no overlay (já funciona)
- Botão "Ver eventos" continua como primário, WhatsApp como secundário verde

### Arquivos
| Arquivo | Mudança |
|---------|---------|
| `src/pages/public/PublicCompanyShowcase.tsx` | Logo container, botão WhatsApp verde, layout flex-col mobile |
| `src/index.css` | Keyframe `animate-subtle-pulse` |

