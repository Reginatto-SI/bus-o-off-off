import { useEffect } from 'react';

/** Keep the mobile wizard and its focused field inside the visual viewport. */
export function useMobileSaleViewport(element: HTMLDivElement | null, enabled: boolean) {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!enabled || !element || !viewport) return;
    const content = element.querySelector<HTMLElement>('.new-sale-wizard__scroll > [data-radix-scroll-area-viewport]');
    let frame = 0;
    let focusFrame = 0;
    const revealFocused = () => {
      if (window.innerWidth >= 1024) return;
      const focused = document.activeElement;
      if (!(focused instanceof HTMLElement) || !focused.matches('input, textarea') || !content?.contains(focused)) return;
      const bounds = content.getBoundingClientRect();
      const field = focused.getBoundingClientRect();
      // Move only the content, rather than scrolling the dialog's hidden ancestors.
      if (field.bottom > bounds.bottom - 12) content.scrollTop += field.bottom - bounds.bottom + 12;
      else if (field.top < bounds.top + 12) content.scrollTop += field.top - bounds.top - 12;
    };
    const scheduleFocus = () => {
      cancelAnimationFrame(focusFrame);
      focusFrame = requestAnimationFrame(revealFocused);
    };
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (window.innerWidth >= 1024) {
          element.style.removeProperty('--mobile-sale-height');
          element.style.removeProperty('--mobile-sale-top');
          return;
        }
        element.style.setProperty('--mobile-sale-height', `${viewport.height}px`);
        element.style.setProperty('--mobile-sale-top', `${viewport.offsetTop}px`);
        scheduleFocus();
      });
    };
    // Radix and the browser can finish resizing the scroll area after the viewport event.
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(scheduleFocus);
    if (content) observer?.observe(content);
    update();
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    element.addEventListener('focusin', scheduleFocus);
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(focusFrame);
      observer?.disconnect();
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      element.removeEventListener('focusin', scheduleFocus);
      element.style.removeProperty('--mobile-sale-height');
      element.style.removeProperty('--mobile-sale-top');
    };
  }, [element, enabled]);
}
