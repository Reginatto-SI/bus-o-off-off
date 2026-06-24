import { toast } from '@/components/ui/use-toast';

interface SharePublicEventParams {
  eventName: string;
  eventPath: string;
}

const SHARE_TEXT = 'Confira este evento disponível para compra.';

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
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(whatsappMessage)}`;
  const whatsappWindow = typeof window !== 'undefined'
    ? window.open(whatsappUrl, '_blank', 'noopener,noreferrer')
    : null;

  if (whatsappWindow) return;

  try {
    await navigator.clipboard.writeText(publicUrl);
    toast({ title: 'Link copiado com sucesso.' });
  } catch {
    toast({ title: 'Não foi possível copiar automaticamente.', variant: 'destructive' });
  }
}
