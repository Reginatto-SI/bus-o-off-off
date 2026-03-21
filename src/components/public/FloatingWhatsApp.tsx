import { WhatsAppIcon } from '@/components/ui/WhatsAppIcon';
import { buildWhatsappWaMeLink } from '@/lib/whatsapp';

const LANDING_WHATSAPP_PHONE = '(31) 99207-4309';
const LANDING_WHATSAPP_MESSAGE = 'Quero começar a vender passagens com o Smartbus BR';
// Comentário de suporte: a landing institucional continua com contato comercial próprio,
// mas a vitrine pública deve injetar o WhatsApp da empresa explicitamente para não misturar contextos.
const DEFAULT_WHATSAPP_URL =
  buildWhatsappWaMeLink({
    phone: LANDING_WHATSAPP_PHONE,
    message: LANDING_WHATSAPP_MESSAGE,
  }) ?? 'https://wa.me/5531992074309?text=Quero%20come%C3%A7ar%20a%20vender%20passagens%20com%20o%20Smartbus%20BR';

interface FloatingWhatsAppProps {
  href?: string | null;
}

export function FloatingWhatsApp({ href = DEFAULT_WHATSAPP_URL }: FloatingWhatsAppProps) {
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
