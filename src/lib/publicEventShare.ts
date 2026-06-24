import { toast } from '@/components/ui/use-toast';

interface SharePublicEventParams {
  eventName: string;
  eventPath: string;
}

const SHARE_TEXT = 'Confira este evento disponível para compra.';

function isMobileOrPwaShareContext() {
  if (typeof window === 'undefined') return false;

  const isStandalonePwa = window.matchMedia?.('(display-mode: standalone)').matches;
  const isIosStandalonePwa = typeof navigator !== 'undefined'
    && Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  const isTouchViewport = window.matchMedia?.('(pointer: coarse)').matches;
  const hasTouchPoints = typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0;
  const isMobileUserAgent = typeof navigator !== 'undefined'
    && /Android|iPhone|iPad|iPod|IEMobile|Opera Mini/i.test(navigator.userAgent);

  return Boolean(isStandalonePwa || isIosStandalonePwa || isTouchViewport || hasTouchPoints || isMobileUserAgent);
}

export function resolvePublicEventShareUrl(eventPath: string) {
  if (!eventPath) return '';

  // Reutiliza a rota pública já usada pela vitrine e apenas adiciona o domínio atual para links externos.
  return typeof window === 'undefined' ? eventPath : new URL(eventPath, window.location.origin).toString();
}

export async function sharePublicEvent({ eventName, eventPath }: SharePublicEventParams) {
  const publicUrl = resolvePublicEventShareUrl(eventPath);

  if (!publicUrl) {
    toast({ title: 'Não foi possível gerar o link deste evento.', variant: 'destructive' });
    return;
  }

  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({
        title: eventName,
        text: SHARE_TEXT,
        url: publicUrl,
      });
      return;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
    }
  }

  const whatsappMessage = `Olá! Confira este evento disponível para compra:\n\n${eventName}\n\nAcesse o link:\n${publicUrl}`;
  const encodedWhatsappMessage = encodeURIComponent(whatsappMessage);
  const whatsappNativeUrl = `whatsapp://send?text=${encodedWhatsappMessage}`;
  const whatsappUrl = `https://wa.me/?text=${encodedWhatsappMessage}`;

  if (typeof window !== 'undefined') {
    if (isMobileOrPwaShareContext()) {
      // Em celular/PWA, tenta primeiro o app nativo; se a tela continuar visível, cai para o link web.
      window.location.href = whatsappNativeUrl;
      window.setTimeout(() => {
        if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
          window.location.href = whatsappUrl;
        }
      }, 800);
      return;
    }

    const whatsappWindow = window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
    if (whatsappWindow) return;
  }

  if (typeof navigator !== 'undefined' && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(publicUrl);
      toast({ title: 'Link copiado com sucesso.' });
      return;
    } catch {
      // O toast abaixo cobre o último fallback real quando WhatsApp e clipboard não resolvem.
    }
  }

  toast({
    title: 'Não foi possível compartilhar automaticamente. Abra o evento e copie o link manualmente.',
    variant: 'destructive',
  });
}
