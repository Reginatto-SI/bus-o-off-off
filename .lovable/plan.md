

## Analysis

**Component:** `EventCardFeatured` — used identically in both `/empresa/:slug` (via `PublicCompanyShowcase`) and `/eventos` (via `PublicEvents`), always through `EventsCarousel`. Both contexts share the exact same component and carousel wrapper. There are no divergences to reconcile.

**Root cause:** On mobile, the banner uses `aspect-[4/3]` with all content (category badge, date, title, city, price) overlaid via `absolute bottom-0` positioning inside a relatively short image area. The overlay content competes for vertical space, resulting in the cramped, unprofessional appearance visible in the screenshot. The CTA button sits below the image in a separate `p-3 pt-2` block with minimal padding.

**Desktop is fine** because `aspect-video` (16/9) gives a wide canvas, and the content is laid out horizontally with `sm:flex-row`.

## Plan

### Single file change: `src/components/public/EventCardFeatured.tsx`

1. **Increase mobile banner height** — change `aspect-[4/3]` to `aspect-[3/4]` (portrait orientation), keeping `sm:aspect-video` for desktop. This gives ~33% more vertical space for the overlay content on mobile.

2. **Increase mobile overlay spacing** — change the overlay container's mobile spacing from `space-y-3.5 p-3 pb-4` to `space-y-4 p-4 pb-5`, giving more breathing room between category badge, date+title block, and price.

3. **Improve mobile title size** — bump mobile title from `text-base` to `text-lg` to reinforce the "featured" identity vs common cards.

4. **Increase mobile CTA block padding** — change the below-banner CTA section from `p-3 pt-2` to `p-4 pt-3` for better separation from the image.

5. **Add subtle city styling on mobile** — add a small `MapPin` icon inline with the city text on mobile (currently just plain text) to match the desktop treatment and add visual polish.

No changes to `EventsCarousel`, `EventCard`, desktop layout, or any other file. Both `/empresa/:slug` and `/eventos` will benefit automatically since they share the same component.

