import { WhatsAppIcon } from '@/components/ui/WhatsAppIcon';
import { DEFAULT_LANDING_COMMERCIAL_WHATSAPP_URL } from '@/lib/whatsapp';

interface FloatingWhatsAppProps {
  href?: string | null;
}

export function FloatingWhatsApp({ href = DEFAULT_LANDING_COMMERCIAL_WHATSAPP_URL }: FloatingWhatsAppProps) {
  if (!href) return null;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Falar pelo WhatsApp"
      className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg transition-transform hover:scale-110 animate-subtle-pulse"
    >
      <WhatsAppIcon size={28} />
    </a>
  );
}
