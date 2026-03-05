

# Melhorar Hero da Vitrine — Layout Comercial + CTA

## Mudanças (somente em `src/pages/public/PublicCompanyShowcase.tsx`)

### 1. Título e subtítulo
- **Título**: `"Excursões e eventos com a {empresa}"` (fallback: `"Excursões e eventos"`)
- **Subtítulo**: `"Confira os próximos eventos e garanta sua passagem com segurança."`
- Manter classes condicionais de cor (white para cover_overlay, foreground para outros)

### 2. CTA "Ver eventos disponíveis"
- Botão primário abaixo do subtítulo, com scroll suave até a seção de eventos
- Adicionar `id="todos-eventos"` na section "Todos os eventos" (linha ~366)
- `onClick` faz `document.getElementById('todos-eventos')?.scrollIntoView({ behavior: 'smooth' })`
- Estilo: botão grande, variante com fundo branco semitransparente no modo cover_overlay, ou primary nos outros modos

### 3. CTA secundário "Falar no WhatsApp" (condicional)
- Extrair whatsapp da empresa via `events[0]?.company?.whatsapp` (já vem no select existente, sem nova query)
- Se existir, renderizar botão outline/ghost ao lado do CTA principal com ícone MessageCircle
- Link `https://wa.me/{normalizado}` usando `normalizeWhatsappForWaMe` de `src/lib/whatsapp.ts`
- Se não existir, não renderizar nada

### 4. Layout do conteúdo do hero
- Aumentar `space-y` do container interno para acomodar os botões
- Agrupar os dois botões em um `div flex gap-3 justify-center flex-wrap`

### Arquivos
| Arquivo | Mudança |
|---------|---------|
| `src/pages/public/PublicCompanyShowcase.tsx` | Textos do hero, 2 CTAs, id na section de eventos |

Nenhuma query, state, useEffect ou componente externo é alterado.

