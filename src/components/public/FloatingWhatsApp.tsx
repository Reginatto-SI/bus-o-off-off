import { WhatsAppIcon } from '@/components/ui/WhatsAppIcon';

const WHATSAPP_NUMBER = '5531987869700';
const WHATSAPP_URL = `https://wa.me/${WHATSAPP_NUMBER}`;

export function FloatingWhatsApp() {
  return (
    <a
      href={WHATSAPP_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Falar pelo WhatsApp"
      className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg transition-transform hover:scale-110 animate-subtle-pulse"
    >
      <WhatsAppIcon size={28} />
    </a>
  );
}
