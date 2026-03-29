# Análise 65 — Categoria real do evento na vitrine pública

## Resumo executivo
Foi identificado que a categoria real do evento (`event_category`) já era persistida corretamente no cadastro de `/admin/eventos`, porém os cards públicos usavam texto fixo de marketing (“Viagem para evento”) em vez do dado real. A correção mínima aplicada substitui o texto fixo por um mapper explícito de categoria (`getEventCategoryLabel`) reutilizado nos cards públicos normal e destaque.

## Causa raiz
- O card público principal (`src/components/public/EventCard.tsx`) renderizava um badge com string hardcoded: **"Viagem para evento"**.
- O card de destaque (`src/components/public/EventCardFeatured.tsx`) não exibia a categoria real; mostrava badge fixo “Evento em destaque”.
- Não existia utilitário compartilhado para transformar `event_category` em label pública.

## Onde a categoria é salva de fato
- Tabela: `public.events`
- Campo: `event_category`
- Tipo no app: `EventCategory = 'evento' | 'excursao' | 'bate_e_volta' | 'viagem' | 'caravana'`
- Constraint no banco: `events_event_category_check` aceitando os mesmos valores (incluindo `caravana` após migration específica).

## Como a categoria é carregada no admin
- Tela: `src/pages/admin/Events.tsx`
- Cadastro/edição usa `form.event_category`.
- Persistência inclui `event_category: form.event_category` no payload de insert/update.
- Reedição carrega `event.event_category` para o form (com fallback de compatibilidade só quando nulo).
- Conclusão: fluxo admin já estava consistente; problema estava no mapper/apresentação pública.

## Como os cards públicos obtinham o rótulo exibido (antes)
- Vitrine pública geral (`src/pages/public/PublicEvents.tsx`) renderiza `EventCard`.
- Vitrine pública da empresa (`src/pages/public/PublicCompanyShowcase.tsx`) renderiza `EventCard` e carrossel com `EventCardFeatured`.
- Desktop e mobile usam os mesmos componentes (varia apenas CSS responsivo).
- `EventCard` usava label hardcoded “Viagem para evento” independentemente de `event.event_category`.

## Texto hardcoded/fallback genérico encontrado
- Local exato: `src/components/public/EventCard.tsx`
- Valor: `Viagem para evento`
- Comportamento anterior: aplicado **sempre**, sem depender de campo vazio.

## Divergência entre dado real e apresentação
Sim. O dado real estava no banco/admin, mas o frontend público ignorava `event.event_category` no badge de categoria.

## Correção aplicada (mínima e segura)
1. Criado utilitário único de mapper:
   - `src/lib/eventCategory.ts`
   - Função `getEventCategoryLabel(category, fallback = 'Evento')`
   - Map explícito: `evento`, `excursao`, `caravana`, `bate_e_volta`, `viagem`
2. Card público principal:
   - `src/components/public/EventCard.tsx`
   - Badge passa a exibir `getEventCategoryLabel(event.event_category)`
3. Card de destaque:
   - `src/components/public/EventCardFeatured.tsx`
   - Badge superior também passa a exibir `getEventCategoryLabel(event.event_category)`

## Comportamento anterior
- Categoria pública não refletia o cadastro admin.
- Exibição genérica mascarava a natureza real do evento.

## Comportamento corrigido
- A categoria exibida em cards públicos passa a refletir diretamente `event.event_category`.
- Regra única compartilhada entre card normal e card destaque.
- Fallback explícito para “Evento” apenas quando categoria não existir.

## Impacto futuro para filtros
A base ficou pronta para filtro por categoria no público porque:
- A origem visual agora usa o mesmo campo real (`event_category`) já persistido no evento.
- Existe mapper centralizado e reutilizável para label, reduzindo divergência futura entre telas.

## Arquivos analisados
- `supabase/migrations/20261028110000_add_events_event_category.sql`
- `supabase/migrations/20260328150000_add_caravana_event_category.sql`
- `src/types/database.ts`
- `src/pages/admin/Events.tsx`
- `src/pages/public/PublicEvents.tsx`
- `src/pages/public/PublicCompanyShowcase.tsx`
- `src/components/public/EventCard.tsx`
- `src/components/public/EventCardFeatured.tsx`
- `src/components/public/EventsCarousel.tsx`

## Arquivos alterados
- `src/lib/eventCategory.ts`
- `src/components/public/EventCard.tsx`
- `src/components/public/EventCardFeatured.tsx`
- `analise-65-categoria-evento-vitrine-publica.md`

## Riscos verificados
- **Baixo risco**: mudança somente de label exibida; sem alteração de query, RLS, pagamento, vendas, rotas ou schema.
- Fallback mantido para eventos antigos com `event_category` nulo.

## Validação manual recomendada
1. Criar/editar evento com categoria **Caravana** e verificar cards públicos: badge = **Caravana**.
2. Repetir para **Excursão**, **Bate e volta**, **Viagem**, **Evento**.
3. Validar em:
   - vitrine pública da empresa
   - vitrine pública geral de eventos
   - card normal e card destaque
   - desktop e mobile
4. Confirmar que continuam corretos:
   - preço
   - data
   - nome do evento
   - CTA
   - empresa
   - localização
